'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  addPin,
  createMap,
  deleteMap,
  deletePin,
  listMaps,
  setMapVisibility,
  updatePin,
  type MapRow,
} from '@/server/maps';

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
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const pinSchema = z.object({
  x: z.number(),
  y: z.number(),
  label: z.string().trim().max(120).optional(),
  dmNote: z.string().max(2000).optional(),
  canonEntryId: z.string().min(1).nullable().optional(),
  visibility: z.enum(['dm', 'shared']).optional(),
});

export async function listMapsAction(campaignId: string): Promise<MapRow[]> {
  return listMaps(campaignId);
}

export async function createMapAction(
  campaignId: string,
  imageId: string,
  title: string
): Promise<Result<{ id: string }>> {
  try {
    const id = await createMap(campaignId, { imageId, title });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to pin up the map.');
  }
}

export async function setMapVisibilityAction(
  campaignId: string,
  mapId: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  try {
    await setMapVisibility(mapId, visibility);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change who sees the map.');
  }
}

export async function deleteMapAction(
  campaignId: string,
  mapId: string
): Promise<Result> {
  try {
    await deleteMap(mapId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to take the map down.');
  }
}

export async function addPinAction(
  campaignId: string,
  mapId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = pinSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await addPin(mapId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to mark it.');
  }
}

export async function updatePinAction(
  campaignId: string,
  pinId: string,
  input: unknown
): Promise<Result> {
  const parsed = pinSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updatePin(pinId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to move the mark.');
  }
}

export async function deletePinAction(
  campaignId: string,
  pinId: string
): Promise<Result> {
  try {
    await deletePin(pinId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove the mark.');
  }
}
