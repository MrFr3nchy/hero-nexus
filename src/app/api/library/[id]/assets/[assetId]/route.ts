import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { getPublicationAsset } from '@/server/library-assets';
import { UPLOADS_DIR } from '@/server/uploads';

export const runtime = 'nodejs';

/**
 * Serve one file off a listing.
 *
 * No role check, unlike the campaign image route, and that is the whole reason
 * these bytes are a separate copy: a published picture is public by
 * construction. The check that matters happened when the author chose to publish
 * it, and relaxing the campaign route instead would have made every table's
 * uploads readable by anyone holding an id.
 *
 * The asset must belong to the listing named in the path — an id from one
 * listing must not resolve under another's URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const { id: publicationId, assetId } = await params;

  const row = await getPublicationAsset(assetId);
  if (!row || row.publicationId !== publicationId) {
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
          // Public, so it may be cached by anything between here and the reader.
          'Cache-Control': 'public, max-age=3600',
        },
      }
    );
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
