/**
 * Everything in a fight that ends.
 *
 * `encounter_effects` is one table for a condition with a duration, a named
 * effect (Rage, Bless), and a countdown that belongs to the room. This module
 * owns the rows and the announcements; `campaign/lib/effects.ts` owns the
 * rule of when a thing expires, so that can be asserted without a database.
 *
 * The clock is `advanceTurn` in `session.ts`, which calls `tickEffects` once
 * per turn. A repeated save for a seated hero goes through the Asking — this
 * module hands the prompt back and `session.ts` raises the check, so that
 * `checks.ts` can import `settleEffectSave` from here without the two
 * modules importing each other. A foe's save is rolled here, behind the
 * screen, off the block it was dealt from.
 *
 * A condition row mirrors its key onto the entry (and the sheet) through
 * `conditions.ts` when it is created and takes it off when it expires, so
 * every surface that reads `conditionKeys` today keeps working and gains an
 * expiry for free.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import {
  parseConditions,
  type ConditionKey,
} from '@/@creator/campaign/lib/conditions';
import {
  durationWords,
  effectName,
  MAX_ROUNDS,
  tick,
  type EffectKind,
  type EffectRow,
  type EndsOn,
  type TickMoment,
} from '@/@creator/campaign/lib/effects';
import { abilityModifier, savingThrow } from '@/@creator/character/lib/derive';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type AbilityKey,
  type CharacterSheet,
} from '@/@creator/character/schema';
import {
  parseContentData,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import { rollDie } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignMembers,
  campaignRolls,
  characters,
  encounterEffects,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { writeEntryConditions } from './conditions';
import { resolveContentRefs } from './content';
import { bumpVersion, publish, type Audience } from './live-hub';

type Row = typeof encounterEffects.$inferSelect;
type Entry = typeof initiativeEntries.$inferSelect;

function toRow(r: Row): EffectRow {
  return {
    id: r.id,
    encounterId: r.encounterId,
    entryId: r.entryId,
    kind: r.kind,
    conditionKey: (r.conditionKey as ConditionKey | null) ?? null,
    label: r.label,
    roundsLeft: r.roundsLeft,
    endsOn: r.endsOn,
    anchorEntryId: r.anchorEntryId,
    saveAbility: (r.saveAbility as AbilityKey | null) ?? null,
    saveDc: r.saveDc,
    sourceEntryId: r.sourceEntryId,
    sourceLabel: r.sourceLabel,
    concentration: r.concentration,
    visibility: r.visibility,
    createdAt: r.createdAt,
  };
}

function audienceOf(visibility: 'dm' | 'shared'): Audience {
  return visibility === 'dm' ? 'staff' : 'everyone';
}

/* --- reading ----------------------------------------------------------- */

/**
 * The effects on a fight, oldest first, for the live view.
 *
 * No role check of its own: `getLiveState` has already established the reader
 * belongs at the table and says whether they are staff. A hidden row — a
 * countdown the DM has not announced — is filtered here, not in a component.
 */
export async function listEffects(
  encounterId: string,
  isStaff: boolean
): Promise<EffectRow[]> {
  const rows = await db
    .select()
    .from(encounterEffects)
    .where(eq(encounterEffects.encounterId, encounterId))
    .orderBy(encounterEffects.createdAt);
  return rows.filter(r => isStaff || r.visibility === 'shared').map(toRow);
}

/* --- applying ---------------------------------------------------------- */

export interface EffectInput {
  kind: EffectKind;
  /** For a condition. Must be in the vocabulary. */
  conditionKey?: string | null;
  /** For an effect or a countdown. */
  label?: string;
  /** Rounds. Null or 0 is until removed (until saved, with a save). */
  rounds?: number | null;
  endsOn?: EndsOn;
  /** Whose turn it counts down on. Omitted: the affected entry's own. */
  anchorEntryId?: string | null;
  saveAbility?: string | null;
  saveDc?: number | null;
  sourceEntryId?: string | null;
  sourceLabel?: string;
  concentration?: boolean;
  visibility?: 'dm' | 'shared';
}

