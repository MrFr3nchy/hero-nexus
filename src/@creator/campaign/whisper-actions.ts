'use server';

import { z } from 'zod';

import { listWhispers, sendWhisper, type WhisperRow } from '@/server/whispers';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That table no longer exists.',
    FORBIDDEN: 'You are not at this table.',
    NOTHING_TO_SAY: 'Say something.',
    NOBODY_TO_TELL: 'Nobody at this table would hear that.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const whisperSchema = z.object({
  body: z.string().trim().min(1, 'Say something.').max(500),
  targetUserIds: z.array(z.string().min(1)).min(1).max(50),
});

export async function listWhispersAction(
  campaignId: string
): Promise<WhisperRow[]> {
  try {
    return await listWhispers(campaignId);
  } catch {
    return [];
  }
}

export async function sendWhisperAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = whisperSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await sendWhisper(campaignId, parsed.data);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'That did not get passed along.');
  }
}
