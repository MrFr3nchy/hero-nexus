/**
 * Casting a spell, holding it, and asking the room to save (improvements 07).
 *
 * `castSpell` is the one flow. It authorises the caster's owner or staff,
 * reads the spell off the content it points at, resolves the targets (named
 * combatants or an area on the board), pays — the slot off the sheet, the
 * Magic action off the turn (05), the concentration held — and lands the
 * spell on each target: a spell attack compared against AC, a save rolled
 * behind the screen for a foe or put to a hero's player through the Asking,
 * damage adjusted by the target's defences and applied or proposed by the
 * table's rule (06), healing through the play patch, conditions and named
 * effects as rows on the fight's clock (04).
 *
 * A fellow hero is never a target without a word: a player casting on
 * another player's character raises a **consent** ask instead. Allow lands
 * it, contest rolls the save, refuse costs the caster nothing — the slot is
 * paid only on the first yes. The pending casting travels in the ask's
 * payload and comes back through `resumeCast`.
 *
 * Asks are returned, not raised: this module does not import `checks.ts`
 * (which would close a cycle), so the action layer puts them to the table.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import {
  adjustDamage,
  resolveHit,
  type Defenses,
  type RollOutcome,
} from '@/@creator/campaign/lib/attack';
import { areaTiles, type Area } from '@/@creator/campaign/lib/battlemap';
import {
  castingSlot,
  conditionOf,
  damageAfterSave,
  scaledRoll,
  slotToSpend,
  type EntryForm,
} from '@/@creator/campaign/lib/casting';
import type {
  CheckPayload,
  ConsentPayload,
  SpellSavePayload,
} from '@/@creator/campaign/lib/checks';
import { attackedWith } from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import { parseTurn } from '@/@creator/campaign/lib/turn';
import {
  abilityMod,
  abilityModifier,
  savingThrow,
  spellAttackBonus,
  spellSaveDC,
} from '@/@creator/character/lib/derive';
import {
  ABILITY_LABELS,
  type AbilityKey,
  type CharacterSheet,
} from '@/@creator/character/schema';
import { normalizeTerrain } from '@/@shared/battlemap/types';
import {
  parseContentData,
  refKey,
  type ContentRef,
  type CreatureData,
  type SpellData,
} from '@/@shared/content';
import { critToneOf, rollDie, rollNotation } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  campaignChecks,
  campaignCheckTargets,
  campaignMembers,
  campaignRolls,
  characters,
  encounterEffects,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import type { CheckInput } from './checks';
import { requireCampaignRole } from './campaigns';
import { resolveContentRefs } from './content';
import { breakConcentration, putEffect } from './effects';
import { bumpVersion, publish } from './live-hub';
import { applyPlayPatchUnchecked } from './play';
import { applyHpUnchecked } from './hp';
import { requireUserId } from './session-user';
import { effectiveRules, fence } from './table-rules';
import { takeActionUnchecked } from './turn';

type Entry = typeof initiativeEntries.$inferSelect;

export type CastTargets =
  | { entryIds: string[] }
  | { characterIds: string[] }
  | { area: Area }
  | { none: true };

export interface CastInput {
  campaignId: string;
  /** The caster. A hero: monsters cast through their block's actions. */
  characterId: string;
  /** "srd:spell:srd-2024_fireball" — a `refKey`. */
  spellKey: string;
  /** The slot to spend; null for a cantrip, or to take the spell's own level. */
  slotLevel: number | null;
  ritual?: boolean;
  targets: CastTargets;
  ruling?: boolean;
}

/** An ask the caller raises through `requestCheckFrom`, and who asks it. */
export interface PendingAsk {
  asker: { userId: string; characterId: string | null };
  input: CheckInput;
}

export interface Landed {
  targetLabel: string;
  /** hit / miss for an attack, pass / fail for a rolled save, applied when neither. */
  verdict: 'hit' | 'miss' | 'pass' | 'fail' | 'applied' | 'asked';
  damage: number | null;
  healing: number | null;
  condition: string | null;
}

export interface CastResult {
  castId: string;
  spellName: string;
  /** Who was asked before the spell touched them. */
  consentFrom: string[];
  landed: Landed[];
  asks: PendingAsk[];
  /** True when the slot and action were spent by this call. */
  paid: boolean;
}

/* --- the spell and the caster ------------------------------------------------ */

function parseKey(key: string): ContentRef | null {
  const [source, type, ...rest] = key.split(':');
  if ((source !== 'srd' && source !== 'homebrew') || type !== 'spell') {
    return null;
  }
  const k = rest.join(':');
  return k ? { source, type: 'spell', key: k } : null;
}

interface Caster {
  character: typeof characters.$inferSelect;
  sheet: CharacterSheet;
  entry: Entry | null;
  encounterId: string | null;
  dc: number;
  attackBonus: number;
  /** The spellcasting ability's modifier — what healing adds where the text says. */
  mod: number;
  isStaff: boolean;
  userId: string;
}

