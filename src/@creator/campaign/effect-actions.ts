'use server';

import { z } from 'zod';

import { CONDITION_KEYS } from '@/@creator/campaign/lib/conditions';
import { EFFECT_KINDS, MAX_ROUNDS } from '@/@creator/campaign/lib/effects';
import { ABILITY_KEYS } from '@/@creator/character/schema';
import {
  adjustEffectRounds,
  applyEffect,
  removeEffect,
} from '@/server/effects';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That fight is over, or never was.',
    FORBIDDEN: 'Only the DM and co-DMs put effects on the table.',
    NO_SUCH_CONDITION: 'That is not one of the conditions.',
    NEEDS_A_NAME: 'Give it a name.',
    NEEDS_ROUNDS: 'A countdown needs a number of rounds.',
    NOBODY_TO_AFFECT: 'Nobody in the fight was picked.',
  };
  if (!messages[code]) console.error('[effect-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const inputSchema = z.object({
  kind: z.enum(EFFECT_KINDS),
  conditionKey: z.enum(CONDITION_KEYS).nullable().optional(),
  label: z.string().max(80).optional(),
  rounds: z.number().int().min(0).max(MAX_ROUNDS).nullable().optional(),
  endsOn: z.enum(['start', 'end']).optional(),
  anchorEntryId: z.string().max(64).nullable().optional(),
  saveAbility: z.enum(ABILITY_KEYS).nullable().optional(),
  saveDc: z.number().int().min(1).max(40).nullable().optional(),
  sourceEntryId: z.string().max(64).nullable().optional(),
  sourceLabel: z.string().max(80).optional(),
  concentration: z.boolean().optional(),
  visibility: z.enum(['dm', 'shared']).optional(),
});

export type EffectActionInput = z.infer<typeof inputSchema>;

/**
 * Put one effect on some combatants — or, for a countdown, on the room.
 * One call for the whole selection, so three goblins put to sleep is one
 * announcement rather than three.
 */
export async function applyEffectAction(
  encounterId: string,
  entryIds: string[],
  input: unknown
): Promise<Result<{ ids: string[] }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'That effect makes no sense.' };
  try {
    const ids = await applyEffect(
      encounterId,
      z.array(z.string().max(64)).max(100).parse(entryIds),
      parsed.data
    );
    return { ok: true, data: { ids } };
  } catch (err) {
    return fail(err, 'Could not put that on the table.');
  }
}

export async function removeEffectAction(effectId: string): Promise<Result> {
  try {
    await removeEffect(effectId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that off.');
  }
}

/** ±1 round, for a DM correcting a count. */
export async function adjustEffectRoundsAction(
  effectId: string,
  delta: number
): Promise<Result> {
  const parsed = z.number().int().min(-10).max(10).safeParse(delta);
  if (!parsed.success) return { ok: false, error: 'One round at a time.' };
  try {
    await adjustEffectRounds(effectId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the count.');
  }
}
