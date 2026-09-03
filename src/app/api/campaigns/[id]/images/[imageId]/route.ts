import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  deleteCampaignImage,
  getCampaignImage,
} from '@/server/campaign-images';
import { requireCampaignRole } from '@/server/campaigns';
import { UPLOADS_DIR } from '@/server/uploads';

export const runtime = 'nodejs';

/**
 * Serve one image to anyone at that table. What an image *depicts* is guarded
 * by the entry pointing at it — an unrevealed canon entry is never rendered,
 * so its portrait's URL never reaches the player who cannot see it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { id: campaignId, imageId } = await params;

  const row = await getCampaignImage(imageId);
  if (!row || row.campaignId !== campaignId) {
    return new Response('Not found', { status: 404 });
  }
  try {
    await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const abs = join(UPLOADS_DIR, row.filePath);
  try {
    const info = await stat(abs);
    return new Response(
      Readable.toWeb(createReadStream(abs)) as ReadableStream,
      {
        headers: {
          'Content-Type': row.mime,
          'Content-Length': String(info.size),
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { imageId } = await params;
  try {
    await deleteCampaignImage(imageId);
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Not allowed', { status: 403 });
  }
}