async function casterFor(
  campaignId: string,
  characterId: string,
  userId: string,
  isStaff: boolean
): Promise<Caster> {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');
  if (!isStaff && character.ownerId !== userId) throw new Error('FORBIDDEN');
  const sheet = character.sheet as CharacterSheet;

  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { id: true },
    where: and(
      eq(initiativeEncounters.campaignId, campaignId),
      eq(initiativeEncounters.isActive, true)
    ),
  });
  const entry = enc
    ? ((await db.query.initiativeEntries.findFirst({
        where: and(
          eq(initiativeEntries.encounterId, enc.id),
          eq(initiativeEntries.characterId, characterId)
        ),
      })) ?? null)
    : null;

  const ability = sheet.spellcasting.ability as AbilityKey | '';
  return {
    character,
    sheet,
    entry,
    encounterId: enc?.id ?? null,
    dc: spellSaveDC(sheet) ?? 10,
    attackBonus: spellAttackBonus(sheet) ?? 0,
    mod: ability ? abilityMod(sheet, ability) : 0,
    isStaff,
    userId,
  };
}

interface Spell {
  name: string;
  data: SpellData;
  ref: ContentRef;
  /** The prose, for the two things the structured fields do not carry. */
  description: string;
}

async function spellFor(key: string): Promise<Spell> {
  const ref = parseKey(key);
  if (!ref) throw new Error('NO_SUCH_SPELL');
  const resolved = await resolveContentRefs([ref]);
  const entry = resolved.get(refKey(ref));
  if (!entry || entry.type !== 'spell') throw new Error('NO_SUCH_SPELL');
  return {
    name: entry.name,
    data: parseContentData('spell', entry.data) as SpellData,
    ref,
    description: entry.description,
  };
}

/* --- targets ------------------------------------------------------------------ */

/** Who is inside a lit area on the fight's board, and who of them is hidden. */
async function entriesInArea(
  campaignId: string,
  encounterId: string,
  area: Area
): Promise<{ entries: Entry[]; hidden: Set<string> }> {
  const map = await db.query.battleMaps.findFirst({
    where: and(
      eq(battleMaps.campaignId, campaignId),
      eq(battleMaps.encounterId, encounterId),
      eq(battleMaps.isActive, true)
    ),
  });
  if (!map) throw new Error('NO_BOARD');
  const doc = normalizeTerrain(map.terrain);
  const lit = areaTiles(doc, area);
  const tokens = await db
    .select()
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, map.id));
  const inside = tokens.filter(t => {
    if (!t.entryId) return false;
    for (let dy = 0; dy < t.footprint; dy++) {
      for (let dx = 0; dx < t.footprint; dx++) {
        if (lit.has((t.y + dy) * doc.w + (t.x + dx))) return true;
      }
    }
    return false;
  });
  const ids = [...new Set(inside.map(t => t.entryId as string))];
  const entries =
    ids.length > 0
      ? await db
          .select()
          .from(initiativeEntries)
          .where(inArray(initiativeEntries.id, ids))
      : [];
  const hidden = new Set(
    inside.filter(t => t.visibility === 'dm').map(t => t.entryId as string)
  );
  return { entries, hidden };
}

async function resolveTargets(
  campaignId: string,
  caster: Caster,
  targets: CastTargets
): Promise<{ entries: Entry[]; characterIds: string[]; hidden: Set<string> }> {
  if ('none' in targets)
    return { entries: [], characterIds: [], hidden: new Set() };
  if ('characterIds' in targets) {
    // At the desk: party members by character. In a fight the same names
    // resolve to their entries so the effects can be timed.
    if (caster.encounterId) {
      const rows = await db
        .select()
        .from(initiativeEntries)
        .where(
          and(
            eq(initiativeEntries.encounterId, caster.encounterId),
            inArray(initiativeEntries.characterId, targets.characterIds)
          )
        );
      // A party member not in the fight — back at camp, or not yet dealt
      // in — is still a hero to heal or bless, by character.
      const inFight = new Set(rows.map(r => r.characterId));
      return {
        entries: rows,
        characterIds: targets.characterIds.filter(id => !inFight.has(id)),
        hidden: new Set(),
      };
    }
    return {
      entries: [],
      characterIds: targets.characterIds,
      hidden: new Set(),
    };
  }
  if (!caster.encounterId) throw new Error('NO_FIGHT');
  if ('area' in targets) {
    const found = await entriesInArea(
      campaignId,
      caster.encounterId,
      targets.area
    );
    return { ...found, characterIds: [] };
  }
  const rows = await db
    .select()
    .from(initiativeEntries)
    .where(
      and(
        eq(initiativeEntries.encounterId, caster.encounterId),
        inArray(initiativeEntries.id, targets.entryIds)
      )
    );
  return { entries: rows, characterIds: [], hidden: new Set() };
}

/* --- paying ---------------------------------------------------------------------- */

const SLOT_KEYS = [
  'level1',
  'level2',
  'level3',
  'level4',
  'level5',
  'level6',
  'level7',
  'level8',
  'level9',
] as const;

/**
 * The slot off the sheet and the action off the turn, and the concentration
 * taken up. `NO_SLOT` is the table's fence: advising, an empty slot is
 * spent past zero and the card shows it; enforcing, refused, staff may rule.
 */
