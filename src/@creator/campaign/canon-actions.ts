'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  CANON_KINDS,
  createCanonEntry,
  deleteCanonEntry,
  linkCanon,
  listCanon,
  revealCanonTo,
  setCanonVisibility,
  unlinkCanon,
  unrevealCanonTo,
  updateCanonEntry,
  type CanonEntryRow,
} from '@/server/canon';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    NOT_FOUND: 'That canon entry no longer exists.',
    FORBIDDEN: 'Only the DM can edit canon.',
    NOT_A_MEMBER: 'That person is not in this campaign.',
    CANNOT_LINK_SELF: 'An entry cannot link to itself.',
  };
  return { ok: false, error: messages[code] ?? fallback };
}

const entrySchema = z.object({
  kind: z.enum(CANON_KINDS),
  title: z.string().trim().min(1, 'A title is required.').max(200),
  dmBody: z.string().max(20000),
  partyBody: z.string().max(20000),
  visibility: z.enum(['dm', 'shared']).optional(),
});

export async function listCanonAction(
  campaignId: string
): Promise<CanonEntryRow[]> {
  return listCanon(campaignId);
}

export async function createCanonAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid entry.',
    };
  }
  try {
    const id = await createCanonEntry(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to create the entry.');
  }
}

export async function updateCanonAction(
  campaignId: string,
  entryId: string,
  input: unknown
): Promise<Result> {
  const parsed = entrySchema.partial().safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid entry.',
    };
  }
  try {
    await updateCanonEntry(entryId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the entry.');
  }
}

export async function deleteCanonAction(
  campaignId: string,
  entryId: string
): Promise<Result> {
  try {
    await deleteCanonEntry(entryId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete the entry.');
  }
}

export async function setCanonVisibilityAction(
  campaignId: string,
  entryId: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  try {
    await setCanonVisibility(entryId, visibility);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change visibility.');
  }
}

export async function linkCanonAction(
  campaignId: string,
  fromEntryId: string,
  toEntryId: string
): Promise<Result> {
  try {
    await linkCanon(fromEntryId, toEntryId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to link entries.');
  }
}

export async function unlinkCanonAction(
  campaignId: string,
  fromEntryId: string,
  toEntryId: string
): Promise<Result> {
  try {
    await unlinkCanon(fromEntryId, toEntryId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to unlink entries.');
  }
}

export async function revealCanonAction(
  campaignId: string,
  entryId: string,
  userId: string
): Promise<Result> {
  try {
    await revealCanonTo(entryId, userId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to reveal the entry.');
  }
}

export async function unrevealCanonAction(
  campaignId: string,
  entryId: string,
  userId: string
): Promise<Result> {
  try {
    await unrevealCanonTo(entryId, userId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to hide the entry.');
  }
}
