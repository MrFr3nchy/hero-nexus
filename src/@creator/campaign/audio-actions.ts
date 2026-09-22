'use server';

import { z } from 'zod';

import {
  deleteCampaignAudio,
  listCampaignAudio,
  playSoundEffect,
  setAmbience,
  setBoardAudio,
  type Ambience,
  type CampaignAudioRow,
} from '@/server/audio';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That track is not at this table.',
    FORBIDDEN: 'Only the DM plays music for the table.',
  };
  if (!messages[code]) console.error('[audio-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/** The table's tracks. Any member may read; staff upload through the route. */
export async function listCampaignAudioAction(
  campaignId: string
): Promise<CampaignAudioRow[]> {
  try {
    return await listCampaignAudio(campaignId);
  } catch {
    return [];
  }
}

const playSchema = z
  .object({
    audioId: z.string().min(1),
    loop: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
  })
  .nullable();

/** Play a track for the table, or `null` for quiet. */
export async function setAmbienceAction(
  campaignId: string,
  input: unknown
): Promise<Result<Ambience | null>> {
  const parsed = playSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Pick a track.' };
  try {
    const data = await setAmbience(campaignId, parsed.data);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not change the music.');
  }
}

/** Press a sound effect for the table. */
export async function playSoundEffectAction(
  campaignId: string,
  audioId: string
): Promise<Result> {
  try {
    await playSoundEffect(campaignId, audioId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not play that.');
  }
}

export async function deleteCampaignAudioAction(
  audioId: string
): Promise<Result> {
  try {
    await deleteCampaignAudio(audioId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not remove the track.');
  }
}

export async function setBoardAudioAction(
  mapId: string,
  audioId: string | null
): Promise<Result> {
  try {
    await setBoardAudio(mapId, audioId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not set the board’s track.');
  }
}