async function pay(
  campaignId: string,
  caster: Caster,
  spell: { name: string; data: SpellData; ref: ContentRef },
  slotLevel: number | null,
  ritual: boolean,
  ruling: boolean | undefined
): Promise<void> {
  const rules = await effectiveRules(campaignId, caster.encounterId);
  const who = { isStaff: caster.isStaff, ruling };
  const level = slotToSpend(spell.data, slotLevel, ritual);

  if (level !== null) {
    const key = SLOT_KEYS[level - 1];
    const slot = caster.sheet.spellcasting.slots[key];
    if (slot.expended >= slot.total) fence('NO_SLOT', rules, who);
    const fresh = await db.query.characters.findFirst({
      where: eq(characters.id, caster.character.id),
    });
    if (fresh) {
      await applyPlayPatchUnchecked(fresh, campaignId, {
        slot: { level, expended: Math.min(slot.total, slot.expended + 1) },
      });
    }
  }

  if (caster.entry) {
    const turnSlot = castingSlot(spell.data.casting_time);
    if (turnSlot && !ritual) {
      // Unchecked: the caster may not be the one pressing — a fellow
      // player's yes resumes their casting — and the owner check was made
      // when the spell was first cast.
      await takeActionUnchecked(
        caster.entry,
        campaignId,
        { userId: caster.userId, isStaff: caster.isStaff },
        turnSlot === 'action' ? 'magic' : turnSlot,
        { note: spell.name, ruling }
      );
    }
    if (spell.data.concentration) {
      await breakConcentration(caster.entry.id, caster.userId);
      await db
        .update(initiativeEntries)
        .set({ concentrating: true, concentrationSpell: refKey(spell.ref) })
        .where(eq(initiativeEntries.id, caster.entry.id));
    }
  }
}

/* --- landing ------------------------------------------------------------------- */

async function blockOf(entry: Entry): Promise<CreatureData | null> {
  const form = entry.form as EntryForm | null;
  const ref = (form?.creatureRef ?? entry.creatureRef) as ContentRef | null;
  if (!ref) return null;
  const resolved = await resolveContentRefs([ref]);
  const block = [...resolved.values()][0];
  return block
    ? (parseContentData('creature', block.data) as CreatureData)
    : null;
}

async function sheetOf(entry: Entry): Promise<CharacterSheet | null> {
  if (!entry.characterId) return null;
  const c = await db.query.characters.findFirst({
    columns: { sheet: true },
    where: eq(characters.id, entry.characterId),
  });
  return (c?.sheet as CharacterSheet | undefined) ?? null;
}

async function defensesOf(entry: Entry): Promise<Defenses> {
  const sheet = await sheetOf(entry);
  if (sheet) {
    return {
      resistances: sheet.combat?.damageResistances ?? [],
      immunities: sheet.combat?.damageImmunities ?? [],
      vulnerabilities: sheet.combat?.damageVulnerabilities ?? [],
    };
  }
  const block = await blockOf(entry);
  return {
    resistances: block?.damage_resistances ?? [],
    immunities: block?.damage_immunities ?? [],
    vulnerabilities: block?.damage_vulnerabilities ?? [],
  };
}

async function saveBonusOf(entry: Entry, ability: AbilityKey): Promise<number> {
  const sheet = await sheetOf(entry);
  if (sheet) return savingThrow(sheet, ability);
  const block = await blockOf(entry);
  if (!block) return 0;
  return (
    block.saving_throws[ability] ??
    abilityModifier(block.ability_scores[ability] ?? 10)
  );
}

async function seatOf(
  campaignId: string,
  characterId: string
): Promise<string | null> {
  const seat = await db.query.campaignMembers.findFirst({
    columns: { userId: true },
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId),
      eq(campaignMembers.status, 'active')
    ),
  });
  return seat?.userId ?? null;
}

interface Landing {
  campaignId: string;
  castId: string;
  caster: Caster;
  casterLabel: string;
  spell: Spell;
  slotLevel: number | null;
  /** The damage dice, rolled once for the casting. */
  damage: { rolled: number; type: string | null } | null;
  healing: number | null;
}

async function rollOnce(
  landing: Omit<Landing, 'damage' | 'healing'>,
  actorName: string
): Promise<Pick<Landing, 'damage' | 'healing'>> {
  const d = landing.spell.data;
  const dmgNotation = scaledRoll(d, landing.slotLevel, 'damage');
  const healNotation = scaledRoll(d, landing.slotLevel, 'healing');
  let damage: Landing['damage'] = null;
  let healing: number | null = null;
  if (dmgNotation) {
    const r = rollNotation(dmgNotation);
    if (r) {
      damage = { rolled: r.total, type: d.damage_types[0] ?? null };
      await record(landing.campaignId, landing.caster, actorName, {
        label: `${landing.spell.name} · damage`,
        roll: r,
      });
    }
  }
  if (healNotation) {
    const r = rollNotation(healNotation);
    if (r) {
      // "plus your spellcasting ability modifier" — Cure Wounds and kin.
      const plusMod = /spellcasting ability modifier/i.test(
        landing.spell.description
      );
      const bonus = plusMod ? landing.caster.mod : 0;
      healing = r.total + bonus;
      await record(landing.campaignId, landing.caster, actorName, {
        label: `${landing.spell.name} · healing`,
        roll: { ...r, modifier: r.modifier + bonus, total: healing },
      });
    }
  }
  return { damage, healing };
}

