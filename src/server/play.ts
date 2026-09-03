import 'server-only';

import { and, eq } from 'drizzle-orm';

import {
  serializeConditions,
  type ConditionKey,
} from '@/@creator/campaign/lib/conditions';
import {
  abilityModifier,
  passivePerception,
  proficiencyBonus,
  spellAttackBonus,
  spellSaveDC,
} from '@/@creator/character/lib/derive';
import type {
  CharacterSheet,
  SpellSlotLevel,
} from '@/@creator/character/schema';
import { db } from '@/db';
import { campaignMembers, characters, initiativeEntries } from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { requireUserId } from './session-user';

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

  armorClass: number;
  speed: number;
  initiative: number;
  proficiency: number;
  passivePerception: number;
  spellSaveDc: number | null;
  spellAttack: number | null;

  slots: { level: number; total: number; expended: number }[];
  /** Conditions the character is under, from the shared vocabulary. */
  conditions: ConditionKey[];
}

const SLOT_KEYS: SpellSlotLevel[] = [
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
  hpCurrentDelta?: number;
  hpTemp?: number;
  hitDiceSpent?: number;
  deathSaveSuccesses?: number;
  deathSaveFailures?: number;
  /** `{ level: 1..9, expended }` — the whole count, not a delta. */
  slot?: { level: number; expended: number };
  /** Clears both death-save tracks and restores HP to max. */
  longRest?: boolean;
}

function clamp(value: number, min: number, max: number): number {
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
async function authorize(
  characterId: string,
  campaignId: string | null
): Promise<{ character: typeof characters.$inferSelect; canEdit: boolean }> {
  const userId = await requireUserId();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');
  if (character.ownerId === userId) return { character, canEdit: true };

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
  return { character, canEdit: role === 'gm' || role === 'co-gm' };
}

function toPlayState(
  character: typeof characters.$inferSelect,
  canEdit: boolean,
  conditions: ConditionKey[]
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

    armorClass: sheet.combat?.armorClass ?? 10,
    speed: sheet.combat?.speed ?? 30,
    initiative: abilityModifier(sheet.abilities?.dexterity?.score ?? 10),
    proficiency: proficiencyBonus(level),
    passivePerception: passivePerception(sheet),
    spellSaveDc: spellSaveDC(sheet),
    spellAttack: spellAttackBonus(sheet),

    slots: SLOT_KEYS.map((key, i) => ({
      level: i + 1,
      total: sheet.spellcasting?.slots?.[key]?.total ?? 0,
      expended: sheet.spellcasting?.slots?.[key]?.expended ?? 0,
    })).filter(s => s.total > 0),

    conditions,
  };
}

/** Conditions the tracker has this character under, if it is in a fight. */
async function conditionsFor(characterId: string): Promise<ConditionKey[]> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.characterId, characterId),
  });
  if (!entry?.conditionKeys) return [];
  return entry.conditionKeys.split(',').filter(Boolean) as ConditionKey[];
}

export async function getPlayState(
  characterId: string,
  campaignId: string | null
): Promise<PlayState> {
  const { character, canEdit } = await authorize(characterId, campaignId);
  return toPlayState(character, canEdit, await conditionsFor(characterId));
}

/** Every party member's play state, for the DM's view of the table. */
export async function listPartyPlayState(
  campaignId: string
): Promise<PlayState[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  const userId = await requireUserId();

  const rows = await db
    .select({ character: characters })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  return Promise.all(
    rows.map(async r =>
      toPlayState(
        r.character,
        isStaff || r.character.ownerId === userId,
        await conditionsFor(r.character.id)
      )
    )
  );
}

/**
 * Apply a play-mode change to the sheet.
 *
 * HP arrives as a delta rather than a total, so two people pressing "−5" at
 * once costs ten hit points instead of one of them winning. Temp HP absorbs
 * damage first and is never restored by healing, matching the tracker.
 */
