'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  addSecret,
  addSheetNote,
  deleteSecret,
  deleteSheetNote,
  listPartySecrets,
  listSecrets,
  listSheetNotes,
  setSecretVisibility,
  setSheetNoteVisibility,
} from '@/server/sheet-notes';
import {
  NOTE_SECTIONS,
  type SecretRow,
  type SheetNoteRow,
} from './lib/note-sections';

/**
 * Actions behind the DM's sheet annotations and the per-character secret log.
 * Every permission decision lives in `@/server/sheet-notes`; this file only
 * validates input, maps thrown codes to reader-facing text, and revalidates
 * the two pages that render the data.
 */

export interface Result {
  ok: boolean;
  error?: string;
}

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'You are not signed in.',
  SESSION_STALE: 'Your session is out of date. Sign in again.',
  NOT_FOUND: 'That is no longer there.',
  NOT_IN_CAMPAIGN: 'This character does not play at a table yet.',
  FORBIDDEN: 'You do not have permission to do that.',
  EMPTY: 'Write something first.',
};

function fail(err: unknown, fallback: string): Result {
  const code = err instanceof Error ? err.message : '';
  const mapped = MESSAGES[code];
  if (!mapped) console.error('[action] Sheet note / secret failed.', err);
  return { ok: false, error: mapped ?? fallback };
}

/** Both surfaces that render notes: the DM's read-only view and the player's. */
function revalidateBoth(campaignId: string, characterId: string): void {
  revalidatePath(`/campaigns/${campaignId}/players/${characterId}`);
  revalidatePath(`/characters/${characterId}`);
}

const sectionSchema = z.enum(NOTE_SECTIONS);
const bodySchema = z.string().trim().min(1).max(4000);
const noteVisibilitySchema = z.enum(['shared', 'dm']);
const secretVisibilitySchema = z.enum(['dm', 'player', 'party']);

/* --- reads --------------------------------------------------------------- */

export async function listSheetNotesAction(
  characterId: string
): Promise<SheetNoteRow[]> {
  return listSheetNotes(characterId);
}

export async function listSecretsAction(
  characterId: string
): Promise<SecretRow[]> {
  return listSecrets(characterId);
}

export async function listPartySecretsAction(campaignId: string) {
  return listPartySecrets(campaignId);
}

/* --- sheet notes --------------------------------------------------------- */

export async function addSheetNoteAction(
  campaignId: string,
  characterId: string,
  section: string,
  body: string,
  visibility: string
): Promise<Result> {
  const parsed = z
    .object({
      section: sectionSchema,
      body: bodySchema,
      visibility: noteVisibilitySchema,
    })
    .safeParse({ section, body, visibility });
  if (!parsed.success) {
    return { ok: false, error: 'Write a comment of 4000 characters or fewer.' };
  }

  try {
    await addSheetNote(
      characterId,
      parsed.data.section,
      parsed.data.body,
      parsed.data.visibility
    );
    revalidateBoth(campaignId, characterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the comment.');
  }
}

export async function setSheetNoteVisibilityAction(
  campaignId: string,
  characterId: string,
  noteId: string,
  visibility: string
): Promise<Result> {
  const parsed = noteVisibilitySchema.safeParse(visibility);
  if (!parsed.success) return { ok: false, error: 'Unknown visibility.' };

  try {
    await setSheetNoteVisibility(noteId, parsed.data);
    revalidateBoth(campaignId, characterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change who sees that comment.');
  }
}

export async function deleteSheetNoteAction(
  campaignId: string,
  characterId: string,
  noteId: string
): Promise<Result> {
  try {
    await deleteSheetNote(noteId);
    revalidateBoth(campaignId, characterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete the comment.');
  }
}

/* --- secrets ------------------------------------------------------------- */

export async function addSecretAction(
  campaignId: string,
  characterId: string,
  body: string,
  visibility: string
): Promise<Result> {
  const parsed = z
    .object({ body: bodySchema, visibility: secretVisibilitySchema })
    .safeParse({ body, visibility });
  if (!parsed.success) {
    return { ok: false, error: 'Write a secret of 4000 characters or fewer.' };
  }

  try {
    await addSecret(characterId, parsed.data.body, parsed.data.visibility);
    revalidateBoth(campaignId, characterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the secret.');
  }
}

export async function setSecretVisibilityAction(
  campaignId: string,
  characterId: string,
  secretId: string,
  visibility: string
): Promise<Result> {
  const parsed = secretVisibilitySchema.safeParse(visibility);
  if (!parsed.success) return { ok: false, error: 'Unknown visibility.' };

  try {
    await setSecretVisibility(secretId, parsed.data);
    revalidateBoth(campaignId, characterId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change who knows that.');
  }
}

export async function deleteSecretAction(
  campaignId: string,
  characterId: string,
  secretId: string
): Promise<Result> {
  try {
    await deleteSecret(secretId);
    revalidateBoth(campaignId, characterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete the secret.');
  }
}