async function record(
  campaignId: string,
  caster: Caster,
  actorName: string,
  what: {
    label: string;
    roll: ReturnType<typeof rollNotation> & object;
    outcome?: RollOutcome;
  }
): Promise<string> {
  const r = what.roll!;
  const [row] = await db
    .insert(campaignRolls)
    .values({
      campaignId,
      actorUserId: caster.userId,
      characterId: caster.character.id,
      actorName,
      label: what.label.slice(0, 80),
      notation: r.notation.slice(0, 60),
      dice: r.dice,
      dropped: r.dropped,
      modifier: r.modifier,
      total: r.total,
      visibility: 'table',
      outcome: what.outcome ?? null,
    })
    .returning({ id: campaignRolls.id });
  publish(campaignId, {
    kind: 'roll',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: caster.userId,
    actorName,
    label: what.label,
    notation: r.notation,
    total: r.total,
    tone: critToneOf(r.notation, r.dice, r.dropped) ?? 'plain',
    secret: false,
  });
  return row.id;
}

/**
 * Damage onto a target: adjusted by its defences, then applied by the
 * table's rule — a foe under `apply` or by staff at once, otherwise written
 * as a proposed row for the log's Apply button; a hero's hit points through
 * the play patch, since the word that let this land was already given.
 */
async function landDamage(
  landing: Landing,
  target: Entry,
  amount: number,
  type: string | null,
  verdict: string
): Promise<number> {
  const adjusted = adjustDamage(amount, type, await defensesOf(target));
  if (adjusted.amount <= 0) return 0;
  const rules = await effectiveRules(landing.campaignId, target.encounterId);
  const mayApply =
    target.side === 'party' ||
    landing.caster.isStaff ||
    rules.playersApplyDamage === 'apply';
  const outcome: RollOutcome = {
    targetEntryId: target.id,
    targetLabel: target.label,
    ac: null,
    cover: 'none',
    mode: 'flat',
    because: [`${landing.spell.name} · ${verdict}`],
    hit: true,
    critical: false,
    damage: {
      rolled: amount,
      amount: adjusted.amount,
      type,
      adjusted: adjusted.adjusted,
      rollId: null,
    },
    applied: null,
  };
  if (mayApply) {
    await applyHpUnchecked(target.id, landing.campaignId, -adjusted.amount);
    outcome.applied = {
      byName: landing.casterLabel,
      at: new Date().toISOString(),
    };
  }
  // A row per target, so the log has a line — and a button — for each.
  await db.insert(campaignRolls).values({
    campaignId: landing.campaignId,
    actorUserId: landing.caster.userId,
    characterId: landing.caster.character.id,
    actorName: landing.casterLabel,
    label: `${landing.spell.name} vs ${target.label} · ${verdict}`.slice(0, 80),
    notation: '',
    dice: [] as number[],
    dropped: [] as number[],
    modifier: 0,
    total: amount,
    visibility: 'table',
    outcome,
  });
  return adjusted.amount;
}

async function landHealing(
  landing: Landing,
  target: Entry,
  amount: number
): Promise<number> {
  if (amount <= 0) return 0;
  await applyHpUnchecked(target.id, landing.campaignId, amount);
  return amount;
}

async function landEffects(
  landing: Landing,
  target: Entry
): Promise<string | null> {
  const d = landing.spell.data;
  const condition = conditionOf(d);
  const rounds = d.duration_rounds > 0 ? d.duration_rounds : null;
  const common = {
    rounds,
    endsOn: 'end' as const,
    // Counted on the caster's turn when they hold it; on the target's when
    // the spell just sits there.
    anchorEntryId: d.concentration ? (landing.caster.entry?.id ?? null) : null,
    sourceEntryId: landing.caster.entry?.id ?? null,
    sourceLabel: landing.casterLabel,
    concentration: d.concentration,
    // A repeated save where the prose says so: Hold Person's "repeats the
    // save at the end of each of its turns".
    ...(d.saving_throw_ability &&
    /repeats? the save|repeat the saving throw/i.test(landing.spell.description)
      ? { saveAbility: d.saving_throw_ability, saveDc: landing.caster.dc }
      : {}),
  };
  if (condition) {
    await putEffect(
      landing.campaignId,
      target.encounterId,
      [target.id],
      { kind: 'condition', conditionKey: condition, ...common },
      landing.caster.userId
    );
    return condition;
  }
  if (rounds || d.concentration) {
    await putEffect(
      landing.campaignId,
      target.encounterId,
      [target.id],
      { kind: 'effect', label: landing.spell.name, ...common },
      landing.caster.userId
    );
  }
  return null;
}

/**
 * The spell touches one combatant. Returns what happened, or the save to
 * ask for when the target is a seated hero with a player behind the seat.
 */
