'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  addRevealTarget,
  createNote,
  deleteNote,
  deleteReveal,
  listNotes,
  listReveals,
  revealExcerpt,
  updateNote,
  widenRevealToParty,
  type NoteRow,
  type RevealRow,
} from '@/server/notes';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That no longer exists.',
    FORBIDDEN: 'You do not have permission to do that.',
    NOT_A_MEMBER: 'That person is not at this table.',
    EMPTY_REVEAL: 'There is nothing selected to reveal.',
    NO_TARGETS: 'Choose who this goes to first.',
    ALREADY_PARTY_WIDE: 'The whole table can already see that.',
    SELECTED_CANNOT_BROADCAST:
      'A reveal for named players cannot also be posted where the whole table reads it.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const noteSchema = z.object({
  title: z.string().trim().min(1, 'Give the page a name.').max(160),
  body: z.string().max(20000).optional(),
  tags: z.array(z.string().trim().max(40)).max(12).optional(),
  pinned: z.boolean().optional(),
  sessionId: z.string().min(1).nullable().optional(),
  visibility: z.enum(['dm', 'shared']).optional(),
});

const revealSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'There is nothing selected to reveal.')
    .max(8000),
  sourceKind: z.enum(['note', 'session', 'quest', 'canon', 'free']).optional(),
  sourceId: z.string().min(1).nullable().optional(),
  sessionId: z.string().min(1).nullable().optional(),
  visibility: z.enum(['party', 'selected']).optional(),
  targetUserIds: z.array(z.string().min(1)).max(50).optional(),
  appendToCanonId: z.string().min(1).nullable().optional(),
  appendToRecapSessionId: z.string().min(1).nullable().optional(),
  asHandoutTitle: z.string().trim().max(160).nullable().optional(),
});

/* --- read ------------------------------------------------------------- */

export async function listNotesAction(campaignId: string): Promise<NoteRow[]> {
  return listNotes(campaignId);
}

export async function listRevealsAction(
  campaignId: string
): Promise<RevealRow[]> {
  return listReveals(campaignId);
}

/* --- the notebook ------------------------------------------------------ */

export async function createNoteAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await createNote(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to add the page.');
  }
}

export async function updateNoteAction(
  campaignId: string,
  noteId: string,
  input: unknown
): Promise<Result> {
  const parsed = noteSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updateNote(noteId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the page.');
  }
}

export async function deleteNoteAction(
  campaignId: string,
  noteId: string
): Promise<Result> {
  try {
    await deleteNote(noteId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove the page.');
  }
}

/* --- reveals ----------------------------------------------------------- */

export async function revealExcerptAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await revealExcerpt(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to reveal that.');
  }
}

export async function widenRevealAction(
  campaignId: string,
  revealId: string
): Promise<Result> {
  try {
    await widenRevealToParty(revealId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to tell the rest of the table.');
  }
}

export async function addRevealTargetAction(
  campaignId: string,
  revealId: string,
  targetUserId: string
): Promise<Result> {
  try {
    await addRevealTarget(revealId, targetUserId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to pass that on.');
  }
}

export async function deleteRevealAction(
  campaignId: string,
  revealId: string
): Promise<Result> {
  try {
    await deleteReveal(revealId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to strike that from the record.');
  }
}
