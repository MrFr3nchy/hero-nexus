import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { deleteCampaignAudio, getCampaignAudio } from '@/server/audio';
import { requireCampaignRole } from '@/server/campaigns';
import { UPLOADS_DIR } from '@/server/uploads';

export const runtime = 'nodejs';

/**
 * Serve one track to anyone at that table, and nobody else (improvements 12).
 * Honours a `Range` header, because a browser seeking into a loop asks for
 * one — a late joiner lands mid-track, and a 200 with the whole file would
 * make it start from the top.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; audioId: string }> }
) {
  const { id: campaignId, audioId } = await params;

  const row = await getCampaignAudio(audioId);
  if (!row || row.campaignId !== campaignId) {
    return new Response('Not found', { status: 404 });
  }
  try {
    await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  } catch {
    return new Response('Not allowed', { status: 403 });
  }

  const abs = join(UPLOADS_DIR, row.filePath);
  let size: number;
  try {
    size = (await stat(abs)).size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const range = request.headers.get('range');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    return new Response(
      Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream,
      {
        status: 206,
        headers: {
          'Content-Type': row.mime,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  }

  return new Response(Readable.toWeb(createReadStream(abs)) as ReadableStream, {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; audioId: string }> }
) {
  const { audioId } = await params;
  try {
    await deleteCampaignAudio(audioId);
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Not allowed', { status: 403 });
  }
}
