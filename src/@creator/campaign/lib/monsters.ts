/**
 * Running the other side (improvements 11): groups that act together,
 * legendary creatures with counters, abilities that recharge on a die.
 *
 * Pure: no React, no db, no `server-only`. The server writes what is here
 * onto `initiative_entries` (`group_id`, `legendary`, and `turn.recharge`
 * inside 05's JSON column); the tracker reads it back through the same
 * functions. Nothing on either side re-derives a rule.
 */

import type { CreatureData } from '@/@shared/content';

/* --- legendary ------------------------------------------------------------- */

export interface LegendaryCounter {
  max: number;
  used: number;
}

/**
 * What a legendary creature carries into a fight. `actions` are the uses it
 * gets between other creatures' turns, back to full at the start of its own;
 * `resistances` are per day — a rest, not a turn, refills them; `lair` is
 * whether the room fights too, which puts a "Lair" row at initiative 20.
 */
export interface Legendary {
  actions: LegendaryCounter;
  resistances: LegendaryCounter;
  lair: boolean;
}

/** The book's default when a block has legendary actions but no count line. */
export const DEFAULT_LEGENDARY_ACTIONS = 3;

const counter = (raw: unknown, max: number): LegendaryCounter => {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const m =
    typeof obj.max === 'number' && Number.isFinite(obj.max)
      ? Math.max(0, Math.min(9, Math.trunc(obj.max)))
      : max;
  const u =
    typeof obj.used === 'number' && Number.isFinite(obj.used)
      ? Math.max(0, Math.min(m, Math.trunc(obj.used)))
      : 0;
  return { max: m, used: u };
};

/** The stored blob, checked. Null for the ordinary — a goblin has none. */
export function normalizeLegendary(raw: unknown): Legendary | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const out: Legendary = {
    actions: counter(obj.actions, 0),
    resistances: counter(obj.resistances, 0),
    lair: obj.lair === true,
  };
  if (out.actions.max === 0 && out.resistances.max === 0 && !out.lair) {
    return null;
  }
  return out;
}

/** "Legendary Resistance (3/Day, or 4/Day in Lair)" → 3. */
export function parseLegendaryResistance(traitName: string): number | null {
  const m = /^Legendary Resistance\s*\((\d)\/Day/i.exec(traitName.trim());
  return m ? Number(m[1]) : null;
}

/**
 * What a block says it can do beyond its turn. A block with legendary
 * actions gets three uses unless a line says otherwise; a "Legendary
 * Resistance (N/Day)" trait is N a day. Null when it has neither — most
 * things.
 */
export function legendaryFromBlock(d: CreatureData): Legendary | null {
  const actions =
    d.legendary_actions.length > 0 ? DEFAULT_LEGENDARY_ACTIONS : 0;
  let resistances = 0;
  for (const t of d.traits) {
    const n = parseLegendaryResistance(t.name);
    if (n !== null) resistances = Math.max(resistances, n);
  }
  if (actions === 0 && resistances === 0) return null;
  return {
    actions: { max: actions, used: 0 },
    resistances: { max: resistances, used: 0 },
    lair: false,
  };
}

/** Uses left, for a card's pips. */
export function legendaryLeft(c: LegendaryCounter): number {
  return Math.max(0, c.max - c.used);
}

/* --- recharge -------------------------------------------------------------- */

export interface RechargeState {
  /** The lowest d6 face that readies it. */
  min: number;
  ready: boolean;
}

export type RechargeMap = Record<string, RechargeState>;

/** Every ability on the block that recharges, all ready — the deal-in state. */
export function rechargeFromBlock(d: CreatureData): RechargeMap {
  const out: RechargeMap = {};
  for (const a of [...d.actions, ...d.bonus_actions, ...d.legendary_actions]) {
    if (a.recharge && a.recharge >= 2 && a.recharge <= 6) {
      out[a.name] = { min: a.recharge, ready: true };
    }
  }
  return out;
}

export function normalizeRecharge(raw: unknown): RechargeMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: RechargeMap = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    const min =
      typeof r.min === 'number' && Number.isFinite(r.min)
        ? Math.max(2, Math.min(6, Math.trunc(r.min)))
        : 6;
    out[name.slice(0, 120)] = { min, ready: r.ready !== false };
  }
  return out;
}

