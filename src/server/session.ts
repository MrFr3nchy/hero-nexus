import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { serializeConditions } from '@/@creator/campaign/lib/conditions';
import { abilityModifier } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import { rollDie, rollNotation } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignHandouts,
  campaignMembers,
  campaignRolls,
  characters,
  initiativeEncounters,
  initiativeEntries,
  users,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';

/** How much of the roll log the live view carries. */
const ROLL_LOG_LIMIT = 40;

export interface EncounterRow {
  id: string;
  name: string;
  isActive: boolean;
  round: number;
  turnIndex: number;
}

export type EntrySide = 'party' | 'foe' | 'other';

export interface EntryRow {
  id: string;
  label: string;
  characterId: string | null;
  initiative: number;
  hpCurrent: number | null;
  hpMax: number | null;
  hpTemp: number;
  armorClass: number | null;
  conditions: string;
  conditionKeys: string;
  concentrating: boolean;
  side: EntrySide;
  sort: number;
}

export interface RollRow {
  id: string;
  actorName: string;
  characterId: string | null;
  label: string;
  notation: string;
  dice: number[];
  dropped: number[];
  modifier: number;
  total: number;
  visibility: 'table' | 'dm';
  createdAt: string;
}

export interface HandoutRow {
  id: string;
  kind: 'image' | 'note';
  title: string;
  body: string | null;
  filePath: string | null;
  mime: string | null;
  visibility: 'dm' | 'shared';
  createdAt: string;
}

export interface LiveState {
  role: CampaignRole;
  encounter: EncounterRow | null;
  entries: EntryRow[];
  handouts: HandoutRow[];
  rolls: RollRow[];
  /** The viewer's own linked character, so the tracker can say "your turn". */
  viewerCharacterId: string | null;
}

function orderEntries(rows: EntryRow[]): EntryRow[] {
  return [...rows].sort(
    (a, b) => b.initiative - a.initiative || a.sort - b.sort
  );
}

/**
 * Single call the live-view poller hits. Role-filtered.
 *
 * A player is given foe HP as a word ("Bloodied") by the component, but the
 * numbers still travel — so the exact HP of anything that is not the party's
 * is stripped here instead. The same for DM-only rolls: a roll made behind the
 * screen never reaches a player's browser.
 */
export async function getLiveState(campaignId: string): Promise<LiveState> {
  const { role, userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  const encounter =
    (await db.query.initiativeEncounters.findFirst({
      where: and(
        eq(initiativeEncounters.campaignId, campaignId),
        eq(initiativeEncounters.isActive, true)
      ),
    })) ??
    (await db.query.initiativeEncounters.findFirst({
      where: eq(initiativeEncounters.campaignId, campaignId),
      orderBy: [desc(initiativeEncounters.createdAt)],
    })) ??
    null;

  const rawEntries = encounter
    ? orderEntries(
        (await db
          .select()
          .from(initiativeEntries)
          .where(eq(initiativeEntries.encounterId, encounter.id))) as EntryRow[]
      )
    : [];

  const entries = isStaff
    ? rawEntries
    : rawEntries.map(e =>
        e.side === 'party'
          ? e
          : { ...e, hpCurrent: null, hpMax: null, hpTemp: 0, armorClass: null }
      );

  const handoutRows = (await db
    .select()
    .from(campaignHandouts)
    .where(eq(campaignHandouts.campaignId, campaignId))
    .orderBy(desc(campaignHandouts.createdAt))) as HandoutRow[];

  const handouts = isStaff
    ? handoutRows
    : handoutRows.filter(h => h.visibility === 'shared');

  const rollRows = await db
    .select()
    .from(campaignRolls)
    .where(eq(campaignRolls.campaignId, campaignId))
    .orderBy(desc(campaignRolls.createdAt))
    .limit(ROLL_LOG_LIMIT);

  const rolls: RollRow[] = rollRows
    .filter(r => isStaff || r.visibility === 'table')
    .map(r => ({
      id: r.id,
      actorName: r.actorName,
      characterId: r.characterId,
      label: r.label,
      notation: r.notation,
      dice: (r.dice as number[]) ?? [],
      dropped: (r.dropped as number[]) ?? [],
      modifier: r.modifier,
      total: r.total,
      visibility: r.visibility,
      createdAt: r.createdAt,
    }));

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });

  return {
    role,
    encounter: encounter
      ? {
          id: encounter.id,
          name: encounter.name,
          isActive: encounter.isActive,
          round: encounter.round,
          turnIndex: encounter.turnIndex,
        }
      : null,
    entries,
    handouts,
    rolls,
    viewerCharacterId: membership?.characterId ?? null,
  };
}