export async function applyPlayPatch(
  characterId: string,
  campaignId: string | null,
  patch: PlayPatch
): Promise<PlayState> {
  const { character, canEdit } = await authorize(characterId, campaignId);
  if (!canEdit) throw new Error('FORBIDDEN');

  const sheet = character.sheet as CharacterSheet;
  const combat = { ...sheet.combat };

  if (patch.longRest) {
    combat.hitPointsCurrent = combat.hitPointsMax;
    combat.hitPointsTemp = 0;
    combat.deathSaveSuccesses = 0;
    combat.deathSaveFailures = 0;
    // A long rest returns up to half the character's total hit dice, rounded
    // down, minimum one — 2024 PHB.
    const back = Math.max(1, Math.floor(combat.hitDiceMax / 2));
    combat.hitDiceSpent = Math.max(0, combat.hitDiceSpent - back);
  }

  if (patch.hpCurrentDelta) {
    const delta = patch.hpCurrentDelta;
    if (delta < 0) {
      const damage = -delta;
      const fromTemp = Math.min(combat.hitPointsTemp, damage);
      combat.hitPointsTemp -= fromTemp;
      combat.hitPointsCurrent = Math.max(
        0,
        combat.hitPointsCurrent - (damage - fromTemp)
      );
    } else {
      combat.hitPointsCurrent = Math.min(
        combat.hitPointsMax,
        combat.hitPointsCurrent + delta
      );
    }
  }

  if (patch.hpTemp !== undefined) {
    combat.hitPointsTemp = clamp(patch.hpTemp, 0, 999);
  }
  if (patch.hitDiceSpent !== undefined) {
    combat.hitDiceSpent = clamp(patch.hitDiceSpent, 0, combat.hitDiceMax);
  }
  if (patch.deathSaveSuccesses !== undefined) {
    combat.deathSaveSuccesses = clamp(patch.deathSaveSuccesses, 0, 3);
  }
  if (patch.deathSaveFailures !== undefined) {
    combat.deathSaveFailures = clamp(patch.deathSaveFailures, 0, 3);
  }
  // Being conscious again clears the death-save tracks; leaving them filled is
  // how a table forgets someone already died once this fight.
  if (combat.hitPointsCurrent > 0) {
    combat.deathSaveSuccesses = 0;
    combat.deathSaveFailures = 0;
  }

  const spellcasting = {
    ...sheet.spellcasting,
    slots: { ...sheet.spellcasting.slots },
  };
  if (patch.slot) {
    const key = SLOT_KEYS[patch.slot.level - 1];
    if (key) {
      const current = spellcasting.slots[key];
      spellcasting.slots[key] = {
        ...current,
        expended: clamp(patch.slot.expended, 0, current.total),
      };
    }
  }
  if (patch.longRest) {
    for (const key of SLOT_KEYS) {
      spellcasting.slots[key] = { ...spellcasting.slots[key], expended: 0 };
    }
  }

  const next: CharacterSheet = { ...sheet, combat, spellcasting };

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  // Keep an active tracker row in step, so the DM's initiative list and the
  // player's own sheet never disagree about how hurt someone is.
  await db
    .update(initiativeEntries)
    .set({
      hpCurrent: combat.hitPointsCurrent,
      hpMax: combat.hitPointsMax,
      hpTemp: combat.hitPointsTemp,
      armorClass: combat.armorClass,
    })
    .where(eq(initiativeEntries.characterId, characterId));

  return toPlayState(
    { ...character, sheet: next },
    canEdit,
    await conditionsFor(characterId)
  );
}

/** Set the conditions the tracker has this character under. Staff only. */
export async function setPlayConditions(
  characterId: string,
  campaignId: string,
  keys: string[]
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await db
    .update(initiativeEntries)
    .set({ conditionKeys: serializeConditions(keys) })
    .where(eq(initiativeEntries.characterId, characterId));
}