/**
 * Roll for everything spent, at the start of the creature's turn. Pure over
 * the faces so the server can hand the same dice to the log: one face per
 * ability that was not ready, in the map's order.
 */
export function rollRecharges(
  map: RechargeMap,
  faces: number[]
): {
  map: RechargeMap;
  verdicts: { name: string; face: number; ready: boolean }[];
} {
  const next: RechargeMap = { ...map };
  const verdicts: { name: string; face: number; ready: boolean }[] = [];
  let i = 0;
  for (const [name, state] of Object.entries(map)) {
    if (state.ready) continue;
    const face = faces[i++] ?? 1;
    const ready = face >= state.min;
    next[name] = { ...state, ready };
    verdicts.push({ name, face, ready });
  }
  return { map: next, verdicts };
}

/** How many dice `rollRecharges` will want. */
export function rechargesOwed(map: RechargeMap): number {
  return Object.values(map).filter(s => !s.ready).length;
}

/* --- groups ---------------------------------------------------------------- */

/**
 * Where the order goes next when consecutive rows sharing a `groupId` are
 * one turn. `turnIndex` still indexes the displayed order — the tracker
 * highlights every member — and the step lands on the first row of the next
 * group, or the next ungrouped row. Forwards wraps to the top and counts a
 * round; backwards lands on the *first* row of the previous group, so a
 * "Back" from the goblins does not stop on goblin 3.
 */
export function nextTurn(
  ordered: readonly { groupId: string | null }[],
  turnIndex: number,
  direction: 1 | -1
): { turn: number; wrapped: boolean } {
  const count = ordered.length;
  if (count === 0) return { turn: 0, wrapped: false };
  const groupAt = (i: number) => ordered[((i % count) + count) % count].groupId;
  const first = Math.max(0, Math.min(count - 1, turnIndex));
  const g = groupAt(first);

  if (direction === 1) {
    let i = first + 1;
    // Past the rest of this group, if it is one.
    while (i < count && g !== null && groupAt(i) === g) i++;
    if (i >= count) return { turn: 0, wrapped: true };
    return { turn: i, wrapped: false };
  }

  // Backwards: step off the current row, then walk to the head of whatever
  // group the row before belongs to.
  let i = first - 1;
  let wrapped = false;
  if (i < 0) {
    i = count - 1;
    wrapped = true;
  }
  const pg = groupAt(i);
  if (pg !== null) {
    while (i > 0 && groupAt(i - 1) === pg) i--;
  }
  return { turn: i, wrapped };
}

/** Every row that shares the turn with `turnIndex` — one for the ungrouped. */
export function turnMembers(
  ordered: readonly { groupId: string | null }[],
  turnIndex: number
): number[] {
  const count = ordered.length;
  if (count === 0) return [];
  const first = Math.max(0, Math.min(count - 1, turnIndex));
  const g = ordered[first].groupId;
  if (g === null) return [first];
  let lo = first;
  while (lo > 0 && ordered[lo - 1].groupId === g) lo--;
  let hi = first;
  while (hi + 1 < count && ordered[hi + 1].groupId === g) hi++;
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/**
 * "Goblin 3" → "The goblins": the turn event's label for a group. Strips the
 * numbering `numberDuplicates` adds and pluralises the plain way; a name
 * that already ends in s is left alone.
 */
export function groupLabel(memberLabel: string): string {
  const base = memberLabel.replace(/\s+\d+$/, '').trim();
  if (!base) return 'The group';
  const lower = base.toLowerCase();
  const plural = /s$/i.test(lower) ? lower : `${lower}s`;
  return `The ${plural}`;
}

/* --- the lair ---------------------------------------------------------------- */

/** Where the room acts: initiative 20, losing ties. */
export const LAIR_INITIATIVE = 20;
export const LAIR_LABEL = 'Lair';
