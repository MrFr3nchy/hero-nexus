import { NextResponse } from 'next/server';

import {
  AUDIO_EXTENSIONS,
  audioUrl,
  MAX_AUDIO_BYTES,
  saveCampaignAudio,
} from '@/server/audio';

export const runtime = 'nodejs';

/**
 * Upload one track to a campaign (improvements 12). Staff only —
 * `saveCampaignAudio` re-checks the role; this route validates the payload
 * and maps failures to status codes, the same shape as the image route.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  const form = await request.formData();
  const file = form.get('file');
  const title = String(form.get('title') ?? '');
  const duration = Number(form.get('duration') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file.' }, { status: 400 });
  }
  if (!AUDIO_EXTENSIONS[file.type]) {
    return NextResponse.json(
      { error: 'Only MP3, OGG or WAV.' },
      { status: 415 }
    );
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: 'A track must be 20 MB or smaller.' },
      { status: 413 }
    );
  }

  try {
    const id = await saveCampaignAudio(
      campaignId,
      file,
      title,
      Number.isFinite(duration) ? duration : null
    );
    return NextResponse.json(
      { ok: true, id, url: audioUrl(campaignId, id) },
      { status: 201 }
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'NOT_AUTHENTICATED' || code === 'SESSION_STALE') {
      return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    }
    if (code === 'FORBIDDEN' || code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    }
    console.error('[api] Failed to store a campaign track.', err);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}
