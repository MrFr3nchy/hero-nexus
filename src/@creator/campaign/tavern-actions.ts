'use server';

import { z } from 'zod';

import {
  MAX_BLURB,
  MAX_NAME,
  TAVERN_KINDS,
  type HouseGameRow,
} from '@/@creator/campaign/lib/tavern';
import {
  createHouseGame,
  deleteHouseGame,
  listHouseGames,
  updateHouseGame,
} from '@/server/tavern/house-games';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'You are not signed in.',
  SESSION_STALE: 'Your session is out of date. Sign in again.',
  FORBIDDEN: 'That is the DM’s to do.',
  NOT_FOUND: 'That tavern game is not at this campaign.',
  NO_NAME: 'A house game needs a name.',
  BAD_KIND: 'Pick liar’s dice or Crowns.',
};

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  if (!MESSAGES[code]) console.error('[tavern-action]', fallback, err);
  return { ok: false, error: MESSAGES[code] ?? fallback };
}

/* --- house games ---------------------------------------------------------- */

const houseGame = z.object({
  kind: z.enum(TAVERN_KINDS),
  name: z.string().trim().min(1).max(MAX_NAME),
  blurb: z.string().max(MAX_BLURB).optional(),
  // Normalised field by field on the server; anything else is dropped there.
  rules: z.record(z.string(), z.unknown()).optional(),
});

export async function listHouseGamesAction(
  campaignId: string
): Promise<Result<HouseGameRow[]>> {
  try {
    return { ok: true, data: await listHouseGames(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the house games.');
  }
}

export async function createHouseGameAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = houseGame.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.NO_NAME };
  try {
    return {
      ok: true,
      data: { id: await createHouseGame(campaignId, parsed.data) },
    };
  } catch (err) {
    return fail(err, 'Could not write that house game.');
  }
}

export async function updateHouseGameAction(
  id: string,
  input: unknown
): Promise<Result> {
  const parsed = houseGame.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.NO_NAME };
  try {
    await updateHouseGame(id, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save that house game.');
  }
}

export async function deleteHouseGameAction(id: string): Promise<Result> {
  try {
    await deleteHouseGame(id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that house game down.');
  }
}
