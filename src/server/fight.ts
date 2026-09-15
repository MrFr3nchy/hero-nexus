/**
 * What the shelf beside the sand table reaches for.
 *
 * Two reads and nothing else: a character's weapon attacks, priced off the
 * sheet by the same pure `weaponAttacks` the play page uses; and the creature
 * behind an initiative entry, resolved through `resolveContentRefs` so a
 * homebrew monster renders exactly like an SRD one. Neither writes. The rolls
 * they lead to go through `rollForCampaign`, because there is one dice log.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  abilityMod,
  weaponAttacks,
  type WeaponAttack,
} from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  adjustDamage,
  ammunitionFor,
  coverBonus,
  coverWords,
  criticalDamage,
  parseCreatureAttack,
  resolveHit,
  type Defenses,
  type RollOutcome,
} from '@/@creator/campaign/lib/attack';
import {
  coverBetween,
  distanceFeet,
  flanked,
  type Cover,
} from '@/@creator/campaign/lib/battlemap';
import {
  attackedWith,
  d20PenaltyFor,
} from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import { parseTurn } from '@/@creator/campaign/lib/turn';
import { normalizeTerrain } from '@/@shared/battlemap/types';
import {
  parseContentData,
  type ContentEntry,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import {
  critToneOf,
  rollNotation,
  withAdvantage,
  type NotationRoll,
} from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  campaignMembers,
  campaignRolls,
  characters,
  initiativeEntries,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { resolveContentRefs } from './content';
import { bumpVersion, publish } from './live-hub';
import { applyHpUnchecked } from './session';
import { requireUserId } from './session-user';
import { effectiveRules, fence } from './table-rules';
import { authorizeEntry, takeAction } from './turn';

/**
 * The viewer's own weapons in hand at this table.
 *
 * Owner or staff — the same gate `authorize` in play.ts applies — and read
 * fresh each time rather than cached on `LiveState`, because it needs every
 * equipped item's ref resolved and the party panel does not.
 */
export async function getMyAttacks(
  characterId: string,
  campaignId: string
): Promise<WeaponAttack[]> {
  const userId = await requireUserId();
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');
  const isStaff = role === 'gm' || role === 'co-gm';
  if (!isStaff && character.ownerId !== userId) throw new Error('FORBIDDEN');

  const sheet = character.sheet as CharacterSheet;
  const refs = sheet.inventory
    .map(i => i.ref)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  return weaponAttacks(sheet, await resolveContentRefs(refs));
}

/**
 * The block behind a combatant. Staff only: a player knows what an aboleth
 * is from its name and does not get its actions off the shelf.
 *
 * Null rather than a throw for a hand-typed foe — "Goblin, AC 15, 7 hp" was
 * never in the bestiary and the shelf says so instead of breaking.
 */
export async function getEntryCreature(
  entryId: string
): Promise<ContentEntry | null> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: (t, { eq: e }) => e(t.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  await requireCampaignRole(enc.campaignId, ['gm', 'co-gm']);

  const ref = entry.creatureRef as ContentRef | null;
  if (!ref) return null;
  const resolved = await resolveContentRefs([ref]);
  return [...resolved.values()][0] ?? null;
}

/** The character seated for the viewer at this table, if any. */
export async function mySeat(campaignId: string): Promise<string | null> {
  const userId = await requireUserId();
  const row = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: (t, ops) =>
      ops.and(ops.eq(t.campaignId, campaignId), ops.eq(t.userId, userId)),
  });
  return row?.characterId ?? null;
}

/* --- an attack that lands ---------------------------------------------------- */

export type AttackWeapon =
  | { kind: 'item'; itemId: string; twoHanded?: boolean }
  | { kind: 'creature-action'; name: string }
  | {
      kind: 'improvised';
      label: string;
      thrown: boolean;
      damageType?: string | null;
    };

export interface AttackInput {
  attackerEntryId: string;
  weapon: AttackWeapon;
  targetEntryId: string | null;
  /** The attacker's own mode, as the picker had it; the target's state folds in here. */
  mode: 'flat' | 'advantage' | 'disadvantage';
  /** An opportunity attack: spends the reaction rather than the action. */
  asReaction?: boolean;
  /** Roll the damage even on a miss — a half-damage-on-miss effect. */
  damageOnMiss?: boolean;
  ruling?: boolean;
}

export interface AttackResult {
  hit: NotationRoll;
  damage: NotationRoll | null;
  outcome: RollOutcome;
  hitRollId: string;
}