async function landOn(
  landing: Landing,
  target: Entry,
  consented: 'allowed' | 'pass' | 'fail' | null
): Promise<{ landed: Landed; ask: PendingAsk | null }> {
  const d = landing.spell.data;
  const label = target.label;

  // A spell attack, against AC, the target's state folded in.
  if (d.attack_roll) {
    const conditions = parseConditions(target.conditionKeys);
    const against = attackedWith(conditions, /touch/i.test(d.range_text), {
      dodging: parseTurn(target.turn).dodging,
    });
    const base = `1d20${landing.caster.attackBonus >= 0 ? '+' : ''}${landing.caster.attackBonus}`;
    const notation =
      against === 'advantage'
        ? base.replace(/^1d20/, '2d20kh1')
        : against === 'disadvantage'
          ? base.replace(/^1d20/, '2d20kl1')
          : base;
    const roll = rollNotation(notation);
    if (!roll) throw new Error('BAD_NOTATION');
    const face = roll.dice.find((_, i) => !roll.dropped.includes(i)) ?? 0;
    const form = target.form as EntryForm | null;
    const ac =
      form?.armorClass ??
      target.armorClass ??
      (await blockOf(target))?.armor_class ??
      null;
    const hit = resolveHit(face, roll.total, ac);
    await record(landing.campaignId, landing.caster, landing.casterLabel, {
      label: `${landing.spell.name} · to hit vs ${label}`,
      roll,
      outcome: {
        targetEntryId: target.id,
        targetLabel: label,
        ac,
        cover: 'none',
        mode: against,
        because: [],
        hit,
        critical: face === 20,
        damage: null,
        applied: null,
      },
    });
    if (hit === false) {
      return {
        landed: {
          targetLabel: label,
          verdict: 'miss',
          damage: null,
          healing: null,
          condition: null,
        },
        ask: null,
      };
    }
    const dmg = landing.damage
      ? await landDamage(
          landing,
          target,
          face === 20 ? landing.damage.rolled * 2 : landing.damage.rolled,
          landing.damage.type,
          'hit'
        )
      : null;
    const condition = await landEffects(landing, target);
    return {
      landed: {
        targetLabel: label,
        verdict: 'hit',
        damage: dmg,
        healing: null,
        condition,
      },
      ask: null,
    };
  }

  // A save. A hero with a player is asked, unless consent already decided
  // it; a foe — or a seat with nobody behind it — rolls here.
  if (d.saving_throw_ability) {
    const ability = d.saving_throw_ability as AbilityKey;
    let passed: boolean | null = null;
    if (consented === 'pass') passed = true;
    else if (consented === 'fail') passed = false;
    else if (consented === 'allowed') passed = false;
    else if (target.characterId) {
      const userId = await seatOf(landing.campaignId, target.characterId);
      if (userId) {
        const payload: SpellSavePayload = {
          kind: 'spell',
          castId: landing.castId,
          casterEntryId: landing.caster.entry?.id ?? null,
          casterLabel: landing.casterLabel,
          spellKey: refKey(landing.spell.ref),
          spellName: landing.spell.name,
          targetEntryId: target.id,
          damage: landing.damage
            ? { amount: landing.damage.rolled, type: landing.damage.type }
            : null,
          saveEffect: d.save_effect,
          condition: conditionOf(d),
          durationRounds: d.duration_rounds,
          concentration: d.concentration,
        };
        return {
          landed: {
            targetLabel: label,
            verdict: 'asked',
            damage: null,
            healing: null,
            condition: null,
          },
          ask: {
            asker: {
              userId: landing.caster.userId,
              characterId: landing.caster.character.id,
            },
            input: {
              kind: 'save',
              ability,
              dc: landing.caster.dc,
              dcVisibility: 'shown',
              prompt: `${landing.spell.name} — ${landing.casterLabel}`,
              targetUserIds: [userId],
              payload,
            },
          },
        };
      }
    }
    if (passed === null) {
      const modifier = await saveBonusOf(target, ability);
      const die = rollDie(20);
      const total = die + modifier;
      passed = total >= landing.caster.dc;
      await db.insert(campaignRolls).values({
        campaignId: landing.campaignId,
        actorUserId: null,
        characterId: target.characterId,
        actorName: label,
        label:
          `${ABILITY_LABELS[ability]} save vs ${landing.spell.name} · DC ${landing.caster.dc}`.slice(
            0,
            80
          ),
        notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
        dice: [die],
        dropped: [] as number[],
        modifier,
        total,
        visibility: target.side === 'party' ? 'table' : 'dm',
      });
    }
    return {
      landed: await settle(landing, target, passed, consented === 'allowed'),
      ask: null,
    };
  }

  // Neither: it simply happens — healing, a buff, a condition with no save.
  const healing = landing.healing
    ? await landHealing(landing, target, landing.healing)
    : null;
  const dmg = landing.damage
    ? await landDamage(
        landing,
        target,
        landing.damage.rolled,
        landing.damage.type,
        'lands'
      )
    : null;
  const condition = await landEffects(landing, target);
  return {
    landed: {
      targetLabel: label,
      verdict: 'applied',
      damage: dmg,
      healing,
      condition,
    },
    ask: null,
  };
}

/** After a save is known: half or nothing on a pass, the lot on a fail. */
async function settle(
  landing: Landing,
  target: Entry,
  passed: boolean,
  allowed = false
): Promise<Landed> {
  const d = landing.spell.data;
  let dmg: number | null = null;
  if (landing.damage) {
    const amount = damageAfterSave(
      landing.damage.rolled,
      passed,
      d.save_effect
    );
    dmg =
      amount > 0
        ? await landDamage(
            landing,
            target,
            amount,
            landing.damage.type,
            passed ? 'saved' : 'failed'
          )
        : 0;
  }
  const condition = passed ? null : await landEffects(landing, target);
  return {
    targetLabel: target.label,
    verdict: allowed ? 'applied' : passed ? 'pass' : 'fail',
    damage: dmg,
    healing: null,
    condition,
  };
}