/* --- encounter (staff) ------------------------------------------------- */

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

export async function createEncounter(
  campaignId: string,
  name: string
): Promise<string> {
  await staff(campaignId);
  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.campaignId, campaignId));
  const [row] = await db
    .insert(initiativeEncounters)
    .values({ campaignId, name: name.trim() || 'Encounter', isActive: true })
    .returning({ id: initiativeEncounters.id });
  return row.id;
}

async function encounterCampaign(encounterId: string): Promise<string> {
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  return enc.campaignId;
}

export async function endEncounter(encounterId: string): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.id, encounterId));
}

export async function deleteEncounter(encounterId: string): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  await db
    .delete(initiativeEncounters)
    .where(eq(initiativeEncounters.id, encounterId));
}

export async function advanceTurn(
  encounterId: string,
  direction: 1 | -1
): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  const count = (
    await db
      .select({ id: initiativeEntries.id })
      .from(initiativeEntries)
      .where(eq(initiativeEntries.encounterId, encounterId))
  ).length;
  if (count === 0) return;

  let turn = enc.turnIndex + direction;
  let round = enc.round;
  if (turn >= count) {
    turn = 0;
    round += 1;
  } else if (turn < 0) {
    turn = count - 1;
    round = Math.max(1, round - 1);
  }
  await db
    .update(initiativeEncounters)
    .set({ turnIndex: turn, round })
    .where(eq(initiativeEncounters.id, encounterId));
}

/* --- entries (staff) ------------------------------------------------- */

export interface EntryInput {
  label: string;
  characterId?: string | null;
  initiative?: number;
  hpCurrent?: number | null;
  hpMax?: number | null;
  hpTemp?: number;
  armorClass?: number | null;
  conditions?: string;
  conditionKeys?: string;
  concentrating?: boolean;
  side?: EntrySide;
}

/**
 * "Goblin" three times running is three rows a DM cannot tell apart mid-fight.
 * The second one added becomes "Goblin 2" and the first is renamed "Goblin 1",
 * so the numbering is complete rather than starting at the second.
 */
async function numberDuplicates(
  encounterId: string,
  label: string
): Promise<string> {
  const base = label.trim();
  const stripped = base.replace(/\s+\d+$/, '');
  const siblings = await db
    .select({ id: initiativeEntries.id, label: initiativeEntries.label })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));

  const matcher = new RegExp(
    `^${stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\d+)?$`,
    'i'
  );
  const matches = siblings.filter(r => matcher.test(r.label));
  if (matches.length === 0) return base;

  const bare = matches.find(
    r => r.label.toLowerCase() === stripped.toLowerCase()
  );
  if (bare) {
    await db
      .update(initiativeEntries)
      .set({ label: `${stripped} 1` })
      .where(eq(initiativeEntries.id, bare.id));
  }

  const highest = matches.reduce((max, r) => {
    const n = /(\d+)$/.exec(r.label);
    return Math.max(max, n ? Number(n[1]) : 1);
  }, 1);
  return `${stripped} ${highest + 1}`;
}

export async function addEntry(
  encounterId: string,
  input: EntryInput
): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  const existing = await db
    .select({ sort: initiativeEntries.sort })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const nextSort = existing.reduce((max, r) => Math.max(max, r.sort), 0) + 1;

  const label = await numberDuplicates(
    encounterId,
    input.label.trim() || 'Combatant'
  );

  await db.insert(initiativeEntries).values({
    encounterId,
    label,
    characterId: input.characterId ?? null,
    initiative: input.initiative ?? 0,
    hpCurrent: input.hpCurrent ?? null,
    hpMax: input.hpMax ?? null,
    hpTemp: input.hpTemp ?? 0,
    armorClass: input.armorClass ?? null,
    conditions: input.conditions ?? '',
    conditionKeys: input.conditionKeys
      ? serializeConditions(input.conditionKeys.split(','))
      : '',
    concentrating: input.concentrating ?? false,
    side: input.side ?? (input.characterId ? 'party' : 'foe'),
    sort: nextSort,
  });
}

