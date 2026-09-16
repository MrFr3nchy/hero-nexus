'use server';

import { z } from 'zod';

import type { RollOutcome } from '@/@creator/campaign/lib/attack';
import type { WeaponAttack } from '@/@creator/character/lib/derive';
import type { ContentEntry } from '@/@shared/content';
import {
  applyDamage,
  attack,
  FacesNeeded,
  getEntryCreature,
  getMyAttacks,
  listThrowables,
  mySeat,
  type AttackResult,
  type Throwable,
} from '@/server/fight';
import { RuleRefusal } from '@/server/table-rules';

export async function getMyAttacksAction(
  characterId: string,
  campaignId: string
): Promise<WeaponAttack[]> {
  try {
    return await getMyAttacks(characterId, campaignId);
  } catch {
    return [];
  }
}

/** The pack as things to throw (09), lightest first. */
export async function listThrowablesAction(
  characterId: string,
  campaignId: string
): Promise<Throwable[]> {
  try {
    return await listThrowables(characterId, campaignId);
  } catch {
    return [];
  }
}

export async function getEntryCreatureAction(
  entryId: string
): Promise<ContentEntry | null> {
  try {
    return await getEntryCreature(entryId);
  } catch {
    return null;
  }
}

export async function mySeatAction(campaignId: string): Promise<string | null> {
  try {
    return await mySeat(campaignId);
  } catch {
    return null;
  }
}

/* --- an attack that lands (06) ------------------------------------------------ */

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | Refusal;

/**
 * `overridable` is set only when the rules refused and the caller is staff:
 * the control shows "Do it anyway" and re-sends with `{ ruling: true }`.
 * Decided on the server (`RuleRefusal`), never in the browser.
 */
type Refusal = {
  ok: false;
  error: string;
  overridable?: boolean;
  /**
   * Real dice (03): the swing wants this many faces and these sides — the
   * target's state gave it advantage, or a natural 20 doubled the damage
   * dice — so the control can ask for exactly those and send again.
   */
  needFaces?: { which: 'hit' | 'damage'; sides: number[] };
};

function fail(err: unknown, fallback: string): Refusal {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That is no longer in the fight.',
    FORBIDDEN: 'That is not yours to swing.',
    NO_SUCH_TARGET: 'That target is not in this fight.',
    NO_SHEET: 'No sheet to swing from.',
    NO_BLOCK: 'No stat block behind that combatant.',
    NO_SUCH_ACTION: 'That action is not on the block.',
    NOT_AN_ATTACK: 'That action names no attack roll.',
    NOT_IN_HAND: 'That weapon is not in hand.',
    NO_SUCH_ITEM: 'That is not in the pack any more.',
    TOO_HEAVY:
      'Too heavy to throw — over five pounds. The DM can rule it flies anyway.',
    NO_LINE: 'Total cover — there is no line to them.',
    NO_AMMUNITION: 'Nothing left to shoot.',
    ALREADY_ACTED: 'The action is spent this turn.',
    INCAPACITATED: 'They cannot act this turn.',
    NOTHING_TO_APPLY: 'That roll has no damage to land.',
    NOT_YOURS_TO_APPLY:
      'That hit is for the DM — or its target — to land, not you.',
    ALREADY_APPLIED: 'Already applied.',
    BAD_NOTATION: 'The weapon carries no dice the app can roll.',
    PHYSICAL_DICE_OFF:
      'This table rolls in the app. Ask the DM to allow real dice.',
    NEED_HIT_FACES: 'The swing takes a different number of d20s here.',
    NEED_DAMAGE_FACES: 'The damage takes a different number of dice here.',
  };
  if (!messages[code]) console.error('[fight-action]', fallback, err);
  return {
    ok: false,
    error: messages[code] ?? fallback,
    ...(err instanceof RuleRefusal && err.overridable
      ? { overridable: true }
      : {}),
    ...(err instanceof FacesNeeded
      ? {
          needFaces: {
            which: err.message === 'NEED_HIT_FACES' ? 'hit' : 'damage',
            sides: err.sides,
          },
          error:
            err.message === 'NEED_HIT_FACES'
              ? `The swing takes ${err.needed} d20${err.needed === 1 ? '' : 's'} here — the target's state changes the odds. Roll ${err.needed} and send the faces.`
              : `The damage takes ${err.needed} dice here — a natural 20 doubles them. Roll ${err.needed} and send the faces.`,
        }
      : {}),
  };
}

const weaponSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('item'),
    itemId: z.string().min(1).max(64),
    twoHanded: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('creature-action'),
    name: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal('improvised'),
    label: z.string().max(60),
    thrown: z.boolean(),
    damageType: z.string().max(20).nullable().optional(),
    itemId: z.string().max(64).nullable().optional(),
  }),
]);

const attackSchema = z.object({
  attackerEntryId: z.string().min(1).max(64),
  weapon: weaponSchema,
  targetEntryId: z.string().min(1).max(64).nullable(),
  mode: z.enum(['flat', 'advantage', 'disadvantage']),
  asReaction: z.boolean().optional(),
  damageOnMiss: z.boolean().optional(),
  ruling: z.boolean().optional(),
  hitFaces: z.array(z.number().int().min(1).max(20)).min(1).max(2).optional(),
  damageFaces: z
    .array(z.number().int().min(1).max(100))
    .min(1)
    .max(40)
    .optional(),
});

export type AttackActionInput = z.infer<typeof attackSchema>;

/** One swing: to hit, compared, damage rolled and adjusted, applied where allowed. */
export async function attackAction(
  input: unknown
): Promise<Result<AttackResult>> {
  const parsed = attackSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'That attack makes no sense.' };
  try {
    const data = await attack(parsed.data);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'The swing did not land.');
  }
}

/** Land a proposed hit on its target. Idempotent. */
export async function applyDamageAction(
  rollId: string
): Promise<Result<RollOutcome>> {
  try {
    const data = await applyDamage(rollId);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not apply that.');
  }
}