/* --- the flow ---------------------------------------------------------------------- */

export async function castSpell(input: CastInput): Promise<CastResult> {
  const { role, userId } = await requireCampaignRole(input.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  const caster = await casterFor(
    input.campaignId,
    input.characterId,
    userId,
    isStaff
  );
  const spell = await spellFor(input.spellKey);
  const castId = randomUUID();
  const casterLabel = caster.entry?.label ?? caster.character.name;
  const ritual = Boolean(input.ritual && spell.data.ritual);

  const { entries, characterIds, hidden } = await resolveTargets(
    input.campaignId,
    caster,
    input.targets
  );

  // Consent: another player's hero is asked, not told. Staff cast without
  // asking — the DM's foes do not seek permission — and a caster on
  // themselves needs none.
  const needsConsent: Entry[] = [];
  const direct: Entry[] = [];
  for (const e of entries) {
    const otherHero =
      !isStaff &&
      e.characterId !== null &&
      e.characterId !== caster.character.id;
    (otherHero ? needsConsent : direct).push(e);
  }
  const deskTargets: string[] = [];
  const deskConsent: string[] = [];
  for (const id of characterIds) {
    (!isStaff && id !== caster.character.id ? deskConsent : deskTargets).push(
      id
    );
  }

  // Pay now unless every target is somebody who has to say yes first.
  const payNow =
    direct.length > 0 ||
    deskTargets.length > 0 ||
    (needsConsent.length === 0 && deskConsent.length === 0);
  if (payNow) {
    await pay(
      input.campaignId,
      caster,
      spell,
      input.slotLevel,
      ritual,
      input.ruling
    );
  }

  const asks: PendingAsk[] = [];
  const landed: Landed[] = [];
  const consentFrom: string[] = [];

  const landing: Landing = {
    campaignId: input.campaignId,
    castId,
    caster,
    casterLabel,
    spell,
    slotLevel: input.slotLevel,
    damage: null,
    healing: null,
  };
  if (payNow) {
    Object.assign(landing, await rollOnce(landing, casterLabel));
  }

  for (const target of direct) {
    const r = await landOn(landing, target, null);
    landed.push(r.landed);
    if (r.ask) asks.push(r.ask);
  }

  // At the desk, healing and buffs onto party members by character.
  for (const characterId of deskTargets) {
    const c = await db.query.characters.findFirst({
      where: eq(characters.id, characterId),
    });
    if (!c) continue;
    if (landing.healing) {
      await applyPlayPatchUnchecked(c, input.campaignId, {
        hpCurrentDelta: landing.healing,
      });
    }
    landed.push({
      targetLabel: c.name,
      verdict: 'applied',
      damage: null,
      healing: landing.healing,
      condition: null,
    });
  }

  // Consent asks, one per hero, the pending casting inside each.
  const consentTargets: {
    entry: Entry | null;
    characterId: string;
    label: string;
  }[] = [
    ...needsConsent.map(e => ({
      entry: e,
      characterId: e.characterId as string,
      label: e.label,
    })),
  ];
  for (const id of deskConsent) {
    const c = await db.query.characters.findFirst({
      columns: { name: true },
      where: eq(characters.id, id),
    });
    if (c) consentTargets.push({ entry: null, characterId: id, label: c.name });
  }
  for (const t of consentTargets) {
    const seat = await seatOf(input.campaignId, t.characterId);
    if (!seat) continue;
    consentFrom.push(t.label);
    const payload: ConsentPayload = {
      kind: 'consent',
      castId,
      casterEntryId: caster.entry?.id ?? null,
      casterCharacterId: caster.character.id,
      casterLabel,
      spellKey: input.spellKey,
      spellName: spell.name,
      slotLevel: input.slotLevel,
      ritual,
      targetEntryId: t.entry?.id ?? '',
      targetCharacterId: t.characterId,
      pays: !payNow,
    };
    asks.push({
      asker: { userId, characterId: caster.character.id },
      input: {
        kind: 'consent',
        ability: spell.data.saving_throw_ability ?? null,
        dc: spell.data.saving_throw_ability ? caster.dc : null,
        dcVisibility: 'shown',
        prompt: `${casterLabel} wants to cast ${spell.name} on you`,
        targetUserIds: [seat],
        payload,
      },
    });
  }

  // The moment, told to the table — hidden foes named to staff only.
  const shown = entries.filter(e => !hidden.has(e.id)).map(e => e.label);
  const all = entries.map(e => e.label);
  const base = {
    kind: 'cast' as const,
    at: new Date().toISOString(),
    by: userId,
    casterLabel,
    spell: spell.name,
    level: slotToSpend(spell.data, input.slotLevel, ritual) ?? spell.data.level,
    ritual,
    concentration: spell.data.concentration,
    awaiting: consentFrom,
  };
  if (hidden.size > 0) {
    publish(
      input.campaignId,
      { ...base, id: randomUUID(), targets: shown },
      {
        users: await playerIds(input.campaignId),
      }
    );
    publish(
      input.campaignId,
      { ...base, id: randomUUID(), targets: all },
      'staff'
    );
  } else {
    publish(input.campaignId, { ...base, id: randomUUID(), targets: all });
  }
  bumpVersion(input.campaignId);

  return {
    castId,
    spellName: spell.name,
    consentFrom,
    landed,
    asks,
    paid: payNow,
  };
}

async function playerIds(campaignId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: campaignMembers.userId })
    .from(campaignMembers)
    .where(eq(campaignMembers.campaignId, campaignId));
  return rows.map(r => r.userId);
}