async function encounterCampaign(encounterId: string): Promise<string> {
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  return enc.campaignId;
}

function cleanRounds(rounds: number | null | undefined): number | null {
  if (rounds === null || rounds === undefined) return null;
  const n = Math.trunc(rounds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_ROUNDS, n);
}

function cleanSave(input: EffectInput): {
  ability: AbilityKey | null;
  dc: number | null;
} {
  const ability = ABILITY_KEYS.includes(input.saveAbility as AbilityKey)
    ? (input.saveAbility as AbilityKey)
    : null;
  const dc =
    input.saveDc === null || input.saveDc === undefined
      ? null
      : Math.max(1, Math.min(40, Math.trunc(input.saveDc)));
  // Half a save is no save: an ability with no DC could never be passed,
  // and a DC with no ability could never be rolled.
  return ability && dc !== null ? { ability, dc } : { ability: null, dc: null };
}

/**
 * Put one effect on several combatants at once — one call, one row each, one
 * announcement ("Poisoned · Goblin 1, Goblin 2, Goblin 3"). Staff only. The
 * tracker's picker and the board's multi-selection both land here.
 *
 * A countdown belongs to the room and ignores `entryIds`. A condition already
 * on an entry with a clock is *replaced*, so re-applying Hold Person restarts
 * its minute rather than stacking two.
 *
 * Returns the new rows' ids.
 */
export async function applyEffect(
  encounterId: string,
  entryIds: readonly string[],
  input: EffectInput
): Promise<string[]> {
  const campaignId = await encounterCampaign(encounterId);
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const kind = input.kind;
  const visibility = input.visibility ?? 'shared';
  const rounds = cleanRounds(input.rounds);
  const endsOn: EndsOn = input.endsOn === 'start' ? 'start' : 'end';
  const save = cleanSave(input);
  const label = (input.label ?? '').trim().slice(0, 80);
  const sourceLabel = (input.sourceLabel ?? '').trim().slice(0, 80);

  let conditionKey: ConditionKey | null = null;
  if (kind === 'condition') {
    const [key] = parseConditions(input.conditionKey ?? '');
    if (!key) throw new Error('NO_SUCH_CONDITION');
    conditionKey = key;
  } else if (!label) {
    throw new Error('NEEDS_A_NAME');
  }
  // A countdown with no rounds would never come due — it would be a note.
  if (kind === 'countdown' && rounds === null) throw new Error('NEEDS_ROUNDS');

  // Anchor and source must be in this fight, or they are nobody's turn.
  const inFight = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const byId = new Map(inFight.map(e => [e.id, e]));
  const anchorEntryId =
    input.anchorEntryId && byId.has(input.anchorEntryId)
      ? input.anchorEntryId
      : null;
  const sourceEntryId =
    input.sourceEntryId && byId.has(input.sourceEntryId)
      ? input.sourceEntryId
      : null;

  const targets =
    kind === 'countdown'
      ? [null]
      : [...new Set(entryIds)]
          .map(id => byId.get(id))
          .filter((e): e is Entry => e !== undefined);
  if (targets.length === 0) throw new Error('NOBODY_TO_AFFECT');

  const ids: string[] = [];
  for (const entry of targets) {
    if (entry && conditionKey) {
      // Replace, never stack: one clock per condition per combatant.
      await db
        .delete(encounterEffects)
        .where(
          and(
            eq(encounterEffects.entryId, entry.id),
            eq(encounterEffects.kind, 'condition'),
            eq(encounterEffects.conditionKey, conditionKey)
          )
        );
    }
    const [row] = await db
      .insert(encounterEffects)
      .values({
        encounterId,
        entryId: entry?.id ?? null,
        kind,
        conditionKey,
        label,
        roundsLeft: rounds,
        endsOn,
        anchorEntryId,
        saveAbility: save.ability,
        saveDc: save.dc,
        sourceEntryId,
        sourceLabel,
        concentration: input.concentration ?? false,
        visibility,
      })
      .returning({ id: encounterEffects.id });
    ids.push(row.id);

    // The key goes on after the row is in, so the prune that follows every
    // key write finds a clock to keep rather than one to drop.
    if (entry && conditionKey) {
      await writeEntryConditions(entry.id, [
        ...parseConditions(entry.conditionKeys),
        conditionKey,
      ]);
    }
  }

  bumpVersion(campaignId);
  publish(
    campaignId,
    {
      kind: 'effect',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      what: 'applied',
      label: effectName({ kind, conditionKey, label }),
      targets: targets.filter((e): e is Entry => e !== null).map(e => e.label),
      duration: durationWords({
        roundsLeft: rounds,
        saveAbility: save.ability,
        saveDc: save.dc,
      }),
      secret: visibility === 'dm',
    },
    audienceOf(visibility)
  );
  return ids;
}

