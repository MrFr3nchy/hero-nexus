import 'server-only';

import { and, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';

import {
  isPublicationKind,
  normaliseTags,
  type AdoptionMode,
  type HeroPreview,
  type PublicationCard,
  type PublicationKind,
  type PublicationStatus,
  type PublicationVisibility,
} from '@/@creator/library/lib/publication';
import {
  fromHomebrew,
  isContentType,
  parseContentData,
  type ContentEntry,
  type ContentType,
} from '@/@shared/content';

import { db } from '@/db';
import {
  adoptions,
  homebrew,
  publicationItems,
  publications,
  users,
} from '@/db/schema';
import { getCampaignImage } from './campaign-images';
import { requireCampaignRole } from './campaigns';
import {
  attachCampaignImage,
  deletePublicationFiles,
  listPublicationAssets,
  type PublicationAssetRow,
} from './library-assets';
import { optionalUserId, requireUserId } from './session-user';

/**
 * The Wandering Library: putting something on the public shelf.
 *
 * This is the only module in the app that deliberately shows one account's rows
 * to another. Everything else here — campaigns, canon, sheets — is scoped by a
 * membership check; a publication is scoped by its author having said so.
 *
 * Two deliveries, and `kind` decides which (see
 * `@/@creator/library/lib/publication`):
 *
 * - **live-linked** (`homebrew`) — the listing points at the author's live row,
 *   so their later correction reaches every table using it. That is
 *   content-model rule 1 (a copy is a fork) applied across accounts.
 * - **snapshot** (everything else) — the listing carries a frozen `payload` and
 *   adopting mints rows the adopter owns outright, because a sheet and a
 *   campaign are mutable play state and a borrowed one has to stop moving the
 *   moment it is taken.
 *
 * `payload` is written for both. On the live kind it is the fallback: a
 * withdrawn or deleted homebrew row still renders as what it was rather than as
 * a blank card, the same reason `inventory[].name` is denormalised onto a sheet.
 *
 * Adoption lives in `./adoptions`; this module publishes and lists.
 */

export interface PublicationInput {
  title: string;
  summary?: string;
  tags?: unknown;
  visibility?: PublicationVisibility;
}

export interface ShelfFilters {
  kind?: PublicationKind;
  contentType?: ContentType;
  tag?: string;
  /** Free text over title, blurb and credit. */
  query?: string;
  /** One author's shelf. */
  ownerId?: string;
  sort?: 'newest' | 'adopted';
  limit?: number;
}

/** A listing, its content, and whatever travels with it. */
export interface PublicationDetail {
  card: PublicationCard;
  /**
   * The content as anything that renders it needs it — the live row where there
   * still is one, the frozen payload where there is not. `null` only when
   * neither adapts, which is a listing to hide rather than draw empty.
   */
  entry: ContentEntry | null;
  /** True when `entry` came out of the frozen payload rather than a live row. */
  fromSnapshot: boolean;
  items: PublicationItemRow[];
  /** The pictures the listing carries, cover first. */
  assets: PublicationAssetRow[];
}

export interface PublicationItemRow {
  id: string;
  kind: string;
  contentType: ContentType | null;
  name: string;
  localKey: string;
  payload: unknown;
  sortOrder: number;
}

/* --- freezing --------------------------------------------------------- */

/** What a homebrew row looks like once it is frozen onto a listing. */
export interface FrozenContent {
  type: ContentType;
  name: string;
  description: string;
  data: unknown;
}

/**
 * Freeze one homebrew row.
 *
 * Run through `parseContentData` on the way out, like every other write in the
 * app: a malformed blob must not become the *permanent* record of what a thing
 * was. This is the one copy of a stat block the content model allows, and the
 * reason it is allowed is that a listing whose live row is gone has to render
 * as something.
 */
export function freezeHomebrew(row: {
  type: ContentType;
  name: string;
  description: string;
  data: unknown;
}): FrozenContent {
  return {
    type: row.type,
    name: row.name,
    description: row.description,
    data: parseContentData(row.type, row.data),
  };
}

/** A frozen payload read back as content, for a listing with no live row. */
export function thawContent(
  publicationId: string,
  payload: unknown
): ContentEntry | null {
  const frozen = payload as Partial<FrozenContent> | null;
  if (!frozen || typeof frozen !== 'object') return null;
  if (typeof frozen.type !== 'string' || !isContentType(frozen.type)) {
    return null;
  }
  return fromHomebrew({
    // The listing's own id, so a thawed entry still has a stable ref. It
    // resolves to nothing on a sheet, which is correct: what it describes is
    // not in anybody's forge any more.
    id: publicationId,
    ownerId: '',
    type: frozen.type,
    name: frozen.name ?? '',
    description: frozen.description ?? '',
    data: frozen.data ?? {},
  });
}

/* --- reading ---------------------------------------------------------- */

/**
 * A listing plus the live row behind it, in one query.
 *
 * The join is what lets a card draw a real stat block. Reading the frozen
 * payload instead would be cheaper by one join and wrong by one edit: an author
 * who fixes a typo in their spell would keep seeing the old one on the shelf.
 */
const cardColumns = {
  id: publications.id,
  ownerId: publications.ownerId,
  kind: publications.kind,
  contentType: publications.contentType,
  title: publications.title,
  summary: publications.summary,
  tags: publications.tags,
  credit: publications.credit,
  visibility: publications.visibility,
  status: publications.status,
  version: publications.version,
  createdAt: publications.createdAt,
  updatedAt: publications.updatedAt,
  homebrewId: publications.homebrewId,
  payload: publications.payload,
  coverAssetId: publications.coverAssetId,
  liveId: homebrew.id,
  liveOwnerId: homebrew.ownerId,
  liveType: homebrew.type,
  liveName: homebrew.name,
  liveDescription: homebrew.description,
  liveData: homebrew.data,
};

/** Every read of a listing goes through this, so every read gets the preview. */
function selectCards() {
  return db
    .select(cardColumns)
    .from(publications)
    .leftJoin(homebrew, eq(homebrew.id, publications.homebrewId));
}

/**
 * The content a card draws: the live row, else the frozen payload.
 *
 * The fallback is the reason `payload` exists on a live-linked listing at all.
 * A withdrawn or deleted homebrew row still renders as what it was, rather than
 * as a blank card — the same argument as the denormalised `inventory[].name` on
 * a character sheet.
 */
function previewOf(row: CardQueryRow): ContentEntry | null {
  if (row.liveId) {
    return fromHomebrew({
      id: row.liveId,
      ownerId: row.liveOwnerId ?? '',
      type: row.liveType ?? '',
      name: row.liveName ?? '',
      description: row.liveDescription ?? '',
      data: row.liveData,
    });
  }
  return thawContent(row.id, row.payload);
}

/**
 * The six numbers and one line a hero's card needs, out of its frozen sheet.
 *
 * Deliberately not the whole `CharacterSheet`: a shelf of twenty heroes would
 * ship twenty full sheets to draw twenty ability rows. Read defensively — a
 * package written by an older build is not to be trusted to have every field.
 */
function heroOf(payload: unknown): HeroPreview | null {
  const sheet = (payload as { sheet?: Record<string, unknown> } | null)?.sheet;
  if (!sheet || typeof sheet !== 'object') return null;

  const identity = (sheet.identity ?? {}) as Record<string, unknown>;
  const combat = (sheet.combat ?? {}) as Record<string, unknown>;
  const scores = (sheet.abilities ?? {}) as Record<string, unknown>;
  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const str = (value: unknown): string =>
    typeof value === 'string' ? value : '';

  const level = num(identity.level, 1);
  const meta = [
    `Level ${level}`,
    str(identity.species),
    str(identity.subclass) || str(identity.class),
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    name: str(identity.name) || 'A nameless hero',
    meta,
    abilities: {
      str: num(scores.strength, 10),
      dex: num(scores.dexterity, 10),
      con: num(scores.constitution, 10),
      int: num(scores.intelligence, 10),
      wis: num(scores.wisdom, 10),
      cha: num(scores.charisma, 10),
    },
    derived: [
      { label: 'AC', value: String(num(combat.armorClass, 10)) },
      { label: 'HP', value: String(num(combat.hitPointsMax, 0)) },
      { label: 'Speed', value: `${num(combat.speed, 30)} ft` },
    ],
  };
}

/**
 * What a campaign package holds, counted off its payload.
 *
 * Read defensively: an older package need not have every list, and a card that
 * throws takes the whole shelf down with it.
 */
function contentsOf(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  if (!p) return null;
  const count = (key: string): number =>
    Array.isArray(p[key]) ? (p[key] as unknown[]).length : 0;

  const parts = [
    [count('entries'), 'canon entries'],
    [count('quests'), 'quests'],
    [count('notes'), 'notes'],
    [count('maps'), 'maps'],
  ] as const;

  const said = parts
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${n === 1 ? label.replace(/e?s$/, '') : label}`);
  return said.length > 0 ? said.join(' · ') : null;
}

type CardQueryRow = {
  id: string;
  ownerId: string;
  kind: string;
  contentType: string | null;
  title: string;
  summary: string;
  tags: unknown;
  credit: string;
  visibility: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  homebrewId: string | null;
  payload: unknown;
  coverAssetId: string | null;
  liveId: string | null;
  liveOwnerId: string | null;
  liveType: string | null;
  liveName: string | null;
  liveDescription: string | null;
  liveData: unknown;
};

/**
 * Counts and marks for a page of listings, in two queries rather than two per
 * card. A shelf of forty listings asking "how many took this?" one at a time is
 * the shape that makes a page feel slow for no reason.
 */
async function decorate(
  rows: CardQueryRow[],
  readerId: string | null
): Promise<PublicationCard[]> {
  const ids = rows.map(r => r.id);
  const counts = new Map<string, number>();
  const items = new Map<string, number>();
  const mine = new Map<string, AdoptionMode>();

  if (ids.length > 0) {
    const [adoptionRows, itemRows] = await Promise.all([
      db
        .select({ id: adoptions.publicationId, n: count() })
        .from(adoptions)
        .where(inArray(adoptions.publicationId, ids))
        .groupBy(adoptions.publicationId),
      db
        .select({ id: publicationItems.publicationId, n: count() })
        .from(publicationItems)
        .where(inArray(publicationItems.publicationId, ids))
        .groupBy(publicationItems.publicationId),
    ]);
    for (const row of adoptionRows) counts.set(row.id, Number(row.n));
    for (const row of itemRows) items.set(row.id, Number(row.n));

    if (readerId) {
      const own = await db
        .select({ id: adoptions.publicationId, mode: adoptions.mode })
        .from(adoptions)
        .where(
          and(
            eq(adoptions.userId, readerId),
            inArray(adoptions.publicationId, ids)
          )
        );
      for (const row of own) mine.set(row.id, row.mode);
    }
  }

  return rows.map(row => toCard(row, readerId, counts, items, mine));
}

function toCard(
  row: CardQueryRow,
  readerId: string | null,
  counts: Map<string, number>,
  items: Map<string, number>,
  mine: Map<string, AdoptionMode>
): PublicationCard {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: isPublicationKind(row.kind) ? row.kind : 'bundle',
    homebrewId: row.homebrewId,
    contentType:
      row.contentType && isContentType(row.contentType)
        ? row.contentType
        : null,
    title: row.title,
    summary: row.summary,
    tags: normaliseTags(row.tags),
    credit: row.credit,
    visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
    status: row.status === 'withdrawn' ? 'withdrawn' : 'listed',
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    adoptions: counts.get(row.id) ?? 0,
    mine: readerId !== null && row.ownerId === readerId,
    adopted: mine.get(row.id) ?? null,
    itemCount: items.get(row.id) ?? 0,
    preview: previewOf(row),
    hero: row.kind === 'character' ? heroOf(row.payload) : null,
    contents: row.kind === 'campaign' ? contentsOf(row.payload) : null,
    coverUrl: row.coverAssetId
      ? `/api/library/${row.id}/assets/${row.coverAssetId}`
      : null,
  };
}

/**
 * The shelf.
 *
 * Only `listed` and `public` rows: an unlisted publication is reachable by its
 * link and nowhere else, which is what "unlisted" means, and a withdrawn one is
 * off the shelf without anybody's existing adoption breaking.
 *
 * Renders for a stranger. Signed in, each card also carries whether it is yours
 * and whether you have taken it.
 */
export async function listShelf(
  filters: ShelfFilters = {}
): Promise<PublicationCard[]> {
  const readerId = await optionalUserId();
  const clauses = [
    eq(publications.status, 'listed'),
    eq(publications.visibility, 'public'),
  ];
  if (filters.kind) clauses.push(eq(publications.kind, filters.kind));
  if (filters.contentType) {
    clauses.push(eq(publications.contentType, filters.contentType));
  }
  if (filters.ownerId) clauses.push(eq(publications.ownerId, filters.ownerId));
  if (filters.tag) {
    // Tags are a JSON array of lowercase words; `"tag"` matches the whole
    // element rather than a listing whose blurb happens to contain it.
    clauses.push(like(publications.tags, `%"${filters.tag.toLowerCase()}"%`));
  }
  if (filters.query) {
    const q = `%${filters.query.trim().toLowerCase()}%`;
    if (q.length > 2) {
      clauses.push(
        or(
          like(sql`lower(${publications.title})`, q),
          like(sql`lower(${publications.summary})`, q),
          like(sql`lower(${publications.credit})`, q)
        )!
      );
    }
  }

  const rows = (await selectCards()
    .where(and(...clauses))
    .orderBy(desc(publications.updatedAt))
    .limit(filters.limit ?? 200)) as CardQueryRow[];

  const cards = await decorate(rows, readerId);
  return filters.sort === 'adopted'
    ? [...cards].sort((a, b) => b.adoptions - a.adoptions)
    : cards;
}

/** Everything one account has published, withdrawn rows included. Own only. */
export async function listMyPublications(): Promise<PublicationCard[]> {
  const userId = await requireUserId();
  const rows = (await selectCards()
    .where(eq(publications.ownerId, userId))
    .orderBy(desc(publications.updatedAt))) as CardQueryRow[];
  return decorate(rows, userId);
}

/**
 * One listing, whatever its status.
 *
 * A withdrawn or unlisted publication resolves here on purpose: the adopters who
 * already took it still have a link to follow, and an author still has a page to
 * relist from. Only the *shelf* filters.
 */
export async function getPublication(
  id: string
): Promise<PublicationDetail | null> {
  const readerId = await optionalUserId();
  const [row] = (await selectCards()
    .where(eq(publications.id, id))
    .limit(1)) as CardQueryRow[];
  if (!row) return null;

  const [card] = await decorate([row], readerId);

  const [itemRows, assets] = await Promise.all([
    db
      .select()
      .from(publicationItems)
      .where(eq(publicationItems.publicationId, id))
      .orderBy(publicationItems.sortOrder),
    listPublicationAssets(id),
  ]);

  return {
    card,
    entry: card.preview,
    fromSnapshot: row.liveId === null,
    items: itemRows.map(item => ({
      id: item.id,
      kind: item.kind,
      contentType:
        item.contentType && isContentType(item.contentType)
          ? item.contentType
          : null,
      name: item.name,
      localKey: item.localKey,
      payload: item.payload,
      sortOrder: item.sortOrder,
    })),
    // Cover first: it is the picture the card already showed, so it is the one a
    // reader opening the listing expects to be looking at.
    assets: [...assets].sort((a, b) =>
      a.id === row.coverAssetId ? -1 : b.id === row.coverAssetId ? 1 : 0
    ),
  };
}

/** The listing for one homebrew row, so the Forge can say whether it is out. */
export async function publicationForHomebrew(
  homebrewId: string
): Promise<PublicationCard | null> {
  const readerId = await optionalUserId();
  const [row] = (await selectCards()
    .where(eq(publications.homebrewId, homebrewId))
    .limit(1)) as CardQueryRow[];
  if (!row) return null;
  const [card] = await decorate([row], readerId);
  return card;
}

/** The listing for one campaign, so its manage page can say whether it is out. */
export async function publicationForCampaign(
  campaignId: string
): Promise<PublicationCard | null> {
  const readerId = await optionalUserId();
  const [row] = (await selectCards()
    .where(eq(publications.campaignId, campaignId))
    .limit(1)) as CardQueryRow[];
  if (!row) return null;
  const [card] = await decorate([row], readerId);
  return card;
}

/** The listing for one hero, so their sheet page can say whether they are out. */
export async function publicationForCharacter(
  characterId: string
): Promise<PublicationCard | null> {
  const readerId = await optionalUserId();
  const [row] = (await selectCards()
    .where(eq(publications.characterId, characterId))
    .limit(1)) as CardQueryRow[];
  if (!row) return null;
  const [card] = await decorate([row], readerId);
  return card;
}

/**
 * Every listing the signed-in author has out for their own forged content.
 *
 * An array rather than a map keyed on homebrew id: this crosses a server-action
 * boundary, and a `Map` does not survive that trip. Each card carries its
 * `homebrewId`, so the Forge builds the index it wants on arrival.
 */
export async function listMyHomebrewPublications(): Promise<PublicationCard[]> {
  const userId = await requireUserId();
  const rows = (await selectCards().where(
    and(eq(publications.ownerId, userId), eq(publications.kind, 'homebrew'))
  )) as CardQueryRow[];
  return decorate(rows, userId);
}

/* --- writing ---------------------------------------------------------- */

/**
 * How the shelf credits an author.
 *
 * Frozen onto the row at publish time rather than joined on `user.name`, so
 * renaming an account does not rewrite what it published and a deleted author
 * keeps their credit. Never the email address — that is the one field on `user`
 * nobody agreed to show a stranger.
 */
export async function creditFor(userId: string): Promise<string> {
  const row = await db.query.users.findFirst({
    columns: { name: true },
    where: eq(users.id, userId),
  });
  return row?.name?.trim() || 'An unsigned hand';
}

/**
 * Put one homebrew row on the shelf, or update the listing it already has.
 *
 * Idempotent by design — `publications_homebrew_idx` is unique, and publishing
 * the same spell twice is an edit of the listing that exists rather than a
 * second stall selling the same thing. Re-publishing re-freezes the payload and
 * bumps `version`, so an adopter can be told they are behind.
 */
export async function publishHomebrew(
  homebrewId: string,
  input: PublicationInput
): Promise<string> {
  const userId = await requireUserId();

  const row = await db.query.homebrew.findFirst({
    where: and(eq(homebrew.id, homebrewId), eq(homebrew.ownerId, userId)),
  });
  if (!row) throw new Error('NOT_YOUR_HOMEBREW');

  const frozen = freezeHomebrew({
    type: row.type,
    name: row.name,
    description: row.description,
    data: row.data,
  });
  const now = new Date().toISOString();
  const patch = {
    title: input.title.trim() || row.name,
    summary: input.summary?.trim() ?? '',
    tags: normaliseTags(input.tags),
    visibility: input.visibility ?? 'public',
    payload: frozen,
    contentType: row.type,
    updatedAt: now,
  };

  const existing = await db.query.publications.findFirst({
    columns: { id: true, ownerId: true, version: true },
    where: eq(publications.homebrewId, homebrewId),
  });

  if (existing) {
    if (existing.ownerId !== userId) throw new Error('NOT_YOUR_PUBLICATION');
    await db
      .update(publications)
      .set({
        ...patch,
        // Relisting is part of publishing again: an author who withdrew a
        // spell and then publishes it anew means for it to be on the shelf.
        status: 'listed',
        version: existing.version + 1,
      })
      .where(eq(publications.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(publications)
    .values({
      ownerId: userId,
      kind: 'homebrew',
      homebrewId,
      credit: await creditFor(userId),
      ...patch,
    })
    .returning({ id: publications.id });

  // The author's own row is public now; `homebrew.visibility` was the column
  // that meant this before there was a shelf, and leaving the two disagreeing
  // is how a "private" spell ends up listed.
  await db
    .update(homebrew)
    .set({ visibility: 'public' })
    .where(eq(homebrew.id, homebrewId));

  return created.id;
}

/** Edit the listing — its title, blurb, tags, visibility. Not its content. */
export async function updatePublication(
  id: string,
  input: Partial<PublicationInput>
): Promise<void> {
  const userId = await requireUserId();
  const patch: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.summary !== undefined) patch.summary = input.summary.trim();
  if (input.tags !== undefined) patch.tags = normaliseTags(input.tags);
  if (input.visibility !== undefined) patch.visibility = input.visibility;

  const result = await db
    .update(publications)
    .set(patch)
    .where(and(eq(publications.id, id), eq(publications.ownerId, userId)))
    .returning({ id: publications.id });
  if (result.length === 0) throw new Error('NOT_YOUR_PUBLICATION');
}

/**
 * Take it off the shelf, or put it back.
 *
 * Withdrawing stops new adoptions and hides the listing. It reaches into
 * nobody's existing one: a linked adoption keeps resolving to the live homebrew
 * row, and every snapshot adoption was always the adopter's own rows. An author
 * who wants their work gone from other people's tables is asking for something
 * this app cannot honestly promise, and cascading a delete into other users'
 * characters would be worse than saying so.
 */
export async function setPublicationStatus(
  id: string,
  status: PublicationStatus
): Promise<void> {
  const userId = await requireUserId();
  const result = await db
    .update(publications)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(publications.id, id), eq(publications.ownerId, userId)))
    .returning({ id: publications.id, homebrewId: publications.homebrewId });
  if (result.length === 0) throw new Error('NOT_YOUR_PUBLICATION');

  const homebrewId = result[0].homebrewId;
  if (homebrewId) {
    await db
      .update(homebrew)
      .set({ visibility: status === 'listed' ? 'public' : 'private' })
      .where(and(eq(homebrew.id, homebrewId), eq(homebrew.ownerId, userId)));
  }
}

/**
 * Delete the listing outright.
 *
 * Cascades to its items and to the `adoptions` rows recording that it was
 * taken. It does not touch what those adoptions produced — a hero somebody
 * minted from it is theirs, and a linked shelf entry falls back to the live
 * homebrew row. Withdrawing is the gentler thing and what the UI offers first.
 */
export async function deletePublication(id: string): Promise<void> {
  const userId = await requireUserId();
  const removed = await db
    .delete(publications)
    .where(and(eq(publications.id, id), eq(publications.ownerId, userId)))
    .returning({ id: publications.id });
  // Only once the row is actually gone. Removing the directory first would
  // strip a listing of its pictures on a failed ownership check.
  if (removed.length > 0) await deletePublicationFiles(id);
}

/**
 * Put a picture on the shelf.
 *
 * A snapshot kind: the bytes are copied out of the campaign they came from, so
 * the listing survives that campaign being archived and does not need the
 * role-checked campaign image route relaxed to be readable. The copy is also the
 * cover, because a picture listing whose card draws nothing would be absurd.
 */
export async function publishImage(
  campaignImageId: string,
  input: PublicationInput
): Promise<string> {
  const userId = await requireUserId();

  const image = await getCampaignImage(campaignImageId);
  if (!image) throw new Error('IMAGE_NOT_FOUND');
  // Staff only: publishing a picture out of a table you merely play at is not
  // your call, whoever uploaded it.
  await requireCampaignRole(image.campaignId, ['gm', 'co-gm']);

  const [created] = await db
    .insert(publications)
    .values({
      ownerId: userId,
      kind: 'image',
      credit: await creditFor(userId),
      title: input.title.trim() || image.alt || 'A picture',
      summary: input.summary?.trim() ?? '',
      tags: normaliseTags(input.tags),
      visibility: input.visibility ?? 'public',
      payload: { alt: image.alt, mime: image.mime },
    })
    .returning({ id: publications.id });

  await attachCampaignImage(created.id, campaignImageId, { asCover: true });
  return created.id;
}
