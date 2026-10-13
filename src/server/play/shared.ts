import 'server-only';
import { and, eq } from 'drizzle-orm';
import {
  parseConditions,
  type ConditionKey,
} from '@/@creator/campaign/lib/conditions';
import {
  d20PenaltyFor,
  speedFor,
} from '@/@creator/campaign/lib/condition-effects';
import { dyingState, type DyingState } from '@/@creator/character/lib/dying';
import {
  abilityModifier,
  jumpDistances,
  type Encumbrance,
  type JumpDistances,
  passivePerception,
  proficiencyBonus,
  spellAttackBonus,
  spellSaveDC,
} from '@/@creator/character/lib/derive';
import {
  type CharacterSheet,
  type SpellSlotLevel,
} from '@/@creator/character/schema';

import { randomUUID } from 'node:crypto';
import {
  sheetBonuses,
  type SheetBonuses,
} from '@/@creator/campaign/lib/sheet-rolls';
import { db } from '@/db';
import { campaignMembers, characters, initiativeEntries } from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from '../campaigns';
import { publish } from '../live-hub';
import { loadFor } from '../load';
import { effectiveRules } from '../table-rules';
import { physicalDiceAllowed } from '@/@creator/campaign/lib/table-rules';
import { xpStanding } from '@/@creator/character/lib/advancement';
import { requireUserId } from '../session-user';
import { COIN_KEYS } from './loadout';

/**
 * The at-the-table state of one character.
 *
 * A player mid-fight needs to spend a hit die, mark a slot, take damage and
 * tick a death save. Before this, all four meant opening the character
 * *builder* — a full editing form — while four other people waited. This is
 * deliberately a narrow surface: it can move the numbers that change during
 * play and nothing else. Class, level and ability scores are not editable
 * here, and no history row is written for a hit point, because a log with one
 * row per point of damage is not a log anyone reads.
 */
export interface PlayState {
  characterId: string;
  name: string;
  className: string;
  species: string;
  level: number;
  /** Whether the viewer may change these numbers. */
  canEdit: boolean;

  hpCurrent: number;
  hpMax: number;
  hpTemp: number;
  hitDiceMax: number;
  hitDiceSpent: number;
  hitDieSize: number;
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  /** 0–6. Six is death, which is why it is a number and not a chip. */
  exhaustion: number;
  /** Stabilised at 0 hit points — see `combat.stable` on the sheet. */
  stable: boolean;
  /** alive / dying / stable / dead, derived once here so no surface re-derives it. */
  dying: DyingState;

  armorClass: number;
  /** Off the sheet, before conditions and exhaustion. */
  speed: number;
  /**
   * What the character can actually walk this turn: `speedFor` over the
   * conditions and exhaustion. The board lights this many feet; the card
   * shows the arithmetic beside the sheet's number.
   */
  effectiveSpeed: number;
  /** 2024 exhaustion: −2 per level on every d20 test. Zero when rested. */
  d20Penalty: number;
  /**
   * What the pack weighs against what the hero can carry (09), under the
   * table's encumbrance rule. Null when the table does not weigh — nothing
   * computed, nothing shown. `effectiveSpeed` already has it folded in.
   */
  weight: Encumbrance | null;
  /** The book's jump distances, off Strength (09). */
  jump: JumpDistances;
  initiative: number;
  proficiency: number;
  passivePerception: number;
  /**
   * What each ability, save and skill adds to a d20, off the sheet — the
   * numbers *Roll from your sheet* prints. The server rolls with the same
   * function (`sheetRollBonus`), so the button and the log agree.
   */
  bonuses: SheetBonuses;
  spellSaveDc: number | null;
  spellAttack: number | null;

  slots: { level: number; total: number; expended: number }[];
  /** Conditions the character is under, from the shared vocabulary. */
  conditions: ConditionKey[];
  /**
   * Whether this viewer may type the faces off real dice for this
   * character: the table's `physicalDice` rule, staff always, and a sheet
   * at nobody's table always — there is no rule to read there.
   */
  physicalDice: boolean;
  /**
   * A fingerprint of what is carried — every inventory row's id, count and
   * whether it is in hand, and the purse. Not for reading; for noticing. The
   * attacks panel re-prices the weapons when this moves, which armour class
   * alone did not catch (drawing a longbow changes what you can swing and not
   * what you wear), and the hero panel re-reads the loadout, which is how a
   * potion somebody handed you appears without a remount.
   */
  loadoutKey: string;
  /** Holding Heroic Inspiration (10). One at a time. */
  heroicInspiration: boolean;
  /** The road's tally (10): days without, hours awake. Zero when not tracked. */
  survival: {
    daysWithoutFood: number;
    daysWithoutWater: number;
    hoursAwake: number;
  };
  /** Rations carried, by name — what the day tick will eat. */
  rations: number;
  /**
   * Experience has outrun the level on the sheet (10): the level it earns,
   * or null. Derived from `identity.xp` against the advancement table, never
   * stored — the builder's save is what clears it.
   */
  levelEarned: number | null;
}

