'use server';

import { z } from 'zod';

import { MAX_SIDE, MIN_SIDE } from '@/@shared/battlemap/types';
import {
  createBattleMap,
  dealEncounterIn,
  deleteBattleMap,
  listBattleMaps,
  moveToken,
  placeToken,
  removeToken,
  renameBattleMap,
  resetFog,
  revealFromParty,
  revealTiles,
  saveTerrain,
  setBattleMapActive,
  setBattleMapVisibility,
  updateToken,
} from '@/server/battlemap';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That board no longer exists.',
    FORBIDDEN: 'Only the DM and co-DMs build the board.',
    NOT_YOUR_TOKEN: 'That is not yours to move.',
    CANNOT_STAND_THERE: 'Nothing can stand there.',
    NOT_IN_THIS_FIGHT: 'That combatant is not in the fight this board is for.',
    ALREADY_ON_THE_BOARD: 'They are already on the board.',
    NO_FIGHT: 'Put the board on the table during a fight, then deal them in.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const tile = z.object({
  x: z
    .number()
    .int()
    .min(0)
    .max(MAX_SIDE - 1),
  y: z
    .number()
    .int()
    .min(0)
    .max(MAX_SIDE - 1),
});

export async function listBattleMapsAction(campaignId: string) {
  try {
    return await listBattleMaps(campaignId);
  } catch {
    return [];
  }
}

export async function createBattleMapAction(
  campaignId: string,
  input: { name?: string; w: number; h: number }
): Promise<Result<{ id: string }>> {
  const parsed = z
    .object({
      name: z.string().trim().max(120).optional(),
      w: z.number().int().min(MIN_SIDE).max(MAX_SIDE),
      h: z.number().int().min(MIN_SIDE).max(MAX_SIDE),
    })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid board.',
    };
  }
  try {
    const id = await createBattleMap(campaignId, parsed.data);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Could not lay out a board.');
  }
}

/**
 * The whole document, every time. Validated for shape by `normalizeTerrain`
 * on the server, so a hand-edited row cannot poison the board — this only
 * gates that something document-like arrived at all.
 */
export async function saveTerrainAction(
  mapId: string,
  terrain: unknown
): Promise<Result> {
  if (!terrain || typeof terrain !== 'object') {
    return { ok: false, error: 'That is not a board.' };
  }
  try {
    await saveTerrain(mapId, terrain);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save the board.');
  }
}

export async function renameBattleMapAction(
  mapId: string,
  name: string
): Promise<Result> {
  try {
    await renameBattleMap(mapId, name);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not rename it.');
  }
}

export async function setBattleMapVisibilityAction(
  mapId: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  try {
    await setBattleMapVisibility(mapId, visibility);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change who sees it.');
  }
}

export async function setBattleMapActiveAction(
  mapId: string,
  active: boolean
): Promise<Result> {
  try {
    await setBattleMapActive(mapId, active);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not put it on the table.');
  }
}

export async function deleteBattleMapAction(mapId: string): Promise<Result> {
  try {
    await deleteBattleMap(mapId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not clear the board.');
  }
}

export async function revealTilesAction(
  mapId: string,
  indices: number[]
): Promise<Result> {
  const parsed = z
    .array(z.number().int().min(0))
    .max(MAX_SIDE * MAX_SIDE)
    .safeParse(indices);
  if (!parsed.success) return { ok: false, error: 'Nothing to reveal.' };
  try {
    await revealTiles(mapId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not reveal that.');
  }
}

export async function resetFogAction(mapId: string): Promise<Result> {
  try {
    await resetFog(mapId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not draw the fog back.');
  }
}

export async function revealFromPartyAction(
  mapId: string,
  radiusFeet = 40
): Promise<Result<{ revealed: number }>> {
  try {
    const revealed = await revealFromParty(
      mapId,
      Math.max(5, Math.min(120, Math.trunc(radiusFeet)))
    );
    return { ok: true, data: { revealed } };
  } catch (err) {
    return fail(err, 'Could not look around.');
  }
}

export async function placeTokenAction(
  mapId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = tile
    .extend({
      entryId: z.string().min(1).nullable().optional(),
      label: z.string().trim().max(60).optional(),
      footprint: z.number().int().min(1).max(3).optional(),
      altitude: z.number().int().min(-100).max(500).optional(),
      tint: z.string().max(20).optional(),
      visibility: z.enum(['dm', 'shared']).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid token.',
    };
  }
  try {
    const id = await placeToken(mapId, parsed.data);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Could not put that down.');
  }
}

export async function dealEncounterInAction(
  mapId: string
): Promise<Result<{ dealt: number }>> {
  try {
    const dealt = await dealEncounterIn(mapId);
    return { ok: true, data: { dealt } };
  } catch (err) {
    return fail(err, 'Could not deal them in.');
  }
}

export async function moveTokenAction(
  tokenId: string,
  to: unknown
): Promise<Result> {
  const parsed = tile.safeParse(to);
  if (!parsed.success) return { ok: false, error: 'Not a tile.' };
  try {
    await moveToken(tokenId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not move that.');
  }
}

export async function updateTokenAction(
  tokenId: string,
  patch: unknown
): Promise<Result> {
  const parsed = z
    .object({
      label: z.string().trim().max(60).optional(),
      altitude: z.number().int().min(-100).max(500).optional(),
      tint: z.string().max(20).optional(),
      visibility: z.enum(['dm', 'shared']).optional(),
    })
    .safeParse(patch);
  if (!parsed.success) return { ok: false, error: 'Invalid change.' };
  try {
    await updateToken(tokenId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change that.');
  }
}

export async function removeTokenAction(tokenId: string): Promise<Result> {
  try {
    await removeToken(tokenId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that off.');
  }
}
