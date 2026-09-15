/**
 * What an ask settles when it is answered.
 *
 * The Asking used to decide nothing beyond pass or fail; 04 taught it to end
 * an effect, and 07 teaches it to land a spell and to hold or drop
 * concentration. Rather than a column per consequence, the server writes one
 * of these onto `campaign_checks.payload` when it asks and reads it back when
 * the target answers. The browser never sets it — which is what lets the
 * server trust the damage waiting inside.
 *
 * Pure types, shared by `server/checks.ts`, `server/casting.ts` and the panel.
 */
import type { ConditionKey } from './conditions';

export interface SpellSavePayload {
  kind: 'spell';
  castId: string;
  casterEntryId: string | null;
  casterLabel: string;
  spellKey: string;
  spellName: string;
  targetEntryId: string;
  /** Damage waiting on the verdict, already rolled and adjusted for the target. */
  damage: { amount: number; type: string | null } | null;
  saveEffect: 'none' | 'half' | 'negates';
  condition: ConditionKey | null;
  durationRounds: number;
  concentration: boolean;
}

export interface ConcentrationPayload {
  kind: 'concentration';
  entryId: string;
  spellName: string;
}

/**
 * A fellow player's spell wants to land on you. Allow applies it with no
 * roll; contest rolls the save; refuse costs the caster nothing. The pending
 * casting sits here so the server can pick it up on the answer.
 */
export interface ConsentPayload {
  kind: 'consent';
  castId: string;
  casterEntryId: string | null;
  casterCharacterId: string;
  casterLabel: string;
  spellKey: string;
  spellName: string;
  slotLevel: number | null;
  ritual: boolean;
  targetEntryId: string;
  /** Whether this answer is the one that pays the slot. */
  pays: boolean;
}

export type CheckPayload =
  | SpellSavePayload
  | ConcentrationPayload
  | ConsentPayload;

export type ConsentAnswer = 'allow' | 'contest' | 'refuse';