/**
 * A fellow hero answered. Allow lands the spell as if the save were failed
 * (there was none to make); contest lands it by the verdict; refuse lands
 * nothing. The slot is paid on the first answer that lets the spell in.
 */
export async function resumeCast(
  campaignId: string,
  payload: ConsentPayload,
  verdict: 'allowed' | 'refused' | 'pass' | 'fail',
  byUserId: string
): Promise<CastResult> {
  const spell = await spellFor(payload.spellKey);
  if (verdict === 'refused') {
    publish(campaignId, {
      kind: 'cast',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: byUserId,
      casterLabel: payload.casterLabel,
      spell: spell.name,
      level: spell.data.level,
      ritual: payload.ritual,
      concentration: false,
      targets: [],
      awaiting: [],
      refused: true,
    });
    return {
      castId: payload.castId,
      spellName: spell.name,
      consentFrom: [],
      landed: [],
      asks: [],
      paid: false,
    };
  }

  // The caster, as staff would see them: no owner check — the target's yes
  // is the authority here, and the caster may have closed their laptop.
  const casterRow = await db.query.characters.findFirst({
    where: eq(characters.id, payload.casterCharacterId),
  });
  if (!casterRow) throw new Error('NOT_FOUND');
  const caster = await casterFor(
    campaignId,
    payload.casterCharacterId,
    casterRow.ownerId,
    true
  );
  caster.isStaff = false;

  let paid = false;
  if (payload.pays && !(await castPaid(payload.castId))) {
    await pay(
      campaignId,
      caster,
      spell,
      payload.slotLevel,
      payload.ritual,
      false
    );
    paid = true;
  }

  const landing: Landing = {
    campaignId,
    castId: payload.castId,
    caster,
    casterLabel: payload.casterLabel,
    spell,
    slotLevel: payload.slotLevel,
    damage: null,
    healing: null,
  };
  Object.assign(landing, await rollOnce(landing, payload.casterLabel));

  const landed: Landed[] = [];
  if (payload.targetEntryId) {
    const target = await db.query.initiativeEntries.findFirst({
      where: eq(initiativeEntries.id, payload.targetEntryId),
    });
    if (target) {
      const r = await landOn(landing, target, verdict);
      landed.push(r.landed);
    }
  } else {
    // Not in the fight: the hero by character — healing lands on the
    // sheet; a buff or a condition has no clock to sit on and is noted.
    const c = await db.query.characters.findFirst({
      where: eq(characters.id, payload.targetCharacterId),
    });
    if (c) {
      if (landing.healing) {
        await applyPlayPatchUnchecked(c, campaignId, {
          hpCurrentDelta: landing.healing,
        });
      }
      landed.push({
        targetLabel: c.name,
        verdict: 'applied',
        damage: null,
        healing: landing.healing,
        condition: null,
      });
    }
  }
  void byUserId;
  bumpVersion(campaignId);
  return {
    castId: payload.castId,
    spellName: spell.name,
    consentFrom: [],
    landed,
    asks: [],
    paid,
  };
}

/** Whether any other consent for this casting has already let it in. */
async function castPaid(castId: string): Promise<boolean> {
  const rows = await db
    .select({ id: campaignChecks.id, payload: campaignChecks.payload })
    .from(campaignChecks)
    .where(eq(campaignChecks.kind, 'consent'));
  const ids = rows
    .filter(r => (r.payload as ConsentPayload | null)?.castId === castId)
    .map(r => r.id);
  if (ids.length === 0) return false;
  const targets = await db
    .select({ status: campaignCheckTargets.status })
    .from(campaignCheckTargets)
    .where(inArray(campaignCheckTargets.checkId, ids));
  // The answer being resumed is already written, so "paid" means a second
  // yes besides this one.
  return (
    targets.filter(t => t.status === 'allowed' || t.status === 'rolled')
      .length > 1
  );
}

/**
 * A hero answered the save a spell put to them. Half or nothing on a pass,
 * the lot on a fail; the condition on a fail only. Called by the action
 * layer with what `answerCheck` handed back.
 */
export async function settleSpellSave(
  campaignId: string,
  payload: SpellSavePayload,
  passed: boolean,
  byUserId: string
): Promise<Landed | null> {
  const target = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, payload.targetEntryId),
  });
  if (!target) return null;
  const spell = await spellFor(payload.spellKey);
  const casterRow = payload.casterEntryId
    ? await db.query.initiativeEntries.findFirst({
        where: eq(initiativeEntries.id, payload.casterEntryId),
      })
    : null;
  const casterCharacter = casterRow?.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, casterRow.characterId),
      })
    : null;
  if (!casterCharacter) return null;
  const caster = await casterFor(
    campaignId,
    casterCharacter.id,
    casterCharacter.ownerId,
    true
  );
  caster.isStaff = false;
  const landing: Landing = {
    campaignId,
    castId: payload.castId,
    caster,
    casterLabel: payload.casterLabel,
    spell,
    slotLevel: null,
    damage: payload.damage
      ? { rolled: payload.damage.amount, type: payload.damage.type }
      : null,
    healing: null,
  };
  void byUserId;
  const landed = await settle(landing, target, passed);
  bumpVersion(campaignId);
  return landed;
}