/**
 * Tell the table that somebody's state of health crossed a line.
 *
 * Only the crossings, never the numbers in between. A cleric spending a hit
 * die is a change the party panel shows; going down at 0 is a moment the whole
 * table should look up for, and the difference between those two is the whole
 * of what this function decides.
 *
 * `before` and `after` are the dying states either side of the write, so a hit
 * that takes somebody from 3 hit points to 0 announces once and a second hit
 * while they are already down does not announce again.
 */
export function announceVitals(
  campaignId: string | null,
  character: { id: string; name: string },
  before: DyingState,
  after: DyingState
): void {
  if (!campaignId || before === after) return;

  const state =
    after === 'dead'
      ? 'dead'
      : after === 'dying'
        ? 'down'
        : after === 'stable'
          ? 'stable'
          : 'up';

  // Coming round from stable to conscious is not news the table needs shouted
  // at it; every other crossing is.
  if (state === 'up' && before === 'stable') return;

  publish(campaignId, {
    kind: 'vitals',
    id: randomUUID(),
    at: new Date().toISOString(),
    // Deliberately not set: this is the one announcement whose subject is the
    // reader as often as not, and a player whose character just went down
    // should be told as loudly as everybody else.
    by: null,
    characterName: character.name || 'Somebody',
    characterId: character.id,
    state,
  });
}

export const SLOT_KEYS: SpellSlotLevel[] = [
  'level1',
  'level2',
  'level3',
  'level4',
  'level5',
  'level6',
  'level7',
  'level8',
  'level9',
];

/** The patch a play-mode control may send. Every field is optional. */
export interface PlayPatch {
  /**
   * The damage in `hpCurrentDelta` was a critical hit.
   *
   * Only means anything to a character at 0 hit points, where a crit is two
   * death-save failures rather than one. Without it the caller cannot say
   * which kind of hit it was and the sheet quietly under-counts.
   */
  critical?: boolean;
  hpCurrentDelta?: number;
  hpTemp?: number;
  hitDiceSpent?: number;
  deathSaveSuccesses?: number;
  deathSaveFailures?: number;
  /** `{ level: 1..9, expended }` — the whole count, not a delta. */
  slot?: { level: number; expended: number };
  /** Clears both death-save tracks and restores HP to max. */
  longRest?: boolean;
  /** Up or down one level of exhaustion at a time. */
  exhaustionDelta?: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Who may move a character's numbers: its owner, and the staff of a campaign
 * it is linked to.
 *
 * The DM is included on purpose — half of "eleven damage" at a real table is
 * called out by the DM while the player is still finding the tab, and a DM
 * who can see the sheet but not touch it ends up keeping a second copy.
 */
export async function authorize(
  characterId: string,
  campaignId: string | null
): Promise<{
  character: typeof characters.$inferSelect;
  canEdit: boolean;
  /** Staff of the named campaign, so a rules refusal knows who may overrule it. */
  isStaff: boolean;
}> {
  const userId = await requireUserId();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');
  if (character.ownerId === userId) {
    // The owner may be the DM playing at their own table. Staff status is
    // what lets them rule past a refusal on their own sheet; a player at
    // somebody else's table, or a character at no table, gets no ruling.
    const role = campaignId ? await roleAt(campaignId) : null;
    return {
      character,
      canEdit: true,
      isStaff: role === 'gm' || role === 'co-gm',
    };
  }

  if (!campaignId) throw new Error('FORBIDDEN');

  const link = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId)
    ),
  });
  if (!link) throw new Error('FORBIDDEN');

  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  return { character, canEdit: isStaff, isStaff };
}

/** The caller's role at a campaign, or null when they are not a member. */
async function roleAt(campaignId: string): Promise<CampaignRole | null> {
  try {
    const { role } = await requireCampaignRole(campaignId, [
      'gm',
      'co-gm',
      'player',
    ]);
    return role;
  } catch {
    return null;
  }
}

/** Whether faces off real dice may be handed over for a sheet at this table. */
export async function physicalFor(
  campaignId: string | null,
  isStaff: boolean
): Promise<boolean> {
  if (!campaignId) return true;
  return physicalDiceAllowed(await effectiveRules(campaignId), isStaff);
}

/**
 * The state of one character: conditions from the sheet and the fight,
 * the load weighed under the table's rule, whether this viewer may hand
 * over real dice, then the arithmetic.
 */
export async function playStateOf(
  character: typeof characters.$inferSelect,
  canEdit: boolean,
  campaignId: string | null,
  isStaff: boolean
): Promise<PlayState> {
  const [conditions, weight, physicalDice] = await Promise.all([
    conditionsFor(character.id),
    loadFor(character.sheet as CharacterSheet, campaignId),
    physicalFor(campaignId, isStaff),
  ]);
  return toPlayState(character, canEdit, conditions, weight, physicalDice);
}

