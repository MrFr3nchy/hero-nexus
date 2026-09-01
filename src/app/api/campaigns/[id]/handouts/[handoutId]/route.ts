import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { canViewHandout } from '@/server/session';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; handoutId: string }> }
) {
  const { id: campaignId, handoutId } = await params;

  const access = await canViewHandout(handoutId);
  if (
    !access.ok ||
    access.row.campaignId !== campaignId ||
    !access.row.filePath
  ) {
    return new Response('Not found', { status: 404 });
  }

  const abs = join(process.cwd(), 'data', 'uploads', access.row.filePath);
  try {
    const info = await stat(abs);
    return new Response(
      Readable.toWeb(createReadStream(abs)) as ReadableStream,
      {
        headers: {
          'Content-Type': access.row.mime ?? 'application/octet-stream',
          'Content-Length': String(info.size),
          'Cache-Control': 'private, max-age=300',
        },
      }
    );
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