async function entryCampaign(entryId: string): Promise<string> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  return encounterCampaign(entry.encounterId);
}

export async function updateEntry(
  entryId: string,
  patch: Partial<Omit<EntryInput, 'label'>> & { label?: string }
): Promise<void> {
  await staff(await entryCampaign(entryId));
  const set = { ...patch };
  if (set.conditionKeys !== undefined) {
    set.conditionKeys = serializeConditions(set.conditionKeys.split(','));
  }
  await db
    .update(initiativeEntries)
    .set(set)
    .where(eq(initiativeEntries.id, entryId));
}

/**
 * Damage and healing rather than "type the new HP".
 *
 * Temporary hit points absorb damage first and are never restored by healing,
 * and healing stops at the maximum — the three rules a DM would otherwise be
 * applying in their head while five people wait.
 */
export async function applyHp(entryId: string, delta: number): Promise<void> {
  await staff(await entryCampaign(entryId));
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  if (entry.hpCurrent == null) return;

  if (delta < 0) {
    const damage = -delta;
    const fromTemp = Math.min(entry.hpTemp, damage);
    const rest = damage - fromTemp;
    await db
      .update(initiativeEntries)
      .set({
        hpTemp: entry.hpTemp - fromTemp,
        hpCurrent: Math.max(0, entry.hpCurrent - rest),
      })
      .where(eq(initiativeEntries.id, entryId));
    return;
  }

  const ceiling = entry.hpMax ?? entry.hpCurrent + delta;
  await db
    .update(initiativeEntries)
    .set({ hpCurrent: Math.min(ceiling, entry.hpCurrent + delta) })
    .where(eq(initiativeEntries.id, entryId));
}

export async function removeEntry(entryId: string): Promise<void> {
  await staff(await entryCampaign(entryId));
  await db.delete(initiativeEntries).where(eq(initiativeEntries.id, entryId));
}

/**
 * Add every member's linked character, rolling each one's initiative from
 * their own Dexterity and reading AC and HP off the sheet.
 *
 * Rolled here rather than asked for: the numbers are already on the sheets,
 * and a DM typing five initiatives is five chances to mistype one. Anyone
 * already in the fight is skipped so pressing it twice is harmless.
 */
export async function addPartyToEncounter(encounterId: string): Promise<void> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);

  const linked = await db
    .select({
      characterId: campaignMembers.characterId,
      name: characters.name,
      sheet: characters.sheet,
    })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(eq(campaignMembers.campaignId, campaignId));

  const already = new Set(
    (
      await db
        .select({ characterId: initiativeEntries.characterId })
        .from(initiativeEntries)
        .where(eq(initiativeEntries.encounterId, encounterId))
    ).map(r => r.characterId)
  );

  for (const row of linked) {
    if (!row.characterId || already.has(row.characterId)) continue;
    const sheet = row.sheet as CharacterSheet;
    const dexMod = abilityModifier(sheet?.abilities?.dexterity?.score ?? 10);

    await addEntry(encounterId, {
      label: row.name || 'Character',
      characterId: row.characterId,
      side: 'party',
      initiative: rollDie(20) + dexMod,
      armorClass: sheet?.combat?.armorClass ?? null,
      hpMax: sheet?.combat?.hitPointsMax ?? null,
      hpCurrent:
        sheet?.combat?.hitPointsCurrent ?? sheet?.combat?.hitPointsMax ?? null,
      hpTemp: sheet?.combat?.hitPointsTemp ?? 0,
    });
  }
}

/**
 * Roll initiative for everything in the fight that has no number yet and sort
 * the order. Foes get a flat d20 — a DM adding "Goblin" mid-fight has not told
 * the app the goblin's Dexterity, and a made-up modifier is worse than none.
 */
