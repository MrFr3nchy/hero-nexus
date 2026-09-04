'use server';

import { z } from 'zod';

import {
  applyPlayPatch,
  getPlayState,
  listPartyPlayState,
  setPlayConditions,
  type PlayState,
} from '@/server/play';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That character no longer exists.',
    FORBIDDEN: 'That sheet is not yours to change.',
  };
  // Unmapped errors reach the client as a generic sentence, which makes them
  // invisible in a bug report. Keep the real one in the server log.
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const patchSchema = z.object({
  hpCurrentDelta: z.number().int().min(-999).max(999).optional(),
  hpTemp: z.number().int().min(0).max(999).optional(),
  hitDiceSpent: z.number().int().min(0).max(20).optional(),
  deathSaveSuccesses: z.number().int().min(0).max(3).optional(),
  deathSaveFailures: z.number().int().min(0).max(3).optional(),
  slot: z
    .object({
      level: z.number().int().min(1).max(9),
      expended: z.number().int().min(0).max(9),
    })
    .optional(),
  longRest: z.boolean().optional(),
});

export async function getPlayStateAction(
  characterId: string,
  campaignId: string | null
): Promise<PlayState | null> {
  try {
    return await getPlayState(characterId, campaignId);
  } catch {
    return null;
  }
}

export async function listPartyPlayStateAction(
  campaignId: string
): Promise<PlayState[]> {
  return listPartyPlayState(campaignId);
}

export async function applyPlayPatchAction(
  characterId: string,
  campaignId: string | null,
  input: unknown
): Promise<Result<PlayState>> {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const data = await applyPlayPatch(characterId, campaignId, parsed.data);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Failed to update the sheet.');
  }
}

export async function setPlayConditionsAction(
  characterId: string,
  campaignId: string,
  keys: string[]
): Promise<Result> {
  try {
    await setPlayConditions(characterId, campaignId, keys);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to set conditions.');
  }
}
