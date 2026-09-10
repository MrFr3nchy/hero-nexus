import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { NextResponse } from 'next/server';

import {
  MAX_PORTRAIT_BYTES,
  PORTRAIT_EXTENSIONS,
  canViewCharacter,
  clearPortrait,
  isAllowedRemoteUrl,
  resolvedPortraitRecord,
  savePortraitLink,
  savePortraitUpload,
} from '@/server/character-portraits';
import { UPLOADS_DIR } from '@/server/uploads';

export const runtime = 'nodejs';

/**
 * Serve a character's portrait to the owner, or to anyone at their table.
 *
 * A refusal is a 404 rather than a 403, matching the campaign image route: a
 * 403 confirms the character exists to somebody who has no business knowing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!(await canViewCharacter(id).catch(() => false))) {
    return new Response('Not found', { status: 404 });
  }

  // Resolved, so a campaign instance serves its blueprint's face without
  // owning a copy of the bytes.
  const row = await resolvedPortraitRecord(id);
  // A linked portrait has no bytes here — the reader's browser fetches it from
  // its own host, and this route never becomes a proxy for it.
  if (!row || !row.filePath) {
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

/**
 * Set the portrait: either an uploaded file, or a link to one.
 *
 * Both arrive as form data. `savePortrait*` re-checks ownership, so this route
 * validates the payload and maps failures to status codes rather than
 * repeating the permission logic.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const form = await request.formData();
  const alt = String(form.get('alt') ?? '');
  const file = form.get('file');
  const url = String(form.get('url') ?? '').trim();

  try {
    if (file instanceof File && file.size > 0) {
      if (!PORTRAIT_EXTENSIONS[file.type]) {
        return NextResponse.json(
          { error: 'Only PNG, JPEG, WebP or GIF images.' },
          { status: 415 }
        );
      }
      if (file.size > MAX_PORTRAIT_BYTES) {
        return NextResponse.json(
          { error: 'Portrait must be 4 MB or smaller.' },
          { status: 413 }
        );
      }
      const portrait = await savePortraitUpload(id, file, alt);
      return NextResponse.json({ ok: true, portrait }, { status: 201 });
    }

    if (url) {
      if (!isAllowedRemoteUrl(url)) {
        return NextResponse.json(
          { error: 'That needs to be an http or https link to an image.' },
          { status: 400 }
        );
      }
      const portrait = await savePortraitLink(id, url, alt);
      return NextResponse.json({ ok: true, portrait }, { status: 201 });
    }

    return NextResponse.json(
      { error: 'Choose a file or paste a link.' },
      { status: 400 }
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    }
    console.error('[api] Failed to set a character portrait.', err);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await clearPortrait(id);
    return new Response(null, { status: 204 });
  } catch {
    return new Response('Not allowed', { status: 403 });
  }
}