/* --- concentration by hand ------------------------------------------------------- */

/** Drop what is held, on purpose. The holder's player, or staff. */
export async function dropConcentration(entryId: string): Promise<void> {
  const userId = await requireUserId();
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: eq(initiativeEncounters.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  const { role } = await requireCampaignRole(enc.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  if (!isStaff) {
    const seat = await db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, enc.campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    if (!entry.characterId || seat?.characterId !== entry.characterId) {
      throw new Error('FORBIDDEN');
    }
  }
  await breakConcentration(entryId, userId);
}

/* --- another shape -------------------------------------------------------------- */

/**
 * Put a combatant into another creature's shape — Polymorph, Wild Shape.
 * Staff only. The form takes the block's hit points and AC; at 0 it drops
 * and, unless `carryExcess`, the excess is lost (2024 Polymorph). Tied to an
 * effect row when the caller names one, so the duration ends it too.
 */
export async function takeForm(
  entryId: string,
  input: {
    creatureRef: ContentRef;
    carryExcess?: boolean;
    rounds?: number | null;
    concentration?: boolean;
    sourceEntryId?: string | null;
  }
): Promise<void> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: eq(initiativeEncounters.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(enc.campaignId, ['gm', 'co-gm']);

  const resolved = await resolveContentRefs([input.creatureRef]);
  const block = [...resolved.values()][0];
  if (!block || block.type !== 'creature') throw new Error('NO_SUCH_CREATURE');
  const d = parseContentData('creature', block.data) as CreatureData;

  // One shape at a time: the row behind the last one goes.
  const before = entry.form as EntryForm | null;
  if (before?.effectId) {
    await db
      .delete(encounterEffects)
      .where(eq(encounterEffects.id, before.effectId));
  }

  const [effectId] = await putEffect(
    enc.campaignId,
    entry.encounterId,
    [entryId],
    {
      kind: 'effect',
      label: `${block.name} form`,
      rounds: input.rounds ?? null,
      sourceEntryId: input.sourceEntryId ?? null,
      concentration: input.concentration ?? false,
    },
    userId
  );
  const form: EntryForm = {
    creatureRef: input.creatureRef,
    label: block.name,
    hpCurrent: d.hit_points,
    hpMax: d.hit_points,
    armorClass: d.armor_class,
    revertsOnZero: true,
    carryExcess: input.carryExcess ?? false,
    effectId: effectId ?? null,
  };
  await db
    .update(initiativeEntries)
    .set({ form })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(enc.campaignId);
}

/** Back to themselves, on purpose. Staff only. */
export async function revertForm(entryId: string): Promise<void> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: eq(initiativeEncounters.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  await requireCampaignRole(enc.campaignId, ['gm', 'co-gm']);
  const worn = entry.form as EntryForm | null;
  if (worn?.effectId) {
    await db
      .delete(encounterEffects)
      .where(eq(encounterEffects.id, worn.effectId));
  }
  await db
    .update(initiativeEntries)
    .set({ form: null })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(enc.campaignId);
}

/* --- what can be cast --------------------------------------------------------- */

/** One line of the Cast panel: the spell as the flow will treat it. */
export interface CastableSpell {
  key: string;
  name: string;
  level: number;
  prepared: boolean;
  castingTime: string;
  range: string;
  concentration: boolean;
  ritual: boolean;
  attack: boolean;
  save: AbilityKey | null;
  saveEffect: SpellData['save_effect'];
  area: SpellData['area'];
  damage: string;
  healing: string;
  durationRounds: number;
  condition: string | null;
}

/**
 * The caster's spell list, resolved, with what each will do when cast.
 * Cantrips and always-prepared spells are castable; the rest only when
 * prepared today. Owner or staff.
 */
export async function listCastable(
  campaignId: string,
  characterId: string
): Promise<CastableSpell[]> {
  const { role, userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');
  if (!isStaff && character.ownerId !== userId) throw new Error('FORBIDDEN');
  const sheet = character.sheet as CharacterSheet;
  const refs = sheet.spellcasting.spells.map(s => s.ref);
  const resolved = await resolveContentRefs(refs);
  const out: CastableSpell[] = [];
  for (const s of sheet.spellcasting.spells) {
    const entry = resolved.get(refKey(s.ref));
    if (!entry || entry.type !== 'spell') continue;
    const d = parseContentData('spell', entry.data) as SpellData;
    out.push({
      key: refKey(s.ref),
      name: entry.name,
      level: d.level,
      prepared: d.level === 0 || s.alwaysPrepared || s.prepared,
      castingTime: d.casting_time,
      range: d.range_text,
      concentration: d.concentration,
      ritual: d.ritual,
      attack: d.attack_roll,
      save: (d.saving_throw_ability as AbilityKey | null) ?? null,
      saveEffect: d.save_effect,
      area: d.area,
      damage: d.damage_roll,
      healing: d.healing_roll,
      durationRounds: d.duration_rounds,
      condition: d.applies_condition,
    });
  }
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export type { CheckPayload };
