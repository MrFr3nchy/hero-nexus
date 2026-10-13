import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { serializeConditions } from '@/@creator/campaign/lib/conditions';
import { abilityModifier } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  parseContentData,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import { rollDie, type NotationRoll } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignMembers,
  characters,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';

import { writeEntryConditions } from '../conditions';

import { applyHpUnchecked } from '../hp';
import type { EntryForm } from '@/@creator/campaign/lib/casting';
import { bumpVersion } from '../live-hub';
import { resolveContentRefs } from '../content';
import {
  LAIR_LABEL,
  legendaryFromBlock,
  normalizeLegendary,
  rechargeFromBlock,
  type Legendary,
  type RechargeMap,
} from '@/@creator/campaign/lib/monsters';
import { recordUndo } from '../undo';
import { MAX_CREATURE_COPIES } from './shared';
import type { EntrySide } from './shared';
import { encounterCampaign, staff } from './encounter';

/**
 * The combatants in the order: adding, editing and removing them, their
 * hit points, and initiative.
 */
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
  creatureRef?: ContentRef | null;
  /** Acts with these others on one turn (11). */
  groupId?: string | null;
  legendary?: Legendary | null;
  /** Abilities that recharge, all ready — written into `turn` (11). */
  recharge?: RechargeMap;
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
): Promise<string> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);
  const existing = await db
    .select({ sort: initiativeEntries.sort })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const nextSort = existing.reduce((max, r) => Math.max(max, r.sort), 0) + 1;

  const label = await numberDuplicates(
    encounterId,
    input.label.trim() || 'Combatant'
  );

  const [row] = await db
    .insert(initiativeEntries)
    .values({
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
      creatureRef: input.creatureRef ?? null,
      groupId: input.groupId ?? null,
      legendary: input.legendary ?? null,
      turn:
        input.recharge && Object.keys(input.recharge).length > 0
          ? { recharge: input.recharge }
          : {},
    })
    .returning({ id: initiativeEntries.id });
  // Coalesced in the hub, so the loops in `addPartyToEncounter` and
  // `addCreaturesToEncounter` cost one nudge between them rather than five.
  bumpVersion(campaignId);
  return row.id;
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
  const campaignId = await entryCampaign(entryId);
  await staff(campaignId);
  const { conditionKeys, ...set } = patch;
  if (Object.keys(set).length > 0) {
    await db
      .update(initiativeEntries)
      .set(set)
      .where(eq(initiativeEntries.id, entryId));
  }
  // Through the one writer, so the sheet behind a seated character follows
  // and a clock behind an unticked condition is dropped with it.
  if (conditionKeys !== undefined) {
    const before = await db.query.initiativeEntries.findFirst({
      columns: { label: true, conditionKeys: true },
      where: eq(initiativeEntries.id, entryId),
    });
    await writeEntryConditions(entryId, conditionKeys.split(','));
    // The DM's undo (11): the keys it carried, put back through the same
    // writer — a clock a row lost stays lost, and the label says so.
    if (before) {
      const keys = before.conditionKeys;
      recordUndo(campaignId, {
        label: `Conditions on ${before.label} back to ${keys || 'none'}`,
        inverse: async () => {
          await writeEntryConditions(entryId, keys ? keys.split(',') : []);
        },
      });
    }
  }
  bumpVersion(campaignId);
}

/**
 * Damage and healing rather than "type the new HP".
 *
 * Temporary hit points absorb damage first and are never restored by healing,
 * and healing stops at the maximum — the three rules a DM would otherwise be
 * applying in their head while five people wait.
 */
export async function applyHp(entryId: string, delta: number): Promise<void> {
  const campaignId = await entryCampaign(entryId);
  await staff(campaignId);
  const before = await snapshotHp(entryId);
  await applyHpUnchecked(entryId, campaignId, delta);
  // The DM's undo (11): what was there, put back — not the opposite delta.
  if (before) {
    recordUndo(campaignId, {
      label: `${delta < 0 ? 'Damage' : 'Heal'} ${before.label} ${
        delta < 0 ? '−' : '+'
      }${Math.abs(Math.trunc(delta))}`,
      inverse: () => restoreHp(before),
    });
  }
}

/**
 * The numbers an HP write can change, read before it — the row, and the
 * sheet behind a seated character — so an undo restores values rather than
 * re-applying a delta somebody else's heal may have moved since.
 */
export interface HpSnapshot {
  entryId: string;
  label: string;
  hpCurrent: number | null;
  hpTemp: number;
  form: EntryForm | null;
  characterId: string | null;
  combat: Pick<
    CharacterSheet['combat'],
    | 'hitPointsCurrent'
    | 'hitPointsTemp'
    | 'deathSaveSuccesses'
    | 'deathSaveFailures'
    | 'stable'
  > | null;
}

export async function snapshotHp(entryId: string): Promise<HpSnapshot | null> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) return null;
  let combat: HpSnapshot['combat'] = null;
  if (entry.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    const sheet = c?.sheet as CharacterSheet | undefined;
    if (sheet) {
      combat = {
        hitPointsCurrent: sheet.combat.hitPointsCurrent,
        hitPointsTemp: sheet.combat.hitPointsTemp,
        deathSaveSuccesses: sheet.combat.deathSaveSuccesses,
        deathSaveFailures: sheet.combat.deathSaveFailures,
        stable: sheet.combat.stable,
      };
    }
  }
  return {
    entryId,
    label: entry.label,
    hpCurrent: entry.hpCurrent,
    hpTemp: entry.hpTemp,
    form: (entry.form as EntryForm | null) ?? null,
    characterId: entry.characterId,
    combat,
  };
}

