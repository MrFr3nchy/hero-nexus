'use server';

import { z } from 'zod';

import {
  FACINGS,
  ITEM_STATES,
  MATERIALS,
  MAX_SIDE,
  MIN_SIDE,
} from '@/@shared/battlemap/types';
import {
  createBattleMap,
  damageThing,
  dealEncounterIn,
  deleteBattleMap,
  getBoardTerrain,
  listBattleMaps,
  moveToken,
  pickLock,
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
  operateThing,
} from '@/server/battlemap';

import { RuleRefusal } from '@/server/table-rules';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | Refusal;

/**
 * `overridable` is set only when the rules refused and the caller is staff:
 * the control shows "Do it anyway", and pressing it re-sends the same call
 * with `{ ruling: true }`. Decided on the server (`RuleRefusal`), so a player
 * never sees the button and the server ignores `ruling` from one anyway.
 */
type Refusal = { ok: false; error: string; overridable?: boolean };

function fail(err: unknown, fallback: string): Refusal {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That board no longer exists.',
    NO_SUCH_IMAGE: 'That picture is not in this campaign.',
    FORBIDDEN: 'Only the DM and co-DMs build the board.',
    NOT_YOUR_TOKEN: 'That is not yours to move.',
    CANNOT_STAND_THERE: 'Nothing can stand there.',
    NOT_IN_THIS_FIGHT: 'That combatant is not in the fight this board is for.',
    ALREADY_ON_THE_BOARD: 'They are already on the board.',
    NO_FIGHT: 'Put the board on the table during a fight, then deal them in.',
    NOT_A_THING: 'That is somebody, not something.',
    NOTHING_TO_DO: 'There is nothing to open or close there.',
    LOCKED: 'It is locked.',
    BROKEN: 'It is broken.',
    NOT_LOCKED: 'It is not locked.',
    OUT_OF_REACH: 'You are not close enough. Move beside it first.',
    INDESTRUCTIBLE: 'That cannot be broken.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return {
    ok: false,
    error: messages[code] ?? fallback,
    ...(err instanceof RuleRefusal && err.overridable
      ? { overridable: true }
      : {}),
  };
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

/** A board's whole terrain, for placing a plan on it. Staff only. */
export async function getBoardTerrainAction(
  mapId: string
): Promise<Awaited<ReturnType<typeof getBoardTerrain>> | null> {
  try {
    return await getBoardTerrain(mapId);
  } catch {
    return null;
  }
}

export async function listBattleMapsAction(campaignId: string) {
  try {
    return await listBattleMaps(campaignId);
  } catch {
    return [];
  }
}

export async function createBattleMapAction(
  campaignId: string,
  input: { name?: string; w: number; h: number; material?: number }
): Promise<Result<{ id: string }>> {
  const parsed = z
    .object({
      name: z.string().trim().max(120).optional(),
      w: z.number().int().min(MIN_SIDE).max(MAX_SIDE),
      h: z.number().int().min(MIN_SIDE).max(MAX_SIDE),
      /** Index into `MATERIALS`: what every tile starts as. */
      material: z
        .number()
        .int()
        .min(0)
        .max(MATERIALS.length - 1)
        .optional(),
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
      imageId: z.string().min(1).max(64).nullable().optional(),
      state: z.enum(ITEM_STATES).nullable().optional(),
      lockDc: z.number().int().min(1).max(40).nullable().optional(),
      hpMax: z.number().int().min(1).max(9999).nullable().optional(),
      facing: z.enum(FACINGS).optional(),
      ruling: z.boolean().optional(),
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
  to: unknown,
  opts: { ruling?: boolean } = {}
): Promise<Result> {
  const parsed = tile.safeParse(to);
  if (!parsed.success) return { ok: false, error: 'Not a tile.' };
  try {
    await moveToken(tokenId, parsed.data, { ruling: opts.ruling === true });
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
      imageId: z.string().min(1).max(64).nullable().optional(),
      state: z.enum(ITEM_STATES).nullable().optional(),
      lockDc: z.number().int().min(1).max(40).nullable().optional(),
      hpMax: z.number().int().min(1).max(9999).nullable().optional(),
      facing: z.enum(FACINGS).optional(),
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

/* --- doing something to a thing ------------------------------------------ */

export async function operateThingAction(
  tokenId: string,
  verb: 'open' | 'close'
): Promise<Result> {
  try {
    await operateThing(tokenId, verb === 'close' ? 'close' : 'open');
    return { ok: true };
  } catch (err) {
    return fail(err, 'That did not budge.');
  }
}

export async function pickLockAction(
  tokenId: string,
  mode: unknown
): Promise<Result<{ total: number; opened: boolean }>> {
  const parsed = z
    .enum(['straight', 'advantage', 'disadvantage'])
    .safeParse(mode ?? 'straight');
  try {
    const data = await pickLock(
      tokenId,
      parsed.success ? parsed.data : 'straight'
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'The lock did not budge.');
  }
}

export async function damageThingAction(
  tokenId: string,
  delta: number
): Promise<Result> {
  const parsed = z.number().int().min(-9999).max(9999).safeParse(delta);
  if (!parsed.success) return { ok: false, error: 'Invalid amount.' };
  try {
    await damageThing(tokenId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'That did not land.');
  }
}