async function effectRow(effectId: string): Promise<Row> {
  const row = await db.query.encounterEffects.findFirst({
    where: eq(encounterEffects.id, effectId),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row;
}

/**
 * Delete a row and, for a condition, take its key off the entry. The one
 * place a row leaves the table; every expiry below comes through it.
 */
async function dropRow(row: Row): Promise<void> {
  await db.delete(encounterEffects).where(eq(encounterEffects.id, row.id));
  if (row.kind !== 'condition' || !row.entryId || !row.conditionKey) return;
  const entry = await db.query.initiativeEntries.findFirst({
    columns: { conditionKeys: true },
    where: eq(initiativeEntries.id, row.entryId),
  });
  if (!entry) return;
  await writeEntryConditions(
    row.entryId,
    parseConditions(entry.conditionKeys).filter(k => k !== row.conditionKey)
  );
}

/** Take an effect off by hand. Staff only, and quiet: a correction, not a moment. */
export async function removeEffect(effectId: string): Promise<void> {
  const row = await effectRow(effectId);
  const campaignId = await encounterCampaign(row.encounterId);
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await dropRow(row);
  bumpVersion(campaignId);
}

/**
 * Nudge the rounds left on an effect. Staff only, quiet. A DM who miscounted
 * fixes it here rather than removing and re-applying with the source lost.
 * Cannot take a clock to zero — that is `removeEffect`'s job, said plainly.
 */
export async function adjustEffectRounds(
  effectId: string,
  delta: number
): Promise<void> {
  const row = await effectRow(effectId);
  const campaignId = await encounterCampaign(row.encounterId);
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const current = row.roundsLeft ?? 0;
  const next = Math.max(1, Math.min(MAX_ROUNDS, current + Math.trunc(delta)));
  await db
    .update(encounterEffects)
    .set({ roundsLeft: next })
    .where(eq(encounterEffects.id, effectId));
  bumpVersion(campaignId);
}

/* --- the tick ---------------------------------------------------------- */

/** A save the caller must put to a seated hero through the Asking. */
export interface HeroPrompt {
  effectId: string;
  userId: string;
  ability: AbilityKey;
  dc: number;
  /** "Hold Person — Wisdom save to shake it off", for the ask's prompt line. */
  prompt: string;
  /** The row's own visibility decides whether the DC is shown to the target. */
  visibility: 'dm' | 'shared';
}

/**
 * Move the fight's clock one turn and apply what came of it.
 *
 * Expired rows are dropped (a condition's key comes off with it) and
 * announced; a countdown at zero *fires*. A save falling due on a foe is
 * rolled here, behind the screen, off its block; one falling due on a seated
 * hero is handed back for the caller to raise through the Asking, because
 * `checks.ts` imports this module and the reverse would be a cycle.
 *
 * Called by `advanceTurn` under the staff check it already made; there is no
 * role check here.
 */
export async function tickEffects(
  campaignId: string,
  encounterId: string,
  moment: TickMoment,
  byUserId: string
): Promise<HeroPrompt[]> {
  const rows = await db
    .select()
    .from(encounterEffects)
    .where(eq(encounterEffects.encounterId, encounterId));
  if (rows.length === 0) return [];

  const byId = new Map(rows.map(r => [r.id, r]));
  const { remaining, expired, prompts } = tick(rows.map(toRow), moment);

  const entries = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const entryById = new Map(entries.map(e => [e.id, e]));
  const nameOf = (entryId: string | null) =>
    entryId ? (entryById.get(entryId)?.label ?? 'Somebody') : '';

  // Rounds that moved.
  for (const next of remaining) {
    const before = byId.get(next.id);
    if (before && before.roundsLeft !== next.roundsLeft) {
      await db
        .update(encounterEffects)
        .set({ roundsLeft: next.roundsLeft })
        .where(eq(encounterEffects.id, next.id));
    }
  }

  // Ran out.
  for (const gone of expired) {
    const row = byId.get(gone.id);
    if (!row) continue;
    await dropRow(row);
    publish(
      campaignId,
      {
        kind: 'effect',
        id: randomUUID(),
        at: new Date().toISOString(),
        by: byUserId,
        what: gone.kind === 'countdown' ? 'fired' : 'ended',
        label: effectName(gone),
        targets: gone.entryId ? [nameOf(gone.entryId)] : [],
        duration: '',
        secret: gone.visibility === 'dm',
      },
      audienceOf(gone.visibility)
    );
  }

  // Saves falling due.
  const heroPrompts: HeroPrompt[] = [];
  for (const due of prompts) {
    if (!due.entryId || due.saveAbility === null || due.saveDc === null) {
      continue;
    }
    const entry = entryById.get(due.entryId);
    if (!entry) continue;

    const seat = entry.characterId
      ? await db.query.campaignMembers.findFirst({
          columns: { userId: true },
          where: and(
            eq(campaignMembers.campaignId, campaignId),
            eq(campaignMembers.characterId, entry.characterId),
            eq(campaignMembers.status, 'active')
          ),
        })
      : null;

    if (seat) {
      heroPrompts.push({
        effectId: due.id,
        userId: seat.userId,
        ability: due.saveAbility,
        dc: due.saveDc,
        prompt: `${effectName(due)} — ${ABILITY_LABELS[due.saveAbility]} save to shake it off`,
        visibility: due.visibility,
      });
      continue;
    }

    await rollFoeSave(campaignId, entry, due, byUserId);
  }

  if (remaining.length !== rows.length || expired.length > 0) {
    bumpVersion(campaignId);
  }
  return heroPrompts;
}

/**
 * A foe's save bonus: the block's proficient save if it has one, else the
 * modifier off its scores; a seated character with nobody behind the seat
 * rolls off their sheet; a hand-typed "Goblin, AC 15" gets a flat d20.
 */
async function saveBonusFor(
  entry: Entry,
  ability: AbilityKey
): Promise<number> {
  if (entry.characterId) {
    const character = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    if (character)
      return savingThrow(character.sheet as CharacterSheet, ability);
  }
  const ref = entry.creatureRef as ContentRef | null;
  if (!ref) return 0;
  const resolved = await resolveContentRefs([ref]);
  const block = [...resolved.values()][0];
  if (!block) return 0;
  const d = parseContentData('creature', block.data) as CreatureData;
  return (
    d.saving_throws[ability] ?? abilityModifier(d.ability_scores[ability] ?? 10)
  );
}

/**
 * Roll a save for something that has no player, behind the screen.
 *
 * Written straight to `campaign_rolls` as a DM-only row rather than through
 * `rollForCampaign`, which would name the DM as the roller; the log should
 * say the goblin rolled. A pass ends the effect and says so to whoever may
 * see the effect — the roll stays hidden, the outcome does not.
 */
async function rollFoeSave(
  campaignId: string,
  entry: Entry,
  effect: EffectRow,
  byUserId: string
): Promise<void> {
  const ability = effect.saveAbility as AbilityKey;
  const dc = effect.saveDc as number;
  const modifier = await saveBonusFor(entry, ability);
  const die = rollDie(20);
  const total = die + modifier;
  const name = effectName(effect);
  const label = `${ABILITY_LABELS[ability]} save vs ${name}`.slice(0, 80);

  await db.insert(campaignRolls).values({
    campaignId,
    actorUserId: byUserId,
    characterId: entry.characterId ?? null,
    actorName: entry.label,
    label,
    notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
    dice: [die],
    dropped: [] as number[],
    modifier,
    total,
    visibility: 'dm',
  });
  publish(
    campaignId,
    {
      kind: 'roll',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: byUserId,
      actorName: entry.label,
      label: `${label} · DC ${dc}`,
      notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
      total,
      tone: die === 20 ? 'crit' : die === 1 ? 'fumble' : 'plain',
      secret: true,
    },
    'staff'
  );

  if (total >= dc)
    await settleEffectSave(effect.id, true, entry.label, byUserId);
}

/**
 * The verdict on a repeated save. A pass ends the effect and announces it;
 * a fail changes nothing — the rounds keep counting. Called by `answerCheck`
 * for a hero and by `rollFoeSave` above for anything else. Tolerates a row
 * that is already gone: the effect may have run out between the ask and the
 * answer.
 */
export async function settleEffectSave(
  effectId: string,
  passed: boolean,
  actorName: string,
  byUserId: string | null
): Promise<void> {
  if (!passed) return;
  const row = await db.query.encounterEffects.findFirst({
    where: eq(encounterEffects.id, effectId),
  });
  if (!row) return;
  const campaignId = await encounterCampaign(row.encounterId);
  await dropRow(row);
  bumpVersion(campaignId);
  publish(
    campaignId,
    {
      kind: 'effect',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: byUserId,
      what: 'saved',
      label: effectName(toRow(row)),
      targets: [actorName],
      duration: '',
      secret: row.visibility === 'dm',
    },
    audienceOf(row.visibility)
  );
}

/* --- rests ------------------------------------------------------------- */

/**
 * A long rest ends anything measured in rounds on these characters — eight
 * hours outlasts any clock a fight runs on — and leaves "until removed" rows
 * alone, because a curse is not a nap away. One announcement names what
 * lifted. Called by `restParty` under its own staff check.
 */
export async function clearRestedEffects(
  campaignId: string,
  characterIds: readonly string[]
): Promise<string[]> {
  if (characterIds.length === 0) return [];
  const seated = await db
    .select({ id: initiativeEntries.id, label: initiativeEntries.label })
    .from(initiativeEntries)
    .innerJoin(
      initiativeEncounters,
      eq(initiativeEncounters.id, initiativeEntries.encounterId)
    )
    .where(
      and(
        eq(initiativeEncounters.campaignId, campaignId),
        inArray(initiativeEntries.characterId, [...characterIds])
      )
    );
  if (seated.length === 0) return [];
  const labelOf = new Map(seated.map(e => [e.id, e.label]));

  const rows = await db
    .select()
    .from(encounterEffects)
    .where(
      and(
        inArray(
          encounterEffects.entryId,
          seated.map(e => e.id)
        ),
        isNotNull(encounterEffects.roundsLeft)
      )
    );
  if (rows.length === 0) return [];

  const lifted: string[] = [];
  for (const row of rows) {
    await dropRow(row);
    lifted.push(
      `${effectName(toRow(row))} from ${labelOf.get(row.entryId ?? '') ?? 'somebody'}`
    );
  }

  publish(campaignId, {
    kind: 'effect',
    id: randomUUID(),
    at: new Date().toISOString(),
    what: 'cleared',
    label: lifted.join(', '),
    targets: [],
    duration: '',
    secret: false,
  });
  return lifted;
}
