/**
 * The turn: an action, a bonus action, a reaction, and some feet of movement.
 *
 * What one combatant has spent since their turn began, as a small JSON blob
 * on the tracker row (`initiative_entries.turn`, 0050), and the fixed list of
 * things a turn can be spent on. The server writes it; the strip on the card
 * and the pips under the token read it; `advanceTurn` resets it when the turn
 * comes round again.
 *
 * Whether a spent slot is a *refusal* or a *note* is the table's call (01):
 * `spend` here only says which. Pure — no React, no DB.
 */

import { normalizeRecharge } from './monsters';

export interface TurnState {
  /** The action is spent. */
  action: boolean;
  bonus: boolean;
  /** Spent since the start of this creature's last turn. */
  reaction: boolean;
  movedFeet: number;
  /** Dash: this turn's speed is doubled. */
  dashed: boolean;
  /** Disengage: leaving reach provokes nothing this turn. */
  disengaged: boolean;
  /** Dodge: attacks against have disadvantage until the start of its next turn. */
  dodging: boolean;
  /** The one free object interaction — a weapon drawn or stowed. */
  freeInteraction: boolean;
  /** Ready: an action held behind a trigger, resolved with the reaction. */
  ready?: { trigger: string; action: string };
  /** Took Hide and the DM said it worked. A flag, not stealth maths. */
  hidden?: boolean;
  /**
   * Abilities that recharge on a d6 (11), by name: the face that readies
   * each and whether it is ready now. Rolled at the start of the creature's
   * turn; a rest readies everything. Absent for anything without one.
   */
  recharge?: Record<string, { min: number; ready: boolean }>;
}

export const FRESH_TURN: TurnState = {
  action: false,
  bonus: false,
  reaction: false,
  movedFeet: 0,
  dashed: false,
  disengaged: false,
  dodging: false,
  freeInteraction: false,
};

/**
 * Read the stored blob. Anything missing is unspent, so a row from before
 * the column existed — and `'{}'`, the default — is a fresh turn.
 */
export function parseTurn(raw: unknown): TurnState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const flag = (k: keyof TurnState) => r[k] === true;
  const ready =
    r.ready && typeof r.ready === 'object'
      ? {
          trigger: String((r.ready as { trigger?: unknown }).trigger ?? ''),
          action: String((r.ready as { action?: unknown }).action ?? ''),
        }
      : undefined;
  return {
    action: flag('action'),
    bonus: flag('bonus'),
    reaction: flag('reaction'),
    movedFeet: Math.max(0, Math.trunc(Number(r.movedFeet) || 0)),
    dashed: flag('dashed'),
    disengaged: flag('disengaged'),
    dodging: flag('dodging'),
    freeInteraction: flag('freeInteraction'),
    ...(ready && (ready.trigger || ready.action) ? { ready } : {}),
    ...(r.hidden === true ? { hidden: true } : {}),
    ...(r.recharge && typeof r.recharge === 'object'
      ? { recharge: normalizeRecharge(r.recharge) }
      : {}),
  };
}

/**
 * The turn comes round: everything resets, the reaction included (2024:
 * your reaction comes back at the start of your turn), and Dodge — which
 * lasts *until* the start of your next turn — ends here. A held Ready that
 * never triggered is gone too; the action it held was this turn's.
 *
 * `hidden` survives: being unseen is a state of the room, not of the turn.
 */
export function beginTurn(prev: TurnState): TurnState {
  return {
    ...FRESH_TURN,
    ...(prev.hidden ? { hidden: true } : {}),
    // Recharge survives too: what is spent stays spent until the die says
    // otherwise, and the server rolls that die right after this.
    ...(prev.recharge ? { recharge: prev.recharge } : {}),
  };
}

export type TurnSlot = 'action' | 'bonus' | 'reaction' | 'interaction';

/**
 * Spend a slot. Null when it is already spent — the caller decides whether
 * that is a refusal (enforce) or a line marked "again" (advise).
 */
export function spend(turn: TurnState, what: TurnSlot): TurnState | null {
  const key: keyof TurnState =
    what === 'interaction' ? 'freeInteraction' : what;
  if (turn[key]) return null;
  return { ...turn, [key]: true };
}

/** Feet left to walk this turn. Dash doubles the speed it is measured against. */
export function movementBudget(turn: TurnState, speedFeet: number): number {
  return Math.max(0, speedFeet * (turn.dashed ? 2 : 1) - turn.movedFeet);
}

/* --- the actions --------------------------------------------------------- */

export type ActionCost = 'action' | 'bonus' | 'reaction' | 'movement' | 'free';

export interface ActionDef {
  key: ActionKey;
  label: string;
  cost: ActionCost;
  /** One line, the part a player needs mid-turn. */
  rule: string;
  /** Whether the line asks for a note — what is readied, who is helped. */
  note?: 'optional' | 'required';
}

export const ACTION_KEYS = [
  'attack',
  'magic',
  'dash',
  'disengage',
  'dodge',
  'help',
  'hide',
  'influence',
  'ready',
  'search',
  'study',
  'utilize',
  'bonus',
  'reaction',
  'opportunity',
  'jump',
  'stand',
] as const;