type Entry = typeof initiativeEntries.$inferSelect;

/** What the swing is made with, resolved to numbers. */
interface Swing {
  name: string;
  attackBonus: number;
  damage: string;
  damageType: string | null;
  melee: boolean;
  /** The ammunition word, when the weapon needs some. */
  ammunition: string | null;
}

async function blockOf(entry: Entry): Promise<CreatureData | null> {
  // A shape worn for now (07) is the block that swings and is swung at.
  const form = entry.form as { creatureRef?: ContentRef } | null;
  const ref = form?.creatureRef ?? (entry.creatureRef as ContentRef | null);
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

async function swingOf(
  attacker: Entry,
  weapon: AttackWeapon,
  targetFeet: number | null
): Promise<Swing> {
  if (weapon.kind === 'creature-action') {
    const block = await blockOf(attacker);
    if (!block) throw new Error('NO_BLOCK');
    const action = [
      ...block.actions,
      ...block.bonus_actions,
      ...block.reactions,
      ...block.legendary_actions,
    ].find(a => a.name === weapon.name);
    if (!action) throw new Error('NO_SUCH_ACTION');
    const parsed = parseCreatureAttack(action.desc);
    if (!parsed.hit) throw new Error('NOT_AN_ATTACK');
    const bonus = Number(parsed.hit.replace(/^1d20/, '')) || 0;
    return {
      name: action.name,
      attackBonus: bonus,
      damage: parsed.damage[0]?.notation ?? '',
      damageType: parsed.damage[0]?.type ?? null,
      melee: !parsed.ranged,
      ammunition: null,
    };
  }

  const sheet = await sheetOf(attacker);
  if (!sheet) throw new Error('NO_SHEET');
  const penalty = d20PenaltyFor(sheet.combat?.exhaustion ?? 0);

  if (weapon.kind === 'improvised') {
    // 1d4 + STR, or DEX when thrown; no proficiency; 20/60 ft thrown.
    const ability = weapon.thrown ? 'dexterity' : 'strength';
    const mod = abilityMod(sheet, ability);
    return {
      name: weapon.label.trim().slice(0, 60) || 'Improvised weapon',
      attackBonus: mod + penalty,
      damage: `1d4${mod === 0 ? '' : mod > 0 ? `+${mod}` : `${mod}`}`,
      damageType: weapon.damageType?.trim().toLowerCase() || 'bludgeoning',
      melee: !weapon.thrown,
      ammunition: null,
    };
  }

  const refs = sheet.inventory
    .map(i => i.ref)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const attack = weaponAttacks(sheet, await resolveContentRefs(refs)).find(
    a => a.itemId === weapon.itemId
  );
  if (!attack) throw new Error('NOT_IN_HAND');
  const two = weapon.twoHanded && attack.versatileDamage;
  // A thrown weapon is melee in the hand and ranged in the air: the target's
  // distance decides which, and with no target the hand is assumed.
  const melee = attack.range === 0 || (targetFeet !== null && targetFeet <= 5);
  return {
    name: attack.name,
    attackBonus: attack.attackBonus + penalty,
    damage: two ? attack.versatileDamage : attack.damage,
    damageType: attack.damageType,
    melee,
    ammunition: ammunitionFor(attack.name, attack.properties),
  };
}

/** The target's armour class, from wherever the app knows it. */
async function armorClassOf(target: Entry): Promise<number | null> {
  const form = target.form as { armorClass?: number } | null;
  if (form?.armorClass !== undefined) return form.armorClass;
  if (target.armorClass !== null) return target.armorClass;
  const block = await blockOf(target);
  return block?.armor_class ?? null;
}

async function defensesOf(target: Entry): Promise<Defenses> {
  const sheet = await sheetOf(target);
  if (sheet) {
    return {
      resistances: sheet.combat?.damageResistances ?? [],
      immunities: sheet.combat?.damageImmunities ?? [],
      vulnerabilities: sheet.combat?.damageVulnerabilities ?? [],
    };
  }
  const block = await blockOf(target);
  return {
    resistances: block?.damage_resistances ?? [],
    immunities: block?.damage_immunities ?? [],
    vulnerabilities: block?.damage_vulnerabilities ?? [],
  };
}

/**
 * Where the two stand, and what stands between: cover, flanking, distance.
 * Null when there is no board for the fight or either is not on it.
 */
async function geometry(
  campaignId: string,
  attacker: Entry,
  target: Entry,
  flankingRule: boolean
): Promise<{ feet: number; cover: Cover; flanking: boolean } | null> {
  const map = await db.query.battleMaps.findFirst({
    where: and(
      eq(battleMaps.campaignId, campaignId),
      eq(battleMaps.encounterId, attacker.encounterId),
      eq(battleMaps.isActive, true)
    ),
  });
  if (!map) return null;
  const tokens = await db
    .select()
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, map.id));
  const a = tokens.find(t => t.entryId === attacker.id);
  const b = tokens.find(t => t.entryId === target.id);
  if (!a || !b) return null;
  const doc = normalizeTerrain(map.terrain);

  const entryIds = tokens
    .map(t => t.entryId)
    .filter((id): id is string => id !== null);
  const sides = new Map(
    (
      await db
        .select({ id: initiativeEntries.id, side: initiativeEntries.side })
        .from(initiativeEntries)
        .where(eq(initiativeEntries.encounterId, attacker.encounterId))
    )
      .filter(e => entryIds.includes(e.id))
      .map(e => [e.id, e.side])
  );

  const others = tokens.filter(t => t.id !== a.id && t.id !== b.id);
  const cover = coverBetween(doc, a, b, others);
  const allies = others.filter(
    t => t.entryId && sides.get(t.entryId) === attacker.side
  );
  return {
    feet: distanceFeet(a, b),
    cover,
    flanking: flankingRule && flanked(a, b, allies),
  };
}

