import { NextResponse } from 'next/server';

import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  imageUrl,
  saveCampaignImage,
} from '@/server/campaign-images';

export const runtime = 'nodejs';

/**
 * Upload one image to a campaign. Staff only — `saveCampaignImage` re-checks
 * the role, so this route validates the payload and maps failures to status
 * codes rather than repeating the permission logic.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  const form = await request.formData();
  const file = form.get('file');
  const alt = String(form.get('alt') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file.' }, { status: 400 });
  }
  if (!IMAGE_EXTENSIONS[file.type]) {
    return NextResponse.json(
      { error: 'Only PNG, JPEG, WebP or GIF images.' },
      { status: 415 }
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Image must be 8 MB or smaller.' },
      { status: 413 }
    );
  }

  try {
    const id = await saveCampaignImage(campaignId, file, alt);
    return NextResponse.json(
      { ok: true, id, url: imageUrl(campaignId, id) },
      { status: 201 }
    );
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'FORBIDDEN' || code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    }
    console.error('[api] Failed to store a campaign image.', err);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }
}