export async function rollInitiative(encounterId: string): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  const rows = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));

  for (const row of rows) {
    if (row.initiative !== 0) continue;
    await db
      .update(initiativeEntries)
      .set({ initiative: rollDie(20) })
      .where(eq(initiativeEntries.id, row.id));
  }

  // Back to the top of the order: the numbers just changed under it.
  await db
    .update(initiativeEncounters)
    .set({ turnIndex: 0 })
    .where(eq(initiativeEncounters.id, encounterId));
}

/* --- the shared roll log --------------------------------------------- */

export interface RollInput {
  notation: string;
  label?: string;
  characterId?: string | null;
  visibility?: 'table' | 'dm';
}

/**
 * Roll dice for the table. Any member may roll; only staff may roll privately,
 * because a player hiding a roll from the DM is not a feature.
 *
 * The dice are rolled here rather than in the browser, so the log records what
 * the dice did instead of what a client said they did.
 */
export async function rollForCampaign(
  campaignId: string,
  input: RollInput
): Promise<void> {
  const { role, userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  const result = rollNotation(input.notation);
  if (!result) throw new Error('BAD_NOTATION');

  let actorName = '';
  let characterId = input.characterId ?? null;

  if (characterId) {
    const character = await db.query.characters.findFirst({
      where: eq(characters.id, characterId),
    });
    // A character someone else owns is not yours to roll as.
    if (!character || character.ownerId !== userId) {
      if (!isStaff) throw new Error('NOT_YOUR_CHARACTER');
      characterId = character ? characterId : null;
    }
    actorName = character?.name ?? '';
  }

  if (!actorName) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    actorName = user?.name || (isStaff ? 'The DM' : 'A player');
  }

  await db.insert(campaignRolls).values({
    campaignId,
    actorUserId: userId,
    characterId,
    actorName,
    label: (input.label ?? '').trim().slice(0, 80),
    notation: result.notation.slice(0, 60),
    dice: result.dice,
    dropped: result.dropped,
    modifier: result.modifier,
    total: result.total,
    visibility: isStaff ? (input.visibility ?? 'table') : 'table',
  });
}

/** Clear the log. Staff only — it is the table's record, not one player's. */
export async function clearRolls(campaignId: string): Promise<void> {
  await staff(campaignId);
  await db
    .delete(campaignRolls)
    .where(eq(campaignRolls.campaignId, campaignId));
}

/* --- handouts ------------------------------------------------------- */

export async function createNote(
  campaignId: string,
  title: string,
  body: string
): Promise<void> {
  const { userId } = await staff(campaignId);
  await db.insert(campaignHandouts).values({
    campaignId,
    kind: 'note',
    title: title.trim(),
    body,
    createdBy: userId,
  });
}

/** Called by the upload route handler after the file is written. */
export async function createImageHandout(
  campaignId: string,
  userId: string,
  filePath: string,
  mime: string,
  title: string
): Promise<void> {
  await db.insert(campaignHandouts).values({
    campaignId,
    kind: 'image',
    title: title.trim(),
    filePath,
    mime,
    createdBy: userId,
  });
}

async function handoutRow(handoutId: string) {
  const row = await db.query.campaignHandouts.findFirst({
    where: eq(campaignHandouts.id, handoutId),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row;
}

export async function setHandoutVisibility(
  handoutId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  const row = await handoutRow(handoutId);
  await staff(row.campaignId);
  await db
    .update(campaignHandouts)
    .set({ visibility })
    .where(eq(campaignHandouts.id, handoutId));
}

export async function deleteHandout(handoutId: string): Promise<string | null> {
  const row = await handoutRow(handoutId);
  await staff(row.campaignId);
  await db.delete(campaignHandouts).where(eq(campaignHandouts.id, handoutId));
  return row.filePath ?? null;
}

/** Used by the file-serving route to authorize a GET. */
export async function canViewHandout(
  handoutId: string
): Promise<
  { ok: true; row: Awaited<ReturnType<typeof handoutRow>> } | { ok: false }
> {
  const row = await handoutRow(handoutId);
  try {
    const { role } = await requireCampaignRole(row.campaignId, [
      'gm',
      'co-gm',
      'player',
    ]);
    const isStaff = role === 'gm' || role === 'co-gm';
    if (!isStaff && row.visibility !== 'shared') return { ok: false };
    return { ok: true, row };
  } catch {
    return { ok: false };
  }
}