function fmt(n: number): string {
  return n === 0 ? '' : n > 0 ? `+${n}` : `${n}`;
}

/**
 * One swing, start to finish: authorise and spend the action (05), roll to
 * hit with the target's state folded in (04), compare against an AC the app
 * knows — raised by cover — roll damage (doubled dice on a natural 20 under
 * the table's rule), take the target's defences off it, write both rolls
 * with the verdict on the first, and apply the damage where the table lets
 * the caller (01), or leave it proposed.
 *
 * It refuses nothing it does not have to: with no target it is a roll with
 * a label, like before; with a target and no AC the verdict is "unknown".
 * Total cover is the one refusal — `NO_LINE`, overridable.
 */
export async function attack(input: AttackInput): Promise<AttackResult> {
  const {
    entry: attacker,
    campaignId,
    userId,
    isStaff,
  } = await authorizeEntry(input.attackerEntryId);
  const rules = await effectiveRules(campaignId, attacker.encounterId);
  const who = { isStaff, ruling: input.ruling };

  const target = input.targetEntryId
    ? await db.query.initiativeEntries.findFirst({
        where: and(
          eq(initiativeEntries.id, input.targetEntryId),
          eq(initiativeEntries.encounterId, attacker.encounterId)
        ),
      })
    : null;
  if (input.targetEntryId && !target) throw new Error('NO_SUCH_TARGET');

  const geo = target
    ? await geometry(campaignId, attacker, target, rules.flanking)
    : null;
  const swing = await swingOf(attacker, input.weapon, geo?.feet ?? null);
  const because: string[] = [];

  // Cover first: a target that cannot be seen at all is refused before
  // anything is spent, so a ruled-past refusal costs the action once.
  let cover: Cover = geo?.cover ?? 'none';
  let ruled = false;
  if (cover === 'total') {
    ruled = fence('NO_LINE', rules, who);
    cover = 'none';
  }

  // Ammunition: one shot, one row down; none left is a refusal under enforce.
  if (swing.ammunition && attacker.characterId) {
    ruled =
      (await spendAmmunition(attacker, swing.ammunition, rules, who)) || ruled;
  }

  // The turn's slot. `takeAction` fences ALREADY_ACTED and INCAPACITATED
  // under the table's mode and announces the action.
  await takeAction(attacker.id, input.asReaction ? 'opportunity' : 'attack', {
    ruling: input.ruling,
  });

  // The target's state folds into the attacker's mode: prone in melee,
  // dodging, flanking. Advantage and disadvantage cancel, as always.
  let adv = input.mode === 'advantage' ? 1 : 0;
  let dis = input.mode === 'disadvantage' ? 1 : 0;
  if (target) {
    const conditions = parseConditions(target.conditionKeys);
    const against = attackedWith(conditions, swing.melee, {
      dodging: parseTurn(target.turn).dodging,
    });
    if (against === 'advantage') {
      adv += 1;
      because.push(`${target.label} · advantage against`);
    } else if (against === 'disadvantage') {
      dis += 1;
      because.push(`${target.label} · disadvantage against`);
    }
    if (geo?.flanking && swing.melee) {
      adv += 1;
      because.push('flanking · advantage');
    }
    if (cover !== 'none') because.push(coverWords(cover));
  }
  const mode: RollOutcome['mode'] =
    adv > 0 && dis > 0
      ? 'flat'
      : adv > 0
        ? 'advantage'
        : dis > 0
          ? 'disadvantage'
          : 'flat';

  const base = `1d20${fmt(swing.attackBonus)}`;
  const hitRoll = rollNotation(
    mode === 'flat' ? base : withAdvantage(base, mode)
  );
  if (!hitRoll) throw new Error('BAD_NOTATION');
  const face = hitRoll.dice.find((_, i) => !hitRoll.dropped.includes(i)) ?? 0;
  const baseAc = target ? await armorClassOf(target) : null;
  const ac = baseAc === null ? null : baseAc + coverBonus(cover);
  const hit = target ? resolveHit(face, hitRoll.total, ac) : null;
  const critical = face === 20;

  // Damage: on a hit, on an unknown verdict, or when asked for on a miss.
  let damageRoll: NotationRoll | null = null;
  let damage: RollOutcome['damage'] = null;
  if (swing.damage && (hit !== false || input.damageOnMiss)) {
    const crit = critical
      ? criticalDamage(swing.damage, rules.crits)
      : { notation: swing.damage, flat: 0 };
    const rolled = rollNotation(crit.notation);
    if (rolled) {
      damageRoll = {
        ...rolled,
        modifier: rolled.modifier + crit.flat,
        total: rolled.total + crit.flat,
      };
      const defenses = target
        ? await defensesOf(target)
        : { resistances: [], immunities: [], vulnerabilities: [] };
      const adjusted = adjustDamage(
        damageRoll.total,
        swing.damageType,
        defenses
      );
      damage = {
        rolled: damageRoll.total,
        amount: adjusted.amount,
        type: swing.damageType,
        adjusted: adjusted.adjusted,
        rollId: null,
      };
    }
  }

  // Who swung, for the log: the character when seated, else the label.
  const actorName = attacker.label;
  const at = target
    ? ` vs ${target.label}${geo ? ` · ${geo.feet} ft` : ''}`
    : '';
  const outcome: RollOutcome = {
    targetEntryId: target?.id ?? null,
    targetLabel: target?.label ?? '',
    ac,
    cover,
    mode,
    because: ruled ? [...because, "DM's ruling"] : because,
    hit,
    critical,
    damage,
    applied: null,
  };

  const [hitRow] = await db
    .insert(campaignRolls)
    .values({
      campaignId,
      actorUserId: userId,
      characterId: attacker.characterId,
      actorName,
      label: `${swing.name} · to hit${at}`.slice(0, 80),
      notation: hitRoll.notation.slice(0, 60),
      dice: hitRoll.dice,
      dropped: hitRoll.dropped,
      modifier: hitRoll.modifier,
      total: hitRoll.total,
      visibility: 'table',
      outcome,
    })
    .returning({ id: campaignRolls.id });

  if (damageRoll && damage) {
    const [damageRow] = await db
      .insert(campaignRolls)
      .values({
        campaignId,
        actorUserId: userId,
        characterId: attacker.characterId,
        actorName,
        label:
          `${swing.name} · damage${at}${critical ? ' · critical' : ''}`.slice(
            0,
            80
          ),
        notation: (critical
          ? criticalDamage(swing.damage, rules.crits).notation
          : swing.damage
        ).slice(0, 60),
        dice: damageRoll.dice,
        dropped: damageRoll.dropped,
        modifier: damageRoll.modifier,
        total: damageRoll.total,
        visibility: 'table',
      })
      .returning({ id: campaignRolls.id });
    damage.rollId = damageRow.id;
  }

  // Apply now where the table says so and the target is a foe; a hero's hit
  // points are always their owner's or the DM's to take.
  if (
    target &&
    damage &&
    hit === true &&
    damage.amount > 0 &&
    rules.playersApplyDamage === 'apply' &&
    target.side !== 'party'
  ) {
    await applyHpUnchecked(target.id, campaignId, -damage.amount);
    outcome.applied = { byName: actorName, at: new Date().toISOString() };
  }
  await db
    .update(campaignRolls)
    .set({ outcome })
    .where(eq(campaignRolls.id, hitRow.id));

  bumpVersion(campaignId);

  // Two announcements, as two rolls always were. The verdict travels only
  // where the table shows it; the AC never does.
  const verdict =
    rules.showHitMiss === 'everyone' && hit !== null
      ? ` — ${hit ? (critical ? 'critical hit' : 'hit') : 'miss'}`
      : '';
  publish(campaignId, {
    kind: 'roll',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName,
    label: `${swing.name}${at}${verdict}`.slice(0, 100),
    notation: hitRoll.notation,
    total: hitRoll.total,
    tone:
      critToneOf(hitRoll.notation, hitRoll.dice, hitRoll.dropped) ?? 'plain',
    secret: false,
  });
  if (damageRoll && damage) {
    publish(campaignId, {
      kind: 'roll',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName,
      label: `${swing.name} · damage${target ? ` to ${target.label}` : ''}${
        damage.adjusted
          ? ` · ${damage.amount} after ${damage.adjusted === 'resisted' ? 'resistance' : damage.adjusted === 'immune' ? 'immunity' : 'vulnerability'}`
          : ''
      }`.slice(0, 100),
      notation: damageRoll.notation,
      total: damageRoll.total,
      tone: 'plain',
      secret: false,
    });
  }

  return { hit: hitRoll, damage: damageRoll, outcome, hitRollId: hitRow.id };
}

