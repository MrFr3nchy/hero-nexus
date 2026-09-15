/**
 * An attack that lands: the arithmetic between the die and the hit points.
 *
 * Hit or miss against an armour class, a critical's dice under the table's
 * rule (01), damage after a target's resistances, and the words a creature's
 * stat block uses for its own attacks. `server/fight.ts` rolls and records;
 * this decides, so a natural 20 that should have doubled the dice can be
 * asserted without a table under it.
 *
 * Pure — no React, no DB, no `server-only`.
 */
import { parseNotation } from '@/@shared/lib/dice';
import type { Cover } from './battlemap';

export type { Cover };

/** +2 AC for half, +5 for three-quarters. Total is a refusal, not a bonus. */
export function coverBonus(cover: Cover): number {
  switch (cover) {
    case 'half':
      return 2;
    case 'three-quarters':
      return 5;
    default:
      return 0;
  }
}

/** "half cover +2". Empty for none. */
export function coverWords(cover: Cover): string {
  if (cover === 'none') return '';
  if (cover === 'total') return 'total cover';
  return `${cover === 'half' ? 'half' : 'three-quarters'} cover +${coverBonus(cover)}`;
}

/* --- hit or miss ----------------------------------------------------------- */

/**
 * Whether a to-hit total beats an armour class. A natural 20 always hits and
 * a natural 1 always misses, whatever the modifiers say; with no AC known
 * (a foe the DM typed with none) the answer is null and the row says so.
 */
export function resolveHit(
  face: number,
  total: number,
  ac: number | null
): boolean | null {
  if (face === 20) return true;
  if (face === 1) return false;
  if (ac === null) return null;
  return total >= ac;
}

/* --- criticals ------------------------------------------------------------- */

export type CritRule = 'double-dice' | 'max-plus-roll';

/**
 * What to roll on a critical hit.
 *
 * 2024 (`double-dice`): every die is rolled twice, the modifier once — so
 * `1d8+3` becomes `2d8+3`. The old-school variant (`max-plus-roll`) rolls
 * the dice as written and adds their maximum as a flat bonus: `1d8+3` rolls
 * `1d8+3` and adds 8. Returns the notation to roll and the flat to add.
 */
export function criticalDamage(
  notation: string,
  rule: CritRule
): { notation: string; flat: number } {
  const parsed = parseNotation(notation);
  if (!parsed) return { notation, flat: 0 };
  if (rule === 'max-plus-roll') {
    const flat = parsed.terms.reduce(
      (sum, t) => sum + (t.negative ? -1 : 1) * t.count * t.sides,
      0
    );
    return { notation, flat };
  }
  // Double the count of every dice term; leave the flat modifier as it is.
  const doubled = notation
    .replace(/\s+/g, '')
    .replace(/(^|[+-])(\d*)d(\d+)/gi, (_m, sign, count, sides) => {
      const n = Number(count || 1) * 2;
      return `${sign}${n}d${sides}`;
    });
  return { notation: doubled, flat: 0 };
}

/* --- resistances ----------------------------------------------------------- */

export interface Defenses {
  resistances: readonly string[];
  immunities: readonly string[];
  vulnerabilities: readonly string[];
}

export type Adjustment = 'resisted' | 'immune' | 'vulnerable' | null;

/**
 * Whether a list of damage-type words names this type. Stat blocks write
 * "bludgeoning, piercing, and slashing from nonmagical attacks" as one entry,
 * so the match is a word inside the entry, not the whole entry.
 */
