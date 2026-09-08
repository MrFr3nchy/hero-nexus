'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  createJournal,
  deleteJournal,
  listJournals,
  updateJournal,
  type JournalRow,
} from '@/server/journals';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That page no longer exists.',
    FORBIDDEN: 'That page is not yours.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const journalSchema = z.object({
  title: z.string().trim().min(1, 'Give the page a name.').max(160),
  body: z.string().max(20000).optional(),
  visibility: z.enum(['private', 'dm', 'party']).optional(),
  sessionId: z.string().min(1).nullable().optional(),
});

export async function listJournalsAction(
  campaignId: string
): Promise<JournalRow[]> {
  return listJournals(campaignId);
}

export async function createJournalAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = journalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await createJournal(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to start the page.');
  }
}

export async function updateJournalAction(
  campaignId: string,
  journalId: string,
  input: unknown
): Promise<Result> {
  const parsed = journalSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updateJournal(campaignId, journalId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the page.');
  }
}

export async function deleteJournalAction(
  campaignId: string,
  journalId: string
): Promise<Result> {
  try {
    await deleteJournal(campaignId, journalId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to tear out the page.');
  }
}
