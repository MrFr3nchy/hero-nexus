import 'server-only';

import { and, eq } from 'drizzle-orm';

import {
  serializeConditions,
  type ConditionKey,
} from '@/@creator/campaign/lib/conditions';
import {
  abilityModifier,
  armorClass,
  passivePerception,
  proficiencyBonus,
  spellAttackBonus,
  spellSaveDC,
} from '@/@creator/character/lib/derive';
import {
  MAX_ATTUNED,
  type CharacterSheet,
  type SpellSlotLevel,
} from '@/@creator/character/schema';
import { parseContentData, refKey } from '@/@shared/content';
import { rollDie } from '@/@shared/lib/dice';
import { resolveContentRefs } from './content';
import { db } from '@/db';
import {
  campaignMembers,
  campaignRolls,
  characters,
  initiativeEntries,
} from '@/db/schema';
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
  /** 0–6. Six is death, which is why it is a number and not a chip. */
  exhaustion: number;

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
  /** Up or down one level of exhaustion at a time. */
  exhaustionDelta?: number;
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
    exhaustion: sheet.combat?.exhaustion ?? 0,

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
    // And it removes one level of exhaustion. Forgetting this is how a party
    // carries a −2 on every roll for three sessions without noticing.
    combat.exhaustion = Math.max(0, (combat.exhaustion ?? 0) - 1);
  }

  if (patch.exhaustionDelta) {
    combat.exhaustion = clamp(
      (combat.exhaustion ?? 0) + patch.exhaustionDelta,
      0,
      6
    );
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

/* ------------------------------------------------------------------ *
 * The loadout — what is in hand and what is prepared today
 * ------------------------------------------------------------------ */

/**
 * One inventory row, as play mode needs it.
 *
 * Deliberately not the whole `InventoryItem`: play mode toggles what is in
 * hand, it does not edit the line. Adding a longsword to your pack is a
 * builder job — you do it between sessions — while drawing the one you are
 * already carrying is a table job, and the difference is what keeps this
 * surface safe to hand someone mid-fight.
 */
export interface LoadoutItem {
  id: string;
  name: string;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  /** Whether the content behind it says attunement is required. */
  requiresAttunement: boolean;
}

/** One spell, as play mode needs it. */
export interface LoadoutSpell {
  /** `refKey(ref)` — the type-carrying key, never the bare slug. */
  key: string;
  name: string;
  level: number;
  prepared: boolean;
  alwaysPrepared: boolean;
}

export interface PlayLoadout {
  canEdit: boolean;
  items: LoadoutItem[];
  spells: LoadoutSpell[];
  attunedCount: number;
  maxAttuned: number;
}

/** What a loadout control may change. One toggle per call. */
export interface LoadoutPatch {
  equip?: { itemId: string; equipped: boolean };
  attune?: { itemId: string; attuned: boolean };
  prepare?: { key: string; prepared: boolean };
}

/**
 * The character's gear and spell list, with the content behind each row
 * resolved so attunement and spell level are known.
 */
export async function getPlayLoadout(
  characterId: string,
  campaignId: string | null
): Promise<PlayLoadout> {
  const { character, canEdit } = await authorize(characterId, campaignId);
  const sheet = character.sheet as CharacterSheet;

  const refs = [
    ...sheet.inventory.map(i => i.ref).filter(r => r !== null),
    ...sheet.spellcasting.spells.map(s => s.ref),
  ];
  const resolved = await resolveContentRefs(refs);

  return {
    canEdit,
    maxAttuned: MAX_ATTUNED,
    attunedCount: sheet.inventory.filter(i => i.attuned).length,
    items: sheet.inventory.map(item => {
      const entry = item.ref ? resolved.get(refKey(item.ref)) : undefined;
      const data =
        entry && entry.type === 'item'
          ? parseContentData('item', entry.data)
          : null;
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        equipped: item.equipped,
        attuned: item.attuned,
        requiresAttunement: Boolean(data?.requires_attunement),
      };
    }),
    spells: sheet.spellcasting.spells.map(spell => {
      const entry = resolved.get(refKey(spell.ref));
      const data =
        entry && entry.type === 'spell'
          ? parseContentData('spell', entry.data)
          : null;
      return {
        key: refKey(spell.ref),
        name: spell.ref.name,
        // An unresolved spell reports level -1 rather than 0, so it sorts to
        // its own group instead of masquerading as a cantrip.
        level: data ? data.level : -1,
        prepared: spell.prepared,
        alwaysPrepared: spell.alwaysPrepared,
      };
    }),
  };
}

