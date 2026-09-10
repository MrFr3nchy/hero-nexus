import 'server-only';

import { and, eq } from 'drizzle-orm';

import {
  parseConditions,
  serializeConditions,
  type ConditionKey,
} from '@/@creator/campaign/lib/conditions';
import {
  applyDamageWhileDown,
  applyDeathSave,
  clearDying,
  dyingState,
  type DeathSaveMode,
  type DyingState,
} from '@/@creator/character/lib/dying';
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
  /** Stabilised at 0 hit points — see `combat.stable` on the sheet. */
  stable: boolean;
  /** alive / dying / stable / dead, derived once here so no surface re-derives it. */
  dying: DyingState;

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
    stable: sheet.combat?.stable ?? false,
    dying: dyingState(sheet.combat?.hitPointsCurrent ?? 0, {
      successes: sheet.combat?.deathSaveSuccesses ?? 0,
      failures: sheet.combat?.deathSaveFailures ?? 0,
      stable: sheet.combat?.stable ?? false,
    }),
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
async function conditionsFor(characterId: string): Promise<ConditionKey[]> {
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
      const toBody = damage - fromTemp;
      const hpBefore = combat.hitPointsCurrent;
      combat.hitPointsCurrent = Math.max(0, hpBefore - toBody);

      /*
       * A hit that lands on somebody already down is a death-save failure,
       * and a big enough one kills outright — both handled together, because
       * at a table they are one question: how much of that was left over.
       *
       * Temporary hit points are excluded from the reckoning on purpose: they
       * are not the character's own, so soaking a hit with them is not being
       * hit at 0. Only what reached the body counts.
       */
      const after = applyDamageWhileDown(
        {
          successes: combat.deathSaveSuccesses,
          failures: combat.deathSaveFailures,
          stable: combat.stable,
        },
        toBody,
        hpBefore,
        combat.hitPointsMax,
        patch.critical
      );
      combat.deathSaveSuccesses = after.tracks.successes;
      combat.deathSaveFailures = after.tracks.failures;
      combat.stable = after.tracks.stable;
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
  // Being conscious again ends the dying entirely — both tracks and the
  // stability flag. Leaving them filled is how a table forgets someone already
  // died once this fight, and leaving `stable` set is how a healed character
  // reads as unconscious on every surface that asks.
  if (combat.hitPointsCurrent > 0) {
    const cleared = clearDying();
    combat.deathSaveSuccesses = cleared.successes;
    combat.deathSaveFailures = cleared.failures;
    combat.stable = cleared.stable;
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
 * Roll one death saving throw, on the server.
 *
 * The die is rolled here and written to `campaign_rolls` for the same reason
 * `spendHitDice` rolls here: a total the browser produced is a claim about a
 * roll, not a record of one. That matters more for this roll than any other in
 * the app — it is the one a table most needs to trust, and the one most
 * tempting to fudge.
 *
 * `secret` keeps it off the players' log. It is refused for anybody who is not
 * staff, which is the same rule `session.ts` already applies to ordinary rolls;
 * a player cannot hide their own death save, because a hidden roll is a thing
 * the DM does *to* the table, not a thing a player does to their DM.
 *
 * The rules live in `character/lib/dying.ts`, pure and tested apart from this.
 */
export async function rollDeathSave(
  characterId: string,
  campaignId: string | null,
  options: { mode?: DeathSaveMode; secret?: boolean } = {}
): Promise<PlayState> {
  const { character, canEdit } = await authorize(characterId, campaignId);
  if (!canEdit) throw new Error('FORBIDDEN');

  const sheet = character.sheet as CharacterSheet;
  const combat = { ...sheet.combat };

  const state = dyingState(combat.hitPointsCurrent, {
    successes: combat.deathSaveSuccesses,
    failures: combat.deathSaveFailures,
    stable: combat.stable,
  });
  // Rolling when you are not dying is not a correction, it is a mistake — and
  // silently accepting it would put a failure on a conscious character.
  if (state !== 'dying') throw new Error('NOT_DYING');

  const mode = options.mode ?? 'straight';
  // Staff only, checked here rather than trusted from the client.
  let secret = false;
  if (options.secret) {
    if (!campaignId) throw new Error('SECRET_NEEDS_A_TABLE');
    const { role } = await requireCampaignRole(campaignId, [
      'gm',
      'co-gm',
      'player',
    ]);
    // Its own code, not FORBIDDEN: the sheet *is* theirs, and being told
    // otherwise is a confusing answer to "why can't I hide this roll".
    if (role !== 'gm' && role !== 'co-gm') {
      throw new Error('SECRET_IS_STAFF_ONLY');
    }
    secret = true;
  }

  const dice = mode === 'straight' ? [rollDie(20)] : [rollDie(20), rollDie(20)];
  const outcome = applyDeathSave(
    {
      successes: combat.deathSaveSuccesses,
      failures: combat.deathSaveFailures,
      stable: combat.stable,
    },
    dice,
    mode
  );

  combat.deathSaveSuccesses = outcome.tracks.successes;
  combat.deathSaveFailures = outcome.tracks.failures;
  combat.stable = outcome.tracks.stable;
  if (outcome.hpCurrent !== null) {
    combat.hitPointsCurrent = outcome.hpCurrent;
  }

  const next: CharacterSheet = { ...sheet, combat };

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  await db
    .update(initiativeEntries)
    .set({ hpCurrent: combat.hitPointsCurrent })
    .where(eq(initiativeEntries.characterId, characterId));

  if (campaignId) {
    await db.insert(campaignRolls).values({
      campaignId,
      actorUserId: character.ownerId,
      characterId,
      actorName: character.name,
      label: `Death save — ${outcome.summary}`,
      notation: mode === 'straight' ? '1d20' : '2d20',
      dice,
      // The die that did not count is shown as dropped, so a reader can see
      // the advantage rather than being told the total.
      dropped: dice.length === 2 ? [dice[0] === outcome.result ? 1 : 0] : [],
      modifier: 0,
      total: outcome.result,
      visibility: secret ? 'dm' : 'table',
    });
  }

  return toPlayState(
    { ...character, sheet: next },
    canEdit,
    await conditionsFor(characterId)
  );
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
  await writeConditions(characterId, keys);
}

/**
 * Write a character's conditions to the sheet, and to the tracker row when
 * there is one.
 *
 * Both, because they are read by different surfaces: the initiative list reads
 * the row, and everything else reads the sheet. Writing only the row is what
 * made a condition die with the encounter.
 */
async function writeConditions(
  characterId: string,
  keys: string[]
): Promise<ConditionKey[]> {
  const cleaned = parseConditions(serializeConditions(keys));

  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (character) {
    const sheet = character.sheet as CharacterSheet;
    const next: CharacterSheet = {
      ...sheet,
      combat: { ...sheet.combat, conditions: cleaned },
    };
    await db
      .update(characters)
      .set({ sheet: next, updatedAt: new Date().toISOString() })
      .where(eq(characters.id, characterId));
  }

  await db
    .update(initiativeEntries)
    .set({ conditionKeys: serializeConditions(cleaned) })
    .where(eq(initiativeEntries.characterId, characterId));

  return cleaned;
}

/**
 * A player setting their own conditions, with or without a table.
 *
 * The DM's route is `setPlayConditions`, which is staff-only and campaign
 * scoped. This one authorises the way every other play control does, so a hero
 * who is poisoned between sessions can say so on their own sheet.
 */
export async function setOwnConditions(
  characterId: string,
  campaignId: string | null,
  keys: string[]
): Promise<ConditionKey[]> {
  const { canEdit } = await authorize(characterId, campaignId);
  if (!canEdit) throw new Error('FORBIDDEN');
  return writeConditions(characterId, keys);
}