/**
 * One round down the quiver. The row is any inventory line whose name
 * carries the ammunition word ("Arrows (20)", "crossbow bolts"). None left
 * is `NO_AMMUNITION` under enforce; advising, the shot is taken and the
 * count stays at zero.
 */
async function spendAmmunition(
  attacker: Entry,
  word: string,
  rules: Awaited<ReturnType<typeof effectiveRules>>,
  who: { isStaff: boolean; ruling?: boolean }
): Promise<boolean> {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, attacker.characterId!),
  });
  if (!character) return false;
  const sheet = character.sheet as CharacterSheet;
  const row = sheet.inventory.find(i => new RegExp(word, 'i').test(i.name));
  if (!row || row.quantity <= 0) {
    return fence('NO_AMMUNITION', rules, who);
  }
  const inventory = sheet.inventory.map(i =>
    i.id === row.id ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i
  );
  await db
    .update(characters)
    .set({
      sheet: { ...sheet, inventory },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(characters.id, character.id));
  return false;
}

/**
 * Land a proposed hit. Staff always may; the target's own player always may
 * for their hero; the attacker may for a foe where the table says `propose`
 * or `apply` (01). Idempotent: a second press is `ALREADY_APPLIED`, so two
 * people reaching for the same button cost the goblin one hit, not two.
 */