/**
 * Toggle one thing in the loadout.
 *
 * Writes straight through, like every other play control — there is no save
 * button at a table. The attunement cap is enforced here rather than trusted
 * to the control, because the control is the thing an over-attuned sheet gets
 * past.
 */
export async function applyLoadoutPatch(
  characterId: string,
  campaignId: string | null,
  patch: LoadoutPatch
): Promise<PlayLoadout> {
  const { character, canEdit } = await authorize(characterId, campaignId);
  if (!canEdit) throw new Error('FORBIDDEN');

  const sheet = character.sheet as CharacterSheet;
  let inventory = sheet.inventory;
  let spells = sheet.spellcasting.spells;

  if (patch.equip) {
    const { itemId, equipped } = patch.equip;
    inventory = inventory.map(i => (i.id === itemId ? { ...i, equipped } : i));
  }

  if (patch.attune) {
    const { itemId, attuned } = patch.attune;
    if (attuned) {
      const already = inventory.filter(
        i => i.attuned && i.id !== itemId
      ).length;
      if (already >= MAX_ATTUNED) throw new Error('ATTUNEMENT_FULL');
    }
    inventory = inventory.map(i => (i.id === itemId ? { ...i, attuned } : i));
  }

  if (patch.prepare) {
    const { key, prepared } = patch.prepare;
    spells = spells.map(s =>
      refKey(s.ref) === key && !s.alwaysPrepared ? { ...s, prepared } : s
    );
  }

  const next: CharacterSheet = {
    ...sheet,
    inventory,
    spellcasting: { ...sheet.spellcasting, spells },
  };

  // Armour class follows what is worn, so equipping a shield has to move it —
  // otherwise the sheet says 16 while the tracker says 14 and the DM believes
  // the tracker.
  const resolved = await resolveContentRefs(
    inventory.map(i => i.ref).filter(r => r !== null)
  );
  next.combat = { ...next.combat, armorClass: armorClass(next, resolved) };

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  await db
    .update(initiativeEntries)
    .set({ armorClass: next.combat.armorClass })
    .where(eq(initiativeEntries.characterId, characterId));

  return getPlayLoadout(characterId, campaignId);
}

/**
 * Spend hit dice on a short rest.
 *
 * The dice are rolled **on the server** and written to the shared roll log, so
 * the table watches a rogue roll 3 and 2 on their d8s rather than being told a
 * number. That is the same rule `campaign_rolls` exists for: a total the
 * browser produced is a claim about a roll, not a record of one.
 *
 * Each die heals its roll plus the character's Constitution modifier, never
 * below zero for that die — a Con of 6 costs you nothing extra, it just stops
 * helping (2024 PHB).
 */
