import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { campaignImages } from '@/db/schema';
import { requireCampaignRole } from '@/server/campaigns';
import { UPLOADS_DIR } from '@/server/uploads';

/**
 * Images belonging to a campaign — NPC portraits, item sketches, a page torn
 * from a notebook. Shared plumbing: canon entries and anything else that wants
 * a picture store an image id, and the thing pointing at the image decides who
 * may see it. Uploading is staff-only; reading is anyone at the table.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Formats a browser will render inline, and the extension each is saved as. */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface CampaignImageRow {
  id: string;
  alt: string;
  mime: string;
  bytes: number;
  createdAt: string;
  /** Where the browser fetches it. Always goes through the role check. */
  url: string;
}

export function imageUrl(campaignId: string, imageId: string): string {
  return `/api/campaigns/${campaignId}/images/${imageId}`;
}

function hydrate(row: typeof campaignImages.$inferSelect): CampaignImageRow {
  return {
    id: row.id,
    alt: row.alt,
    mime: row.mime,
    bytes: row.bytes,
    createdAt: row.createdAt,
    url: imageUrl(row.campaignId, row.id),
  };
}

/** Every image at this table, newest last. Staff pick from this when editing. */
export async function listCampaignImages(
  campaignId: string
): Promise<CampaignImageRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const rows = await db
    .select()
    .from(campaignImages)
    .where(eq(campaignImages.campaignId, campaignId))
    .orderBy(asc(campaignImages.createdAt));
  return rows.map(hydrate);
}

export async function getCampaignImage(
  imageId: string
): Promise<typeof campaignImages.$inferSelect | null> {
  const row = await db.query.campaignImages.findFirst({
    where: eq(campaignImages.id, imageId),
  });
  return row ?? null;
}

/**
 * Store an uploaded image. The caller has already checked the MIME type and
 * size; this writes the bytes under the campaign's directory and records the
 * row, returning the id the referencing entry should keep.
 */
export async function saveCampaignImage(
  campaignId: string,
  file: File,
  alt: string
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const ext = IMAGE_EXTENSIONS[file.type];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('TOO_LARGE');

  const dir = join(UPLOADS_DIR, campaignId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));

  const [row] = await db
    .insert(campaignImages)
    .values({
      campaignId,
      filePath: `${campaignId}/${name}`,
      mime: file.type,
      bytes: file.size,
      alt: alt.trim().slice(0, 200),
      uploadedBy: userId,
    })
    .returning({ id: campaignImages.id });

  return row.id;
}

/**
 * Remove an image and its file. Entries referencing it keep a dangling id and
 * render without a picture, which is the failure everyone can live with — the
 * alternative is a delete that silently leaves orphaned bytes on disk.
 */
export async function deleteCampaignImage(imageId: string): Promise<void> {
  const row = await getCampaignImage(imageId);
  if (!row) throw new Error('NOT_FOUND');
  await requireCampaignRole(row.campaignId, ['gm', 'co-gm']);

  await db.delete(campaignImages).where(eq(campaignImages.id, imageId));
  await unlink(join(UPLOADS_DIR, row.filePath)).catch(() => {});
}