export async function restoreHp(before: HpSnapshot): Promise<void> {
  await db
    .update(initiativeEntries)
    .set({
      hpCurrent: before.hpCurrent,
      hpTemp: before.hpTemp,
      form: before.form,
    })
    .where(eq(initiativeEntries.id, before.entryId));
  if (before.characterId && before.combat) {
    const c = await db.query.characters.findFirst({
      where: eq(characters.id, before.characterId),
    });
    if (c) {
      const sheet = c.sheet as CharacterSheet;
      await db
        .update(characters)
        .set({
          sheet: { ...sheet, combat: { ...sheet.combat, ...before.combat } },
          updatedAt: new Date().toISOString(),
        })
        .where(eq(characters.id, before.characterId));
    }
  }
}

export { applyHpUnchecked };

export async function removeEntry(entryId: string): Promise<void> {
  const campaignId = await entryCampaign(entryId);
  await staff(campaignId);
  const row = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  await db.delete(initiativeEntries).where(eq(initiativeEntries.id, entryId));
  // The room goes with the dragon (11).
  if (
    row &&
    normalizeLegendary(row.legendary)?.lair &&
    row.label !== LAIR_LABEL
  ) {
    await db
      .delete(initiativeEntries)
      .where(
        and(
          eq(initiativeEntries.encounterId, row.encounterId),
          eq(initiativeEntries.label, LAIR_LABEL)
        )
      );
  }
  bumpVersion(campaignId);
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

/**
 * Put a monster in the fight, with the numbers it already has.
 *
 * A DM adding three goblins was retyping AC 15 and 7 hit points three times
 * from a stat block the app was already holding. The creature is resolved
 * through `resolveContentRefs`, so a homebrew monster in the campaign's
 * library drops in exactly like an SRD one.
 *
 * Initiative is rolled here rather than in the browser, for the same reason
 * the shared roll log is: a number the client produced is a claim about a
 * roll, not a record of one. Each copy rolls separately — three goblins that
 * share one initiative are one goblin with three health bars.
 */
/** Returns the new entries' ids, in the order they were dealt. */
export async function addCreaturesToEncounter(
  encounterId: string,
  ref: ContentRef,
  copies: number,
  opts: { group?: boolean } = {}
): Promise<string[]> {
  await staff(await encounterCampaign(encounterId));
  if (ref.type !== 'creature') throw new Error('NOT_A_CREATURE');

  const resolved = await resolveContentRefs([ref]);
  const entry = [...resolved.values()][0];
  // Its own code, not NOT_FOUND: the campaign and the encounter are both fine,
  // and telling the DM "campaign not found" when a monster is missing sends
  // them looking in the wrong place.
  if (!entry) throw new Error('NO_SUCH_CREATURE');

  const d = parseContentData('creature', entry.data) as CreatureData;
  const count = Math.max(
    1,
    Math.min(MAX_CREATURE_COPIES, Math.trunc(copies) || 1)
  );

  // Six of a thing roll as one by default; one of a thing acts alone (11).
  const grouped = opts.group ?? count > 1;
  const groupId = grouped ? randomUUID() : null;
  const groupRoll = rollDie(20) + d.initiative_bonus;
  const legendary = legendaryFromBlock(d);
  const recharge = rechargeFromBlock(d);

  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(
      await addEntry(encounterId, {
        label: entry.name,
        initiative: grouped ? groupRoll : rollDie(20) + d.initiative_bonus,
        hpCurrent: d.hit_points,
        hpMax: d.hit_points,
        armorClass: d.armor_class,
        side: 'foe',
        creatureRef: ref,
        groupId,
        legendary,
        recharge,
      })
    );
  }
  return ids;
}

/** One combatant's initiative die, for the tray to draw. Staff only. */
export interface InitiativeRoll {
  entryId: string;
  label: string;
  roll: NotationRoll;
}

/**
 * Roll for anyone still at 0. Staff only. The dice come back so the tray
 * can draw them — one group per combatant — rather than the numbers
 * appearing in the order with nothing thrown.
 */
export async function rollInitiative(
  encounterId: string
): Promise<InitiativeRoll[]> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);
  const rows = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));

  const rolled: InitiativeRoll[] = [];
  // One die per group (11): the second goblin takes the first one's face.
  const groupFaces = new Map<string, number>();
  for (const row of rows) {
    if (row.initiative !== 0) continue;
    const face = row.groupId
      ? (groupFaces.get(row.groupId) ?? rollDie(20))
      : rollDie(20);
    if (row.groupId) groupFaces.set(row.groupId, face);
    await db
      .update(initiativeEntries)
      .set({ initiative: face })
      .where(eq(initiativeEntries.id, row.id));
    rolled.push({
      entryId: row.id,
      label: row.label,
      roll: {
        notation: '1d20',
        dice: [face],
        dropped: [],
        modifier: 0,
        total: face,
      },
    });
  }

  // Back to the top of the order: the numbers just changed under it.
  await db
    .update(initiativeEncounters)
    .set({ turnIndex: 0 })
    .where(eq(initiativeEncounters.id, encounterId));
  bumpVersion(campaignId);
  return rolled;
}
