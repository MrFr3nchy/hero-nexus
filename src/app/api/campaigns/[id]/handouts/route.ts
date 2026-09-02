import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

import { requireCampaignRole } from '@/server/campaigns';
import { createImageHandout } from '@/server/session';
import { UPLOADS_DIR } from '@/server/uploads';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  let userId: string;
  try {
    ({ userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']));
  } catch {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get('file');
  const title = String(form.get('title') ?? '');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file.' }, { status: 400 });
  }
  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: 'Only PNG, JPEG, WebP or GIF images.' },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Image must be 10 MB or smaller.' },
      { status: 413 }
    );
  }

  const dir = join(UPLOADS_DIR, campaignId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));

  await createImageHandout(
    campaignId,
    userId,
    `${campaignId}/${name}`,
    file.type,
    title
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
