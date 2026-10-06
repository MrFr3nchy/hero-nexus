import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { canonEntries, factionStanding } from '@/db/schema';
import { refKey, type ContentRef } from '@/@shared/content';
import { STAT_KINDS, type CanonKind } from '@/@creator/campaign/lib/canon';
import {
  isAttitude,
  standingRevealLine,
  standingTotals,
  validDelta,
  type Attitude,
  type StandingChange,
} from '@/@creator/campaign/lib/standing';
import { listCampaignContentIds } from './campaign-content';
import { requireCampaignRole } from './campaigns';
import { listCombatantChoices, type CombatantChoice } from './content';
import { addPlanLine, listPlans } from './encounter-plans';
import { revealExcerpt } from './notes';

/**
 * NPCs that can act, and faction standing.
 *
 * Everything here is staff-only. A player reads an NPC through `listCanon`,
 * which nulls the attitude and the stat block, and reads a faction's
 * standing there as the sum of the changes they have been shown.
 */

async function staffForEntry(entryId: string) {
  const entry = await db.query.canonEntries.findFirst({
    where: eq(canonEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const ctx = await requireCampaignRole(entry.campaignId, ['gm', 'co-gm']);
  return { entry, ...ctx };
}

/* --- attitude ---------------------------------------------------------- */

export async function setAttitude(
  entryId: string,
  attitude: Attitude | null
): Promise<void> {
  const { entry } = await staffForEntry(entryId);
  if (entry.kind !== 'npc') throw new Error('NOT_AN_NPC');
  if (attitude !== null && !isAttitude(attitude)) {
    throw new Error('BAD_ATTITUDE');
  }
  await db
    .update(canonEntries)
    .set({ attitude, updatedAt: new Date().toISOString() })
    .where(eq(canonEntries.id, entryId));
}

/* --- the stat block ------------------------------------------------------ */

/**
 * The creatures an NPC may act as at this campaign: the SRD, and homebrew in
 * the campaign's library (content-model rule 6). The DM's own homebrew that
 * is not in play here is left out, because it would resolve as unavailable
 * the moment it was picked.
 */
export async function statChoices(
  campaignId: string
): Promise<CombatantChoice[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const [choices, library] = await Promise.all([
    listCombatantChoices(campaignId),
    listCampaignContentIds(campaignId),
  ]);
  return choices.filter(c => c.ref.source === 'srd' || library.has(c.ref.key));
}

/** Link a stat block by reference — never copied stats — or `null` to unlink. */
export async function setStatBlock(
  entryId: string,
  ref: ContentRef | null
): Promise<void> {
  const { entry } = await staffForEntry(entryId);
  if (!STAT_KINDS.includes(entry.kind as CanonKind)) {
    throw new Error('NOT_AN_NPC');
  }
  if (ref) {
    if (ref.type !== 'creature') throw new Error('NOT_A_CREATURE');
    const choices = await statChoices(entry.campaignId);
    if (!choices.some(c => c.key === refKey(ref))) {
      throw new Error('NOT_IN_PLAY');
    }
  }
  await db
    .update(canonEntries)
    .set({
      statSource: ref?.source ?? null,
      statKey: ref?.key ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(canonEntries.id, entryId));
}

/** The encounters this NPC could be placed in, for the card's picker. */
export async function encounterChoices(
  campaignId: string
): Promise<{ id: string; name: string }[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  return (await listPlans(campaignId)).map(p => ({ id: p.id, name: p.name }));
}

/**
 * Add this NPC to an encounter, as its stat block. `addPlanLine` checks the
 * plan is this DM's and that the ref is a creature; this checks the plan is
 * at the NPC's own campaign, and that the stat block is still in play.
 */
export async function addNpcToEncounter(
  entryId: string,
  planId: string,
  count = 1
): Promise<void> {
  const { entry } = await staffForEntry(entryId);
  if (!entry.statSource || !entry.statKey) throw new Error('NO_STAT_BLOCK');
  const plans = await listPlans(entry.campaignId);
  if (!plans.some(p => p.id === planId)) throw new Error('NOT_FOUND');
  const ref: ContentRef = {
    source: entry.statSource,
    type: 'creature',
    key: entry.statKey,
  };
  if (ref.source === 'homebrew') {
    const library = await listCampaignContentIds(entry.campaignId);
    if (!library.has(ref.key)) throw new Error('NOT_IN_PLAY');
  }
  await addPlanLine(planId, ref, count);
}

/* --- faction standing -------------------------------------------------------- */

async function staffForFaction(entryId: string) {
  const ctx = await staffForEntry(entryId);
  if (ctx.entry.kind !== 'faction') throw new Error('NOT_A_FACTION');
  return ctx;
}

async function changesFor(entryId: string): Promise<StandingChange[]> {
  const rows = await db
    .select()
    .from(factionStanding)
    .where(eq(factionStanding.canonEntryId, entryId))
    .orderBy(asc(factionStanding.createdAt));
  return rows.map(r => ({
    id: r.id,
    delta: r.delta,
    reason: r.reason,
    shown: r.shown,
    createdAt: r.createdAt,
  }));
}

/** Every change, oldest first: "why do the Duskwater hate us" is the point. */
export async function listStanding(entryId: string): Promise<StandingChange[]> {
  await staffForFaction(entryId);
  return changesFor(entryId);
}

/**
 * Record a change. With `show`, it is shown to the party in the same act —
 * one line in Revealed and an announcement, through `revealExcerpt`.
 */
export async function recordStanding(
  entryId: string,
  input: { delta: number; reason: string; show: boolean }
): Promise<void> {
  const { entry } = await staffForFaction(entryId);
  if (!validDelta(input.delta)) throw new Error('BAD_DELTA');
  // Refused before anything is written: a half-done "record and show" would
  // leave a change the DM was told had failed.
  if (input.show && entry.visibility !== 'shared') {
    throw new Error('FACTION_HIDDEN');
  }
  const [row] = await db
    .insert(factionStanding)
    .values({
      campaignId: entry.campaignId,
      canonEntryId: entryId,
      delta: input.delta,
      reason: input.reason.trim().slice(0, 300),
    })
    .returning({ id: factionStanding.id });
  if (input.show) await showStandingChange(row.id);
}

/** Show the party one change. Once shown, it stays shown. */
export async function showStandingChange(changeId: string): Promise<void> {
  const change = await db.query.factionStanding.findFirst({
    where: eq(factionStanding.id, changeId),
  });
  if (!change) throw new Error('NOT_FOUND');
  const { entry } = await staffForFaction(change.canonEntryId);
  if (change.shown) return;
  // The line names the faction. A faction the party has not been shown
  // would be revealed by its own standing.
  if (entry.visibility !== 'shared') throw new Error('FACTION_HIDDEN');

  // Claimed first, so two presses cannot write two lines in Revealed.
  const claimed = await db
    .update(factionStanding)
    .set({ shown: true })
    .where(
      and(eq(factionStanding.id, changeId), eq(factionStanding.shown, false))
    )
    .returning({ id: factionStanding.id });
  if (claimed.length === 0) return;

  const { shown } = standingTotals(await changesFor(entry.id));
  try {
    await revealExcerpt(entry.campaignId, {
      body: standingRevealLine(entry.title, shown, change),
      sourceKind: 'canon',
      sourceId: entry.id,
    });
  } catch (err) {
    // The party was not told; the change must not say it was.
    await db
      .update(factionStanding)
      .set({ shown: false })
      .where(eq(factionStanding.id, changeId));
    throw err;
  }
}

/** Strike a change that was never shown. A shown one is history. */
export async function removeStandingChange(changeId: string): Promise<void> {
  const change = await db.query.factionStanding.findFirst({
    where: eq(factionStanding.id, changeId),
  });
  if (!change) throw new Error('NOT_FOUND');
  await staffForFaction(change.canonEntryId);
  if (change.shown) throw new Error('ALREADY_SHOWN');
  await db.delete(factionStanding).where(eq(factionStanding.id, changeId));
}
