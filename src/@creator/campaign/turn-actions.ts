'use server';

import { z } from 'zod';

import { ACTION_KEYS, type TurnState } from '@/@creator/campaign/lib/turn';
import { RuleRefusal } from '@/server/table-rules';
import { resetTurn, takeAction } from '@/server/turn';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | Refusal;

/**
 * `overridable` is set only when the rules refused and the caller is staff:
 * the control shows "Do it anyway" and re-sends with `{ ruling: true }`.
 * Decided on the server (`RuleRefusal`), never in the browser.
 */
type Refusal = { ok: false; error: string; overridable?: boolean };

function fail(err: unknown, fallback: string): Refusal {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That combatant is no longer in the fight.',
    FORBIDDEN: 'That is not your turn to spend.',
    NO_SUCH_ACTION: 'That is not one of the actions.',
    NEEDS_A_NOTE:
      'Say what is being readied — "if the door opens → cast Shield".',
    ALREADY_ACTED: 'That is already spent this turn.',
    INCAPACITATED: 'They cannot act this turn.',
  };
  if (!messages[code]) console.error('[turn-action]', fallback, err);
  return {
    ok: false,
    error: messages[code] ?? fallback,
    ...(err instanceof RuleRefusal && err.overridable
      ? { overridable: true }
      : {}),
  };
}

const optsSchema = z.object({
  note: z.string().max(120).optional(),
  ruling: z.boolean().optional(),
});

/** Spend part of a turn. A player for their own hero, staff for anyone. */
export async function takeActionAction(
  entryId: string,
  key: unknown,
  opts: unknown = {}
): Promise<Result<TurnState>> {
  const parsedKey = z.enum(ACTION_KEYS).safeParse(key);
  if (!parsedKey.success)
    return { ok: false, error: 'That is not one of the actions.' };
  const parsedOpts = optsSchema.safeParse(opts ?? {});
  if (!parsedOpts.success) return { ok: false, error: 'Bad note.' };
  try {
    const data = await takeAction(entryId, parsedKey.data, parsedOpts.data);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not take that.');
  }
}

/** Hand a turn back unspent. Staff only. */
export async function resetTurnAction(entryId: string): Promise<Result> {
  try {
    await resetTurn(entryId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not reset the turn.');
  }
}