export type ActionKey = (typeof ACTION_KEYS)[number];

export const ACTIONS: ActionDef[] = [
  {
    key: 'attack',
    label: 'Attack',
    cost: 'action',
    rule: 'One attack with a weapon or an unarmed strike. Extra Attack adds more.',
  },
  {
    key: 'magic',
    label: 'Magic',
    cost: 'action',
    rule: 'Cast a spell, use a magic item, or use a magical feature.',
  },
  {
    key: 'dash',
    label: 'Dash',
    cost: 'action',
    rule: 'Extra movement equal to your speed this turn.',
  },
  {
    key: 'disengage',
    label: 'Disengage',
    cost: 'action',
    rule: 'Your movement provokes no opportunity attacks this turn.',
  },
  {
    key: 'dodge',
    label: 'Dodge',
    cost: 'action',
    rule: 'Attacks against you have disadvantage and your DEX saves have advantage until your next turn — while you can see the attacker and are not incapacitated or at speed 0.',
  },
  {
    key: 'help',
    label: 'Help',
    cost: 'action',
    rule: 'Give an ally advantage on their next check or attack against a creature within 5 ft of you.',
    note: 'optional',
  },
  {
    key: 'hide',
    label: 'Hide',
    cost: 'action',
    rule: 'DC 15 Dexterity (Stealth) while heavily obscured or behind cover, out of sight.',
  },
  {
    key: 'influence',
    label: 'Influence',
    cost: 'action',
    rule: 'Persuade, deceive, intimidate or perform — a Charisma or Wisdom check against the DM’s DC.',
    note: 'optional',
  },
  {
    key: 'ready',
    label: 'Ready',
    cost: 'action',
    rule: 'Hold an action behind a trigger; take it as a reaction when the trigger happens. A readied spell needs concentration.',
    note: 'required',
  },
  {
    key: 'search',
    label: 'Search',
    cost: 'action',
    rule: 'A Wisdom check — Insight, Medicine, Perception or Survival.',
  },
  {
    key: 'study',
    label: 'Study',
    cost: 'action',
    rule: 'An Intelligence check — Arcana, History, Investigation, Nature or Religion.',
  },
  {
    key: 'utilize',
    label: 'Utilize',
    cost: 'action',
    rule: 'Use a non-magical object — a second weapon swap, a lever, a potion at some tables.',
    note: 'optional',
  },
  {
    key: 'bonus',
    label: 'Bonus action',
    cost: 'bonus',
    rule: 'Only what a feature grants as one: an off-hand attack, Cunning Action, a bonus-action spell.',
    note: 'optional',
  },
  {
    key: 'reaction',
    label: 'Reaction',
    cost: 'reaction',
    rule: 'One per round, back at the start of your turn. Shield, Counterspell, Uncanny Dodge — or the readied action.',
    note: 'optional',
  },
  {
    key: 'opportunity',
    label: 'Opportunity attack',
    cost: 'reaction',
    rule: 'One melee attack against a creature you can see leaving your reach, unless it Disengaged.',
  },
  {
    key: 'jump',
    label: 'Jump',
    cost: 'movement',
    rule: 'Long jump your Strength score in feet after a 10 ft run-up (half standing); high jump 3 + your Strength modifier. Each foot costs a foot of movement.',
  },
  {
    key: 'stand',
    label: 'Stand up',
    cost: 'movement',
    rule: 'Standing from prone costs half your speed.',
  },
];

const BY_KEY = new Map(ACTIONS.map(a => [a.key, a]));

export function actionDef(key: string): ActionDef | undefined {
  return BY_KEY.get(key as ActionKey);
}

/** What taking an action does to the turn, before the slot itself is spent. */
export function applyAction(
  turn: TurnState,
  key: ActionKey,
  note: string,
  speedFeet: number
): TurnState {
  switch (key) {
    case 'dash':
      return { ...turn, dashed: true };
    case 'disengage':
      return { ...turn, disengaged: true };
    case 'dodge':
      return { ...turn, dodging: true };
    case 'hide':
      return { ...turn, hidden: true };
    case 'ready': {
      // "if the door opens → cast Shield"; one field, split on the arrow
      // when the writer used one, else the whole line is the trigger.
      const [trigger, action = ''] = note.split(/\s*(?:→|->|=>)\s*/, 2);
      return {
        ...turn,
        ready: { trigger: trigger.trim(), action: action.trim() },
      };
    }
    case 'stand':
      return {
        ...turn,
        movedFeet: turn.movedFeet + Math.floor(speedFeet / 2 / 5) * 5,
      };
    default:
      return turn;
  }
}

/** The slot an action spends, or null for a movement-side entry. */
export function slotFor(def: ActionDef): TurnSlot | null {
  switch (def.cost) {
    case 'action':
      return 'action';
    case 'bonus':
      return 'bonus';
    case 'reaction':
      return 'reaction';
    default:
      return null;
  }
}