export async function spendHitDice(
  characterId: string,
  campaignId: string | null,
  count: number
): Promise<PlayState> {
  const { character, canEdit } = await authorize(characterId, campaignId);
  if (!canEdit) throw new Error('FORBIDDEN');

  const sheet = character.sheet as CharacterSheet;
  const combat = { ...sheet.combat };

  const available = Math.max(0, combat.hitDiceMax - combat.hitDiceSpent);
  const spending = Math.max(0, Math.min(available, Math.trunc(count) || 0));
  if (spending === 0) throw new Error('NO_HIT_DICE');

  const conMod = abilityModifier(sheet.abilities?.constitution?.score ?? 10);
  const size = combat.hitDieSize || 8;

  const dice: number[] = [];
  let healed = 0;
  for (let i = 0; i < spending; i++) {
    const roll = rollDie(size);
    dice.push(roll);
    healed += Math.max(0, roll + conMod);
  }

  combat.hitDiceSpent = combat.hitDiceSpent + spending;
  combat.hitPointsCurrent = Math.min(
    combat.hitPointsMax,
    combat.hitPointsCurrent + healed
  );
  // Back on your feet, so the death-save tracks go — the same rule the rest of
  // the play patch follows.
  if (combat.hitPointsCurrent > 0) {
    combat.deathSaveSuccesses = 0;
    combat.deathSaveFailures = 0;
  }

  const next: CharacterSheet = { ...sheet, combat };

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  await db
    .update(initiativeEntries)
    .set({
      hpCurrent: combat.hitPointsCurrent,
      hpMax: combat.hitPointsMax,
      hpTemp: combat.hitPointsTemp,
    })
    .where(eq(initiativeEntries.characterId, characterId));

  if (campaignId) {
    await db.insert(campaignRolls).values({
      campaignId,
      actorUserId: character.ownerId,
      characterId,
      actorName: character.name,
      label: `Short rest — ${spending} hit di${spending === 1 ? 'e' : 'ce'}`,
      notation: `${spending}d${size}${conMod >= 0 ? '+' : ''}${conMod * spending}`,
      dice,
      dropped: [],
      modifier: conMod * spending,
      total: healed,
      visibility: 'table',
    });
  }

  return toPlayState(
    { ...character, sheet: next },
    canEdit,
    await conditionsFor(characterId)
  );
}

/**
 * Rest the whole party.
 *
 * A DM saying "you take a long rest" is one sentence at the table and was five
 * separate presses here, one per sheet, with the fifth forgotten. Staff only,
 * because it moves everybody's numbers.
 *
 * A short rest here does *not* spend anyone's hit dice: how many to burn is
 * each player's own decision, and spending them for somebody is the one part
 * of a rest that is not the DM's call.
 */
export async function restParty(
  campaignId: string,
  kind: 'short' | 'long'
): Promise<number> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);

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

  let rested = 0;
  for (const row of rows) {
    const sheet = row.character.sheet as CharacterSheet;
    const combat = { ...sheet.combat };
    const spellcasting = {
      ...sheet.spellcasting,
      slots: { ...sheet.spellcasting.slots },
    };

    if (kind === 'long') {
      combat.hitPointsCurrent = combat.hitPointsMax;
      combat.hitPointsTemp = 0;
      combat.deathSaveSuccesses = 0;
      combat.deathSaveFailures = 0;
      combat.hitDiceSpent = Math.max(
        0,
        combat.hitDiceSpent - Math.max(1, Math.floor(combat.hitDiceMax / 2))
      );
      combat.exhaustion = Math.max(0, (combat.exhaustion ?? 0) - 1);
      for (const key of SLOT_KEYS) {
        spellcasting.slots[key] = { ...spellcasting.slots[key], expended: 0 };
      }
    } else {
      // A short rest restores temporary hit points to nobody and slots to
      // nobody: what it actually clears is the fight, and the hit dice are
      // spent by their owners.
      combat.hitPointsTemp = 0;
    }

    const next: CharacterSheet = { ...sheet, combat, spellcasting };
    await db
      .update(characters)
      .set({ sheet: next, updatedAt: new Date().toISOString() })
      .where(eq(characters.id, row.character.id));
    await db
      .update(initiativeEntries)
      .set({
        hpCurrent: combat.hitPointsCurrent,
        hpMax: combat.hitPointsMax,
        hpTemp: combat.hitPointsTemp,
      })
      .where(eq(initiativeEntries.characterId, row.character.id));
    rested += 1;
  }

  return rested;
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
