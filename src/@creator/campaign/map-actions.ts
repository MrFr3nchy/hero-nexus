'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { FOG_CELLS, MARK_KINDS } from '@/@creator/campaign/lib/party-map';
import {
  addJourneyStop,
  addPin,
  promoteRumour,
  arriveAtStop,
  createMap,
  deleteMap,
  deletePin,
  listMaps,
  mapLinks,
  recordsOnMaps,
  removeJourneyStop,
  renameJourneyStop,
  renameMap,
  revealMapCells,
  setMapFog,
  setMapPlace,
  setMapVisibility,
  setStopVisibility,
  setMarksOpen,
  spotlightMap,
  updatePin,
  type MapRow,
  type RecordOnMap,
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
    MARKS_CLOSED: 'The DM has not opened this map for marks.',
    IN_FOG: 'That part of the map is still in fog.',
    NOT_A_PLACE: 'A map shows a place — pick a canon entry that is one.',
    NOT_A_RUMOUR: 'Only a rumour can be made real.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const link = z.string().min(1).max(64).nullable().optional();

const pinSchema = z.object({
  x: z.number(),
  y: z.number(),
  label: z.string().trim().max(120).optional(),
  kind: z.enum(MARK_KINDS).optional(),
  note: z.string().max(2000).optional(),
  dmNote: z.string().max(2000).optional(),
  canonEntryId: link,
  questId: link,
  sessionId: link,
  journalId: link,
  encounterPlanId: link,
  visibility: z.enum(['dm', 'shared']).optional(),
});

export async function listMapsAction(campaignId: string): Promise<MapRow[]> {
  return listMaps(campaignId);
}

export async function createMapAction(
  campaignId: string,
  imageId: string,
  title: string,
  placeId: string | null = null
): Promise<Result<{ id: string }>> {
  try {
    const id = await createMap(campaignId, {
      imageId,
      title: String(title ?? '').slice(0, 120),
      placeId: typeof placeId === 'string' ? placeId : null,
    });
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

/** Say which place a map shows. Staff only. */
export async function setMapPlaceAction(
  mapId: string,
  placeId: string | null
): Promise<Result> {
  try {
    await setMapPlace(mapId, typeof placeId === 'string' ? placeId : null);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not say where the map shows.');
  }
}

export async function renameMapAction(
  mapId: string,
  title: string
): Promise<Result> {
  if (typeof title !== 'string' || title.length > 120) {
    return { ok: false, error: 'A shorter name.' };
  }
  try {
    await renameMap(mapId, title);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not rename the map.');
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

/** Make it real: a rumour mark becomes a place, still signed by its guesser. */
export async function promoteRumourAction(
  campaignId: string,
  pinId: string
): Promise<Result<{ id: string }>> {
  try {
    const id = await promoteRumour(pinId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to make it real.');
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

/**
 * Put a map in front of everybody, or take it down. Staff only.
 *
 * Lighting one shares it and darkens whatever was lit before — enforced in
 * `spotlightMap`, not here, so the campaign page and the screen cannot end up
 * with two different ideas of how many maps can be up at once.
 */
export async function spotlightMapAction(
  mapId: string,
  lit: boolean
): Promise<Result> {
  try {
    await spotlightMap(mapId, lit);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not put that up.');
  }
}

/** Let players put marks on a map, or stop them. Staff only. */
export async function setMarksOpenAction(
  mapId: string,
  open: boolean
): Promise<Result> {
  try {
    await setMarksOpen(mapId, open === true);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change who may mark the map.');
  }
}

/** Fog of war on or off. Staff only. */
export async function setMapFogAction(
  mapId: string,
  fogged: boolean
): Promise<Result> {
  try {
    await setMapFog(mapId, fogged === true);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the fog.');
  }
}

/** Reveal cells of the map, or cover them again. Staff only. */
export async function revealMapCellsAction(
  mapId: string,
  cells: unknown,
  reveal: boolean
): Promise<Result> {
  const parsed = z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(FOG_CELLS - 1)
    )
    .max(FOG_CELLS)
    .safeParse(cells);
  if (!parsed.success) return { ok: false, error: 'Nothing to reveal.' };
  try {
    await revealMapCells(mapId, parsed.data, reveal === true);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not reveal that.');
  }
}

const stopSchema = z.object({
  x: z.number(),
  y: z.number(),
  label: z.string().trim().max(120).optional(),
  pinId: z.string().min(1).max(64).nullable().optional(),
  planned: z.boolean().optional(),
});

/** The party is here: the next stop on the journey. Staff only. */
export async function addJourneyStopAction(
  mapId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = stopSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That did not read.' };
  try {
    return { ok: true, data: { id: await addJourneyStop(mapId, parsed.data) } };
  } catch (err) {
    return fail(err, 'Could not put the party there.');
  }
}

/** The party got to a planned stop. Staff only. */
export async function arriveAtStopAction(stopId: string): Promise<Result> {
  try {
    await arriveAtStop(stopId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not put the party there.');
  }
}

/** Show the party where it is headed, or keep it back. Staff only. */
export async function setStopVisibilityAction(
  stopId: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  try {
    await setStopVisibility(stopId, visibility === 'shared' ? 'shared' : 'dm');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change who sees that.');
  }
}

export async function removeJourneyStopAction(stopId: string): Promise<Result> {
  try {
    await removeJourneyStop(stopId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that stop off.');
  }
}

/** Where on the maps each quest, session and journal page is. */
export async function recordsOnMapsAction(
  campaignId: string
): Promise<RecordOnMap[]> {
  try {
    return await recordsOnMaps(campaignId);
  } catch {
    return [];
  }
}

export async function mapLinksAction(
  campaignId: string
): Promise<{ records: RecordOnMap[]; canPlace: boolean }> {
  try {
    return await mapLinks(campaignId);
  } catch {
    return { records: [], canPlace: false };
  }
}

export async function renameJourneyStopAction(
  stopId: string,
  label: string
): Promise<Result> {
  if (typeof label !== 'string' || label.length > 120) {
    return { ok: false, error: 'A shorter name.' };
  }
  try {
    await renameJourneyStop(stopId, label);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not name that stop.');
  }
}
