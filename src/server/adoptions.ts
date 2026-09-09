import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import type { AdoptionMode } from '@/@creator/library/lib/publication';
import { fromHomebrew, type ContentEntry } from '@/@shared/content';

import { db } from '@/db';
import { adoptions, homebrew, publications } from '@/db/schema';
import { copyAssetToCampaign } from './library-assets';
import { freezeHomebrew, thawContent } from './library';
import { requireUserId } from './session-user';

/**
 * Taking something off the shelf.
 *
 * Two modes, and the difference is the whole feature:
 *
 * - **linked** — the reader's shelf now shows the author's live row. A
 *   correction the author makes reaches every table using it, and it is not the
 *   reader's to edit. This is content-model rule 1 across accounts: a copy is a
 *   fork, so a thing that is meant to stay one thing must stay one row.
 * - **forked** — the reader gets their own `homebrew` row, copied at that
 *   moment, theirs to edit, with `forked_from` recording where it came from.
 *   The two never speak again. This is the escape hatch for "nearly right", and
 *   it is a deliberate choice rather than the default, because the default
 *   silently forking is exactly the drift the content model exists to prevent.
 *
 * `ShelfOrigin` reserved `'shared'` for the linked case before anything wrote
 * it, so every consumer of a shelf already handles what this module produces —
 * the filters, the "yours to edit" affordance and the compendium detail pane all
 * read `origin` rather than guessing from `ref.source`.
 */

export interface AdoptionRow {
  id: string;
  publicationId: string;
  mode: AdoptionMode;
  /** What it resolves to: the author's row for a link, the reader's for a fork. */
  homebrewId: string | null;
  characterId: string | null;
  campaignId: string | null;
  /** The listing's version when it was taken. */
  version: number;
  createdAt: string;
}

/**
 * Read the listing a reader is about to take, and refuse the cases that are not
 * a taking at all.
 *
 * Withdrawn is refused rather than ignored: an author who took a thing off the
 * shelf gets to stop *new* adoptions, even though the ones already made keep
 * working (see `setPublicationStatus`).
 */
async function loadTakeable(publicationId: string, userId: string) {
  const row = await db.query.publications.findFirst({
    where: eq(publications.id, publicationId),
  });
  if (!row) throw new Error('NOT_FOUND');
  if (row.ownerId === userId) throw new Error('OWN_PUBLICATION');
  if (row.status !== 'listed') throw new Error('WITHDRAWN');
  return row;
}

/**
 * Take a listing as a link.
 *
 * Idempotent: taking the same thing twice is not two copies of it, and the
 * unique index says so. Re-adopting after a fork moves the row back to a link,
 * which is the honest reading of "actually, keep it in step with theirs" — the
 * forked copy stays in the reader's forge, because it is theirs and deleting
 * somebody's work to satisfy a mode change would be indefensible.
 */
export async function adopt(
  publicationId: string,
  /**
   * Where a picture should land. Required for the `image` kind and meaningless
   * for the rest: images belong to campaigns in this app, and an adopter has to
   * say which of theirs receives it — see the README on why there is no
   * user-level image store to default to.
   */
  targetCampaignId?: string
): Promise<void> {
  const userId = await requireUserId();
  const row = await loadTakeable(publicationId, userId);

  if (row.kind === 'image') {
    if (!targetCampaignId) throw new Error('CAMPAIGN_REQUIRED');
    if (!row.coverAssetId) throw new Error('CONTENT_GONE');
    // The bytes are copied into the adopter's campaign, so what they end up with
    // is a `campaign_images` row indistinguishable from one they uploaded. That
    // is why the map panel and the canon portraits need to learn nothing.
    await copyAssetToCampaign(row.coverAssetId, targetCampaignId);
    await db
      .insert(adoptions)
      .values({
        userId,
        publicationId,
        // A copied picture is a fork by any honest reading: the file is theirs
        // now and nothing the author does reaches it.
        mode: 'forked',
        campaignId: targetCampaignId,
        version: row.version,
      })
      .onConflictDoUpdate({
        target: [adoptions.userId, adoptions.publicationId],
        set: {
          mode: 'forked',
          campaignId: targetCampaignId,
          version: row.version,
        },
      });
    return;
  }

  if (row.kind !== 'homebrew') {
    // Heroes, campaigns and bundles are snapshots and each mints different
    // rows; they arrive with their own phases. Refusing loudly beats writing an
    // adoption row that resolves to nothing.
    throw new Error('KIND_NOT_ADOPTABLE_YET');
  }
  if (!row.homebrewId) throw new Error('CONTENT_GONE');

  await db
    .insert(adoptions)
    .values({
      userId,
      publicationId,
      mode: 'linked',
      homebrewId: row.homebrewId,
      version: row.version,
    })
    .onConflictDoUpdate({
      target: [adoptions.userId, adoptions.publicationId],
      set: {
        mode: 'linked',
        homebrewId: row.homebrewId,
        version: row.version,
      },
    });
}

