import 'server-only';

import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { publicationAssets, publications } from '@/db/schema';
import {
  getCampaignImage,
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  saveCampaignImage,
} from './campaign-images';
import { requireCampaignRole } from './campaigns';
import { requireUserId } from './session-user';
import { UPLOADS_DIR } from './uploads';

/**
 * The files a listing carries.
 *
 * Publishing a picture **copies the bytes**. A listing that pointed at a
 * `campaign_images` row would be unreadable to everybody who is not at that
 * table — those files are served behind `requireCampaignRole` — and the only way
 * to make it readable would be a bypass on the route that serves campaign
 * files, which is the last place in this app to put one. Copying also means
 * archiving the campaign a picture came from cannot take a published listing's
 * picture with it.
 *
 * Adopting copies again, into a campaign the adopter runs. There is
 * deliberately no user-level image store: every image in this app belongs to a
 * campaign, and a second home for them would mean two upload paths, two
 * permission checks and two garbage-collection stories for one feature.
 */

export interface PublicationAssetRow {
  id: string;
  alt: string;
  mime: string;
  bytes: number;
  itemLocalKey: string;
  sortOrder: number;
  /** Where a browser fetches it. Public, like the listing it belongs to. */
  url: string;
}

export function assetUrl(publicationId: string, assetId: string): string {
  return `/api/library/${publicationId}/assets/${assetId}`;
}

function libraryDir(publicationId: string): string {
  return join(UPLOADS_DIR, 'library', publicationId);
}

function hydrate(
  row: typeof publicationAssets.$inferSelect
): PublicationAssetRow {
  return {
    id: row.id,
    alt: row.alt,
    mime: row.mime,
    bytes: row.bytes,
    itemLocalKey: row.itemLocalKey,
    sortOrder: row.sortOrder,
    url: assetUrl(row.publicationId, row.id),
  };
}

/** Every file on a listing, in the order it should be shown. */
export async function listPublicationAssets(
  publicationId: string
): Promise<PublicationAssetRow[]> {
  const rows = await db
    .select()
    .from(publicationAssets)
    .where(eq(publicationAssets.publicationId, publicationId))
    .orderBy(
      asc(publicationAssets.sortOrder),
      asc(publicationAssets.createdAt)
    );
  return rows.map(hydrate);
}

export async function getPublicationAsset(
  assetId: string
): Promise<typeof publicationAssets.$inferSelect | null> {
  const row = await db.query.publicationAssets.findFirst({
    where: eq(publicationAssets.id, assetId),
  });
  return row ?? null;
}

/** Ownership check for every write below. Reading a listing needs nothing. */
async function requireOwnedPublication(publicationId: string, userId: string) {
  const row = await db.query.publications.findFirst({
    where: and(
      eq(publications.id, publicationId),
      eq(publications.ownerId, userId)
    ),
  });
  if (!row) throw new Error('NOT_YOUR_PUBLICATION');
  return row;
}

/** Record a file already written under the listing's directory. */
async function recordAsset(
  publicationId: string,
  fileName: string,
  meta: { mime: string; bytes: number; alt: string; itemLocalKey?: string }
): Promise<string> {
  const [row] = await db
    .insert(publicationAssets)
    .values({
      publicationId,
      filePath: `library/${publicationId}/${fileName}`,
      mime: meta.mime,
      bytes: meta.bytes,
      alt: meta.alt.trim().slice(0, 200),
      itemLocalKey: meta.itemLocalKey ?? '',
    })
    .returning({ id: publicationAssets.id });
  return row.id;
}

/**
 * Copy one of the author's campaign images onto their listing.
 *
 * Both ends are checked: staff at the campaign the picture came from, owner of
 * the listing it is going onto. Publishing a picture out of a table you only
 * play at is not the author's call to make.
 */
export async function attachCampaignImage(
  publicationId: string,
  imageId: string,
  options: { itemLocalKey?: string; asCover?: boolean } = {}
): Promise<string> {
  const userId = await requireUserId();
  await requireOwnedPublication(publicationId, userId);

  const image = await getCampaignImage(imageId);
  if (!image) throw new Error('IMAGE_NOT_FOUND');
  await requireCampaignRole(image.campaignId, ['gm', 'co-gm']);

  const ext = IMAGE_EXTENSIONS[image.mime];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');

  const dir = libraryDir(publicationId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await copyFile(join(UPLOADS_DIR, image.filePath), join(dir, name));

  const assetId = await recordAsset(publicationId, name, {
    mime: image.mime,
    bytes: image.bytes,
    alt: image.alt,
    itemLocalKey: options.itemLocalKey,
  });

  if (options.asCover) {
    await db
      .update(publications)
      .set({ coverAssetId: assetId })
      .where(eq(publications.id, publicationId));
  }
  return assetId;
}

/** Upload a file straight onto a listing, for a picture with no campaign behind it. */
export async function uploadPublicationAsset(
  publicationId: string,
  file: File,
  alt: string,
  options: { itemLocalKey?: string; asCover?: boolean } = {}
): Promise<string> {
  const userId = await requireUserId();
  await requireOwnedPublication(publicationId, userId);

  const ext = IMAGE_EXTENSIONS[file.type];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('TOO_LARGE');

  const dir = libraryDir(publicationId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));

  const assetId = await recordAsset(publicationId, name, {
    mime: file.type,
    bytes: file.size,
    alt,
    itemLocalKey: options.itemLocalKey,
  });

  if (options.asCover) {
    await db
      .update(publications)
      .set({ coverAssetId: assetId })
      .where(eq(publications.id, publicationId));
  }
  return assetId;
}

/**
 * Copy a listing's picture into a campaign the reader runs.
 *
 * This is what adopting a picture means. The adopter ends up with a
 * `campaign_images` row of their own, indistinguishable from one they uploaded,
 * which is the point: everything downstream — the map panel, canon portraits,
 * the image picker — already works with those and needs to learn nothing.
 */
export async function copyAssetToCampaign(
  assetId: string,
  campaignId: string
): Promise<string> {
  await requireUserId();
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const asset = await getPublicationAsset(assetId);
  if (!asset) throw new Error('NOT_FOUND');

  const listing = await db.query.publications.findFirst({
    columns: { status: true },
    where: eq(publications.id, asset.publicationId),
  });
  if (!listing || listing.status !== 'listed') throw new Error('WITHDRAWN');

  const ext = IMAGE_EXTENSIONS[asset.mime];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');

  // Straight through `saveCampaignImage` rather than a second insert here: it
  // owns the campaign's directory layout and its own role check, and two places
  // writing `campaign_images` is how the two disagree about where files go.
  const bytes = await readFile(join(UPLOADS_DIR, asset.filePath));
  const file = new File([new Uint8Array(bytes)], `adopted.${ext}`, {
    type: asset.mime,
  });
  return saveCampaignImage(campaignId, file, asset.alt);
}

/**
 * Remove a listing's files from disk.
 *
 * Called when a publication is deleted outright — never when it is merely
 * withdrawn, because a withdrawn listing still renders for the readers who
 * already took it. The database rows go by cascade; this is the half SQLite
 * cannot do.
 */
export async function deletePublicationFiles(
  publicationId: string
): Promise<void> {
  await rm(libraryDir(publicationId), { recursive: true, force: true });
}