function lists(entries: readonly string[], type: string): boolean {
  const needle = type.trim().toLowerCase();
  if (!needle) return false;
  return entries.some(e =>
    new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`, 'i').test(e)
  );
}

/**
 * Damage after the target's defences. Immunity wins over everything;
 * resistance halves, rounded down; vulnerability doubles. An unknown type
 * — an improvised swing with no word for it — is adjusted by nothing.
 */
export function adjustDamage(
  amount: number,
  type: string | null,
  defenses: Defenses
): { amount: number; adjusted: Adjustment } {
  const base = Math.max(0, Math.trunc(amount));
  if (!type) return { amount: base, adjusted: null };
  if (lists(defenses.immunities, type))
    return { amount: 0, adjusted: 'immune' };
  if (lists(defenses.resistances, type)) {
    return { amount: Math.floor(base / 2), adjusted: 'resisted' };
  }
  if (lists(defenses.vulnerabilities, type)) {
    return { amount: base * 2, adjusted: 'vulnerable' };
  }
  return { amount: base, adjusted: null };
}

/* --- the stat block's own words ------------------------------------------- */

export interface CreatureAttack {
  /** "1d20+4", or null when the text names no attack roll. */
  hit: string | null;
  /** Each damage roll the text names, in order, with its type when given. */
  damage: { notation: string; type: string | null }[];
  /** 10 when the text says "reach 10 ft.", else 5. */
  reach: number;
  /** True when the text names a range in feet — a bow, a spit of acid. */
  ranged: boolean;
}

/**
 * Read an action's attack off its prose — "Melee Attack Roll: +4, reach 5 ft.
 * Hit: 5 (1d6 + 2) Slashing damage" in the 2024 phrasing, or the 2014 "+4
 * to hit, reach 5 ft. Hit: 5 (1d6 + 2) slashing damage". The same regexes
 * `StatBlockPanel` rolls with; here so the server and the panel read one
 * block the same way.
 */
export function parseCreatureAttack(desc: string): CreatureAttack {
  const hitMatch =
    /(?:Attack Roll|to hit)[^+\-\d]*([+\-]\s?\d+)/i.exec(desc) ??
    /([+\-]\s?\d+)\s+to hit/i.exec(desc);
  const hit = hitMatch ? `1d20${hitMatch[1].replace(/\s/g, '')}` : null;
  const damage: CreatureAttack['damage'] = [];
  const re = /\((\d+d\d+(?:\s?[+\-]\s?\d+)?)\)\s*([a-z]+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc))) {
    const word = (m[2] ?? '').toLowerCase();
    damage.push({
      notation: m[1].replace(/\s/g, ''),
      type: word && word !== 'damage' ? word : null,
    });
  }
  return {
    hit,
    damage,
    reach: /reach\s+10\s*ft/i.test(desc) ? 10 : 5,
    ranged: /range\s+\d+\s*(?:\/\s*\d+\s*)?ft/i.test(desc),
  };
}

/* --- ammunition ------------------------------------------------------------ */

/**
 * What a weapon with the Ammunition property shoots, as the word an
 * inventory row is likely to carry. Null for a weapon that needs none.
 */
export function ammunitionFor(
  weaponName: string,
  properties: readonly string[]
): string | null {
  if (!properties.some(p => /ammunition/i.test(p))) return null;
  const name = weaponName.toLowerCase();
  if (/crossbow/.test(name)) return 'bolt';
  if (/bow/.test(name)) return 'arrow';
  if (/blowgun/.test(name)) return 'needle';
  if (/sling/.test(name)) return 'bullet';
  if (/musket|pistol/.test(name)) return 'bullet';
  return 'ammunition';
}

/* --- the outcome on the roll ----------------------------------------------- */

/**
 * What the to-hit row remembers. Stored as JSON on `campaign_rolls.outcome`
 * and filtered by role on the way out — a player never sees `ac`, and sees
 * `hit` only where the table shows it.
 */
export interface RollOutcome {
  targetEntryId: string | null;
  targetLabel: string;
  /** Null when the app knows no AC for the target. */
  ac: number | null;
  /** The cover the AC was raised by, already inside `ac`. */
  cover: Cover;
  /** The mode the die was actually rolled with, after the target's state. */
  mode: 'flat' | 'advantage' | 'disadvantage';
  /** Why, in words: "Prone · advantage", "Dodging · disadvantage", "flanking". */
  because: string[];
  hit: boolean | null;
  critical: boolean;
  damage: {
    /** What the dice said, before defences. */
    rolled: number;
    /** What lands, after defences. */
    amount: number;
    type: string | null;
    adjusted: Adjustment;
    /** The damage roll's own id in the log. */
    rollId: string | null;
  } | null;
  /** Set once the damage has landed on the target's hit points. */
  applied: { byName: string; at: string } | null;
}

/** The outcome as a player may see it: no AC, hit only where shown. */
export function outcomeForPlayer(
  outcome: RollOutcome,
  showHitMiss: 'staff' | 'everyone'
): RollOutcome {
  return {
    ...outcome,
    ac: null,
    hit: showHitMiss === 'everyone' ? outcome.hit : null,
  };
}

/** "hit (17) · 9 slashing → 4 after resistance". */
export function outcomeWords(o: RollOutcome, total: number): string {
  const verdict =
    o.hit === true
      ? `${o.critical ? 'critical ' : ''}hit (${total})`
      : o.hit === false
        ? `miss (${total})`
        : `${total}`;
  const parts = [verdict];
  if (o.damage) {
    const type = o.damage.type ? ` ${o.damage.type}` : '';
    if (o.damage.adjusted) {
      const why =
        o.damage.adjusted === 'resisted'
          ? 'after resistance'
          : o.damage.adjusted === 'immune'
            ? 'immune'
            : 'vulnerable';
      parts.push(`${o.damage.rolled}${type} → ${o.damage.amount} ${why}`);
    } else {
      parts.push(`${o.damage.amount}${type}`);
    }
  }
  return parts.join(' · ');
}