export function toPlayState(
  character: typeof characters.$inferSelect,
  canEdit: boolean,
  conditions: ConditionKey[],
  weight: Encumbrance | null,
  physicalDice = false
): PlayState {
  const sheet = character.sheet as CharacterSheet;
  const level = sheet.identity?.level ?? 1;

  return {
    characterId: character.id,
    name: character.name,
    className: sheet.identity?.class ?? '',
    species: sheet.identity?.species ?? '',
    level,
    canEdit,

    hpCurrent: sheet.combat?.hitPointsCurrent ?? 0,
    hpMax: sheet.combat?.hitPointsMax ?? 0,
    hpTemp: sheet.combat?.hitPointsTemp ?? 0,
    hitDiceMax: sheet.combat?.hitDiceMax ?? 0,
    hitDiceSpent: sheet.combat?.hitDiceSpent ?? 0,
    hitDieSize: sheet.combat?.hitDieSize ?? 8,
    deathSaveSuccesses: sheet.combat?.deathSaveSuccesses ?? 0,
    deathSaveFailures: sheet.combat?.deathSaveFailures ?? 0,
    exhaustion: sheet.combat?.exhaustion ?? 0,

    armorClass: sheet.combat?.armorClass ?? 10,
    speed: sheet.combat?.speed ?? 30,
    effectiveSpeed: speedFor(
      sheet.combat?.speed ?? 30,
      conditions,
      sheet.combat?.exhaustion ?? 0,
      weight
    ),
    d20Penalty: d20PenaltyFor(sheet.combat?.exhaustion ?? 0),
    weight,
    jump: jumpDistances(sheet),
    initiative: abilityModifier(sheet.abilities?.dexterity?.score ?? 10),
    proficiency: proficiencyBonus(level),
    passivePerception: passivePerception(sheet),
    bonuses: sheetBonuses(sheet),
    spellSaveDc: spellSaveDC(sheet),
    spellAttack: spellAttackBonus(sheet),

    slots: SLOT_KEYS.map((key, i) => ({
      level: i + 1,
      total: sheet.spellcasting?.slots?.[key]?.total ?? 0,
      expended: sheet.spellcasting?.slots?.[key]?.expended ?? 0,
    })).filter(s => s.total > 0),

    conditions,
    physicalDice,
    stable: sheet.combat?.stable ?? false,
    dying: dyingState(sheet.combat?.hitPointsCurrent ?? 0, {
      successes: sheet.combat?.deathSaveSuccesses ?? 0,
      failures: sheet.combat?.deathSaveFailures ?? 0,
      stable: sheet.combat?.stable ?? false,
    }),
    loadoutKey: [
      ...(sheet.inventory ?? []).map(
        i => `${i.id}:${i.quantity}:${i.equipped ? 1 : 0}`
      ),
      COIN_KEYS.map(k => sheet.currency?.[k] ?? 0).join(':'),
    ].join('|'),
    heroicInspiration: sheet.combat?.heroicInspiration ?? false,
    survival: {
      daysWithoutFood: sheet.survival?.daysWithoutFood ?? 0,
      daysWithoutWater: sheet.survival?.daysWithoutWater ?? 0,
      hoursAwake: sheet.survival?.hoursAwake ?? 0,
    },
    rations: (sheet.inventory ?? [])
      .filter(i => /\bration/i.test(i.name))
      .reduce((n, i) => n + i.quantity, 0),
    levelEarned: (() => {
      const standing = xpStanding(sheet.identity?.xp ?? 0, level);
      return standing.canLevel ? standing.earnedLevel : null;
    })(),
  };
}

/**
 * What this character is currently under.
 *
 * The sheet is the truth, and an active encounter row is a mirror of it. It
 * used to be the other way round — the only home was `initiative_entries`, a
 * row that exists for the duration of one fight — so a condition applied
 * outside combat had nowhere to live and one applied inside it vanished when
 * the encounter ended.
 *
 * The tracker row is still read, and unioned in, for the one case the sheet
 * cannot cover: a DM marking someone Prone mid-fight through the tracker,
 * whose write lands on the row. `setPlayConditions` writes both, so the two
 * only differ for as long as it takes that call to run.
 */
export async function conditionsFor(
  characterId: string
): Promise<ConditionKey[]> {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
    columns: { sheet: true },
  });
  const onSheet = ((character?.sheet as CharacterSheet | undefined)?.combat
    ?.conditions ?? []) as string[];

  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.characterId, characterId),
  });
  const inFight = entry?.conditionKeys
    ? entry.conditionKeys.split(',').filter(Boolean)
    : [];

  // Filtered through the vocabulary so the order is stable and a retired key
  // cannot reach a chip that has no definition for it.
  return parseConditions([...onSheet, ...inFight].join(','));
}
