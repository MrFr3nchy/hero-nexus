import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { db } from '@/db';
import { battleMaps, campaignAudio, campaigns } from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { UPLOADS_DIR } from './uploads';

/**
 * Ambient sound (improvements 12).
 *
 * Tracks are uploaded the way images are and live beside them on disk; what
 * is playing is one JSON value on the campaign row, written here and read
 * on `LiveState.ambience`, so a browser joining late seeks to where the
 * room already is. Players hear it only if they opt in on their device —
 * the server says what is playing, never that anyone must listen.
 */

export const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

/** Twenty megabytes: a long loop at a modest bitrate, not an album. */
export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export interface CampaignAudioRow {
  id: string;
  campaignId: string;
  title: string;
  mime: string;
  bytes: number;
  durationSeconds: number | null;
  createdAt: string;
}

export interface Ambience {
  audioId: string;
  /** ISO instant it started, so a late joiner seeks to `now − startedAt`. */
  startedAt: string;
  loop: boolean;
  /** 0..1, the DM's level. A player's own volume sits on top of it. */
  volume: number;
  /** Set by a board being lit; cleared with the fight unless kept. */
  fromBoard?: boolean;
}

export function audioUrl(campaignId: string, audioId: string): string {
  return `/api/campaigns/${campaignId}/audio/${audioId}`;
}

function toRow(r: typeof campaignAudio.$inferSelect): CampaignAudioRow {
  return {
    id: r.id,
    campaignId: r.campaignId,
    title: r.title,
    mime: r.mime,
    bytes: r.bytes,
    durationSeconds: r.durationSeconds,
    createdAt: r.createdAt,
  };
}

export function normalizeAmbience(raw: unknown): Ambience | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.audioId !== 'string' || !o.audioId) return null;
  return {
    audioId: o.audioId,
    startedAt:
      typeof o.startedAt === 'string' ? o.startedAt : new Date().toISOString(),
    loop: o.loop !== false,
    volume:
      typeof o.volume === 'number' && Number.isFinite(o.volume)
        ? Math.max(0, Math.min(1, o.volume))
        : 0.6,
    ...(o.fromBoard === true ? { fromBoard: true } : {}),
  };
}

/** Every track at the table. Any member may read the list; staff upload. */
export async function listCampaignAudio(
  campaignId: string
): Promise<CampaignAudioRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const rows = await db
    .select()
    .from(campaignAudio)
    .where(eq(campaignAudio.campaignId, campaignId))
    .orderBy(desc(campaignAudio.createdAt));
  return rows.map(toRow);
}

/** The row behind a file, for the route. No role check: the route does it. */
export async function getCampaignAudio(audioId: string) {
  return db.query.campaignAudio.findFirst({
    where: eq(campaignAudio.id, audioId),
  });
}

export async function saveCampaignAudio(
  campaignId: string,
  file: File,
  title: string,
  durationSeconds: number | null
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const ext = AUDIO_EXTENSIONS[file.type];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');
  if (file.size > MAX_AUDIO_BYTES) throw new Error('TOO_LARGE');

  const dir = join(UPLOADS_DIR, campaignId, 'audio');
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));

  const [row] = await db
    .insert(campaignAudio)
    .values({
      campaignId,
      title: title.trim().slice(0, 120) || file.name.slice(0, 120),
      filePath: `${campaignId}/audio/${name}`,
      mime: file.type,
      bytes: file.size,
      durationSeconds:
        durationSeconds !== null && Number.isFinite(durationSeconds)
          ? Math.max(0, Math.round(durationSeconds))
          : null,
      uploadedBy: userId,
    })
    .returning({ id: campaignAudio.id });
  return row.id;
}

/** Remove a track and its file. Silence first if it was the one playing. */
export async function deleteCampaignAudio(audioId: string): Promise<void> {
  const row = await getCampaignAudio(audioId);
  if (!row) throw new Error('NOT_FOUND');
  await requireCampaignRole(row.campaignId, ['gm', 'co-gm']);
  const playing = await readAmbience(row.campaignId);
  if (playing?.audioId === audioId) await setAmbience(row.campaignId, null);
  await db.delete(campaignAudio).where(eq(campaignAudio.id, audioId));
  await unlink(join(UPLOADS_DIR, row.filePath)).catch(() => {});
}

/** What is playing. No role check: `LiveState` has already sat down. */
export async function readAmbience(
  campaignId: string
): Promise<Ambience | null> {
  const row = await db.query.campaigns.findFirst({
    columns: { ambience: true },
    where: eq(campaigns.id, campaignId),
  });
  return normalizeAmbience(row?.ambience);
}

/**
 * Play a track for the table, or stop. Staff only. Publishes `ambience` so
 * the speaker glyph appears for everybody, whether or not they listen.
 */
export async function setAmbience(
  campaignId: string,
  input: { audioId: string; loop?: boolean; volume?: number } | null,
  opts: { fromBoard?: boolean } = {}
): Promise<Ambience | null> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  let next: Ambience | null = null;
  let title = '';
  if (input) {
    const track = await getCampaignAudio(input.audioId);
    if (!track || track.campaignId !== campaignId) throw new Error('NOT_FOUND');
    title = track.title;
    next = {
      audioId: input.audioId,
      startedAt: new Date().toISOString(),
      loop: input.loop !== false,
      volume:
        typeof input.volume === 'number' && Number.isFinite(input.volume)
          ? Math.max(0, Math.min(1, input.volume))
          : 0.6,
      ...(opts.fromBoard ? { fromBoard: true } : {}),
    };
  }
  await db
    .update(campaigns)
    .set({ ambience: next, updatedAt: new Date().toISOString() })
    .where(eq(campaigns.id, campaignId));
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'ambience',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    state: next ? 'playing' : 'stopped',
    title,
  });
  return next;
}

/** Name the track a board starts when lit, or none. Staff only. */
export async function setBoardAudio(
  mapId: string,
  audioId: string | null
): Promise<void> {
  const map = await db.query.battleMaps.findFirst({
    columns: { campaignId: true },
    where: eq(battleMaps.id, mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  await requireCampaignRole(map.campaignId, ['gm', 'co-gm']);
  if (audioId) {
    const track = await getCampaignAudio(audioId);
    if (!track || track.campaignId !== map.campaignId) {
      throw new Error('NOT_FOUND');
    }
  }
  await db.update(battleMaps).set({ audioId }).where(eq(battleMaps.id, mapId));
  bumpVersion(map.campaignId);
}