export async function applyDamage(rollId: string): Promise<RollOutcome> {
  const userId = await requireUserId();
  const roll = await db.query.campaignRolls.findFirst({
    where: eq(campaignRolls.id, rollId),
  });
  if (!roll) throw new Error('NOT_FOUND');
  const outcome = roll.outcome as RollOutcome | null;
  if (!outcome?.targetEntryId || !outcome.damage)
    throw new Error('NOTHING_TO_APPLY');
  if (outcome.applied) throw new Error('ALREADY_APPLIED');

  const { role } = await requireCampaignRole(roll.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  const target = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, outcome.targetEntryId),
  });
  if (!target) throw new Error('NO_SUCH_TARGET');

  if (!isStaff) {
    const rules = await effectiveRules(roll.campaignId, target.encounterId);
    const seat = await db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, roll.campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    const ownsTarget =
      !!target.characterId && seat?.characterId === target.characterId;
    const swung = roll.actorUserId === userId;
    const mayForFoe =
      swung && target.side !== 'party' && rules.playersApplyDamage !== 'never';
    if (!ownsTarget && !mayForFoe) throw new Error('NOT_YOURS_TO_APPLY');
  }

  if (outcome.damage.amount > 0) {
    await applyHpUnchecked(target.id, roll.campaignId, -outcome.damage.amount);
  }
  const person = await db.query.users.findFirst({
    columns: { name: true, email: true },
    where: eq(users.id, userId),
  });
  const next: RollOutcome = {
    ...outcome,
    applied: {
      byName:
        person?.name?.trim() || person?.email?.split('@')[0] || 'Somebody',
      at: new Date().toISOString(),
    },
  };
  await db
    .update(campaignRolls)
    .set({ outcome: next })
    .where(eq(campaignRolls.id, rollId));
  bumpVersion(roll.campaignId);
  return next;
}
