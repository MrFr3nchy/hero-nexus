'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  createClock,
  deleteClock,
  listClocks,
  tickClock,
  updateClock,
  type ClockRow,
} from '@/server/clocks';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That clock no longer exists.',
    FORBIDDEN: 'You do not have permission to do that.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const clockSchema = z.object({
  title: z.string().trim().min(1, 'Name the clock.').max(160),
  dmNote: z.string().max(4000).optional(),
  segments: z.number().int().optional(),
  visibility: z.enum(['dm', 'shared']).optional(),
});

export async function listClocksAction(
  campaignId: string
): Promise<ClockRow[]> {
  return listClocks(campaignId);
}

export async function createClockAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = clockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await createClock(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to wind the clock.');
  }
}

export async function updateClockAction(
  campaignId: string,
  clockId: string,
  input: unknown
): Promise<Result> {
  const parsed = clockSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updateClock(clockId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change the clock.');
  }
}

export async function tickClockAction(
  campaignId: string,
  clockId: string,
  delta: number
): Promise<Result<ClockRow>> {
  if (!Number.isInteger(delta) || Math.abs(delta) > 12) {
    return { ok: false, error: 'That is not a tick.' };
  }
  try {
    const data = await tickClock(clockId, delta);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Failed to move the hand.');
  }
}

export async function deleteClockAction(
  campaignId: string,
  clockId: string
): Promise<Result> {
  try {
    await deleteClock(clockId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to stop the clock.');
  }
}
