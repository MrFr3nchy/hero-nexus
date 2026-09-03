'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  createSession,
  deleteSession,
  fileUnderSession,
  listSessions,
  markSessionPlayed,
  nextSession,
  setAttendance,
  setRecapVisibility,
  updateSession,
  type SessionRow,
} from '@/server/campaign-sessions';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That session no longer exists.',
    FORBIDDEN: 'You do not have permission to do that.',
    NOT_A_MEMBER: 'That person is not at this table.',
    RECAP_EMPTY: 'Write the recap before handing it to the party.',
  };
  // Unmapped errors reach the client as a generic sentence, which makes them
  // invisible in a bug report. Keep the real one in the server log.
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/** ISO calendar date, or empty for "no date yet". */
const isoDate = z
  .string()
  .trim()
  .max(40)
  .refine(v => v === '' || !Number.isNaN(Date.parse(v)), 'Not a date.');

const sessionSchema = z.object({
  title: z.string().trim().max(160),
  scheduledFor: isoDate.optional(),
  playedOn: isoDate.optional(),
  status: z.enum(['planned', 'played', 'cancelled']).optional(),
  prepBody: z.string().max(20000).optional(),
  recapBody: z.string().max(20000).optional(),
});

/* --- read ------------------------------------------------------------- */

export async function listSessionsAction(
  campaignId: string
): Promise<SessionRow[]> {
  return listSessions(campaignId);
}

export async function nextSessionAction(campaignId: string) {
  return nextSession(campaignId);
}

/* --- mutations -------------------------------------------------------- */

export async function createSessionAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await createSession(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to open the session.');
  }
}

export async function updateSessionAction(
  campaignId: string,
  sessionId: string,
  input: unknown
): Promise<Result> {
  const parsed = sessionSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updateSession(sessionId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the session.');
  }
}

export async function markSessionPlayedAction(
  campaignId: string,
  sessionId: string
): Promise<Result> {
  try {
    await markSessionPlayed(sessionId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to close the session.');
  }
}

export async function setRecapVisibilityAction(
  campaignId: string,
  sessionId: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  try {
    await setRecapVisibility(sessionId, visibility);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change who can read the recap.');
  }
}

export async function setAttendanceAction(
  campaignId: string,
  sessionId: string,
  userId: string,
  status: 'present' | 'absent' | 'late'
): Promise<Result> {
  try {
    await setAttendance(sessionId, userId, status);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to record attendance.');
  }
}

export async function deleteSessionAction(
  campaignId: string,
  sessionId: string
): Promise<Result> {
  try {
    await deleteSession(sessionId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove the session.');
  }
}

export async function fileUnderSessionAction(
  campaignId: string,
  kind: 'encounter' | 'handout' | 'downtime',
  targetId: string,
  sessionId: string | null
): Promise<Result> {
  try {
    await fileUnderSession(kind, targetId, sessionId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to file that under the session.');
  }
}
