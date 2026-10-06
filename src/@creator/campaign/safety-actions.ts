'use server';

import { z } from 'zod';

import {
  SAFETY_TEXT_MAX,
  type SafetyRow,
} from '@/@creator/campaign/lib/safety';
import {
  addSafety,
  deleteSafety,
  listSafety,
  planSessionZero,
  sessionZero,
  tapXCard,
} from '@/server/safety';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

/**
 * Error mapping. Deliberately logs nothing about the caller: an unmapped
 * error is logged with the code only, never with who asked.
 */
function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That campaign is not one you sit at.',
    FORBIDDEN: 'That is for the DM.',
    EMPTY: 'Write something first.',
    BAD_KIND: 'A line or a veil.',
    RATE_LIMITED: 'Give it a minute.',
  };
  if (!messages[code]) console.error('[safety-action]', fallback, code);
  return { ok: false, error: messages[code] ?? fallback };
}

export async function listSafetyAction(
  campaignId: string
): Promise<Result<SafetyRow[]>> {
  try {
    return { ok: true, data: await listSafety(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the lines and veils.');
  }
}

const addSchema = z.object({
  kind: z.enum(['line', 'veil']),
  text: z.string().trim().min(1).max(SAFETY_TEXT_MAX),
});

export async function addSafetyAction(
  campaignId: string,
  input: unknown
): Promise<Result> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Write something first.' };
  try {
    await addSafety(campaignId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not add that.');
  }
}

export async function deleteSafetyAction(
  campaignId: string,
  id: string
): Promise<Result> {
  try {
    await deleteSafety(campaignId, id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that down.');
  }
}

export async function tapXCardAction(
  campaignId: string
): Promise<Result<{ pausedTimers: number }>> {
  try {
    return { ok: true, data: await tapXCard(campaignId) };
  } catch (err) {
    return fail(err, 'The X-card did not go through. Say so out loud.');
  }
}

export async function sessionZeroAction(
  campaignId: string
): Promise<Result<{ id: string; status: string } | null>> {
  try {
    return { ok: true, data: await sessionZero(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read session zero.');
  }
}

export async function planSessionZeroAction(
  campaignId: string
): Promise<Result<{ id: string }>> {
  try {
    return { ok: true, data: { id: await planSessionZero(campaignId) } };
  } catch (err) {
    return fail(err, 'Could not plan session zero.');
  }
}