/**
 * Take a listing as your own copy.
 *
 * The copy is made from the live row where there is one and from the frozen
 * payload where there is not, so forking a listing whose author has since
 * deleted their own row still works — that is what the payload is for.
 *
 * `forkedFrom` holds the publication id, not the source `homebrew.id`: the
 * listing is the thing that stays reachable, and it is what a provenance line
 * should link to.
 */
export async function fork(publicationId: string): Promise<string> {
  const userId = await requireUserId();
  const row = await loadTakeable(publicationId, userId);
  // Forking means "a homebrew row of your own". A picture is copied by adopting
  // it, and the snapshot kinds mint their own rows; none of them has a second
  // mode to offer.
  if (row.kind !== 'homebrew') throw new Error('KIND_NOT_ADOPTABLE_YET');

  const live = row.homebrewId
    ? await db.query.homebrew.findFirst({
        where: eq(homebrew.id, row.homebrewId),
      })
    : null;

  const source = live
    ? freezeHomebrew({
        type: live.type,
        name: live.name,
        description: live.description,
        data: live.data,
      })
    : (() => {
        const thawed = thawContent(row.id, row.payload);
        if (!thawed) throw new Error('CONTENT_GONE');
        return {
          type: thawed.type,
          name: thawed.name,
          description: thawed.description,
          data: thawed.data,
        };
      })();

  const [created] = await db
    .insert(homebrew)
    .values({
      ownerId: userId,
      type: source.type,
      name: source.name,
      description: source.description,
      data: source.data,
      // A fork starts private. Publishing somebody else's work under your own
      // name is a decision, not a side effect of taking a copy of it.
      visibility: 'private',
      forkedFrom: publicationId,
    })
    .returning({ id: homebrew.id });

  await db
    .insert(adoptions)
    .values({
      userId,
      publicationId,
      mode: 'forked',
      homebrewId: created.id,
      version: row.version,
    })
    .onConflictDoUpdate({
      target: [adoptions.userId, adoptions.publicationId],
      set: { mode: 'forked', homebrewId: created.id, version: row.version },
    });

  return created.id;
}

/**
 * Put it back.
 *
 * Drops the link, and the shelf loses the row. A fork is left alone: it is the
 * reader's own content by then, and it stays in their forge as theirs — only the
 * record of where it came from goes.
 */
export async function unadopt(publicationId: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(adoptions)
    .where(
      and(
        eq(adoptions.userId, userId),
        eq(adoptions.publicationId, publicationId)
      )
    );
}

/** Everything the signed-in reader has taken, newest first. */
export async function listAdoptions(): Promise<AdoptionRow[]> {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(adoptions)
    .where(eq(adoptions.userId, userId))
    .orderBy(desc(adoptions.createdAt));
  return rows.map(row => ({
    id: row.id,
    publicationId: row.publicationId,
    mode: row.mode,
    homebrewId: row.homebrewId,
    characterId: row.characterId,
    campaignId: row.campaignId,
    version: row.version,
    createdAt: row.createdAt,
  }));
}

/**
 * The content on the reader's shelf that belongs to somebody else.
 *
 * Linked adoptions only. A fork is already the reader's own `homebrew` row and
 * reaches every shelf and picker through `listHomebrew` — counting it here as
 * well would put it on the shelf twice, once as theirs and once as shared.
 *
 * A link whose live row is gone falls back to the frozen payload, so a table
 * mid-campaign does not lose an item because its author tidied their forge. It
 * comes back with the publication id as its ref key, which resolves to nothing
 * on a sheet — correct, and the reason `resolveContentRefs` renders an
 * unresolvable ref as `Unavailable` rather than as blank.
 */
export async function listAdoptedContent(): Promise<ContentEntry[]> {
  const userId = await requireUserId();
  const rows = await db
    .select({
      publicationId: publications.id,
      payload: publications.payload,
      homebrewId: homebrew.id,
      ownerId: homebrew.ownerId,
      type: homebrew.type,
      name: homebrew.name,
      description: homebrew.description,
      data: homebrew.data,
    })
    .from(adoptions)
    .innerJoin(publications, eq(publications.id, adoptions.publicationId))
    .leftJoin(homebrew, eq(homebrew.id, adoptions.homebrewId))
    .where(and(eq(adoptions.userId, userId), eq(adoptions.mode, 'linked')));

  return rows.flatMap(row => {
    const entry = row.homebrewId
      ? fromHomebrew({
          id: row.homebrewId,
          ownerId: row.ownerId ?? '',
          type: row.type ?? '',
          name: row.name ?? '',
          description: row.description ?? '',
          data: row.data,
        })
      : thawContent(row.publicationId, row.payload);
    return entry ? [entry] : [];
  });
}
