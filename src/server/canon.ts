import 'server-only';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { isGlyphName, type GlyphName } from '@/@shared/components/ui/Glyph';
import {
  canonCollections,
  canonEntries,
  canonLinks,
  canonPartyNotes,
  canonReveals,
  campaignMembers,
  campaigns,
  factionStanding,
  users,
} from '@/db/schema';
import { refKey, type ContentEntry, type ContentRef } from '@/@shared/content';
import { isAttitude } from '@/@creator/campaign/lib/standing';
import { listCampaignContentIds } from './campaign-content';
import { resolveContentRefs } from './content';
import { requireCampaignRole } from './campaigns';
import { bumpVersion } from './live-hub';
import { wouldLoop } from '@/@creator/campaign/lib/world';
import {
  tidyFields,
  type CanonCollectionInput,
  type CanonCollectionRow,
  type CanonEntryRow,
  type CanonInput,
  type CanonKind,
  type PartyNoteRow,
} from '@/@creator/campaign/lib/canon';

/**
 * A shelf's spine is a `GlyphName`, not free text. Anything unrecognised —
 * an emoji from before the glyph set landed, or a hand-written request —
 * becomes the fallback rather than being stored and failing to draw later.
 */
function shelfGlyphOr(fallback: GlyphName, icon?: string | null): GlyphName {
  return icon && isGlyphName(icon) ? icon : fallback;
}

export {
  CANON_KINDS,
  CANON_KIND_FIELDS,
  CANON_KIND_GLYPHS,
  CANON_KIND_LABELS,
  type CanonCollectionInput,
  type CanonCollectionRow,
  type CanonEntryRow,
  type CanonInput,
  type CanonKind,
  type CanonLinkRef,
  type CanonVisibility,
  type PartyNoteRow,
} from '@/@creator/campaign/lib/canon';

function isStaffRole(role: string): boolean {
  return role === 'gm' || role === 'co-gm';
}

/** Resolve the entry's campaign and assert the caller is staff there. */
async function requireStaffForEntry(entryId: string): Promise<{
  entry: typeof canonEntries.$inferSelect;
  userId: string;
}> {
  const entry = await db.query.canonEntries.findFirst({
    where: eq(canonEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(entry.campaignId, [
    'gm',
    'co-gm',
  ]);
  return { entry, userId };
}

/**
 * The whole canon for a campaign, filtered for the caller.
 *
 * Staff get every entry with both bodies, its links, and the per-member reveal
 * list. A player gets only entries that are `shared` or revealed to them, with
 * `dmBody` stripped to `null` before it leaves the server — the same
 * filter-before-return shape `getLiveState` uses for handouts.
 */
export async function listCanon(campaignId: string): Promise<CanonEntryRow[]> {
  const { userId, role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const staff = isStaffRole(role);

  const entries = await db
    .select()
    .from(canonEntries)
    .where(eq(canonEntries.campaignId, campaignId))
    .orderBy(desc(canonEntries.updatedAt));
  if (entries.length === 0) return [];

  const entryIds = entries.map(e => e.id);

  const reveals = await db
    .select()
    .from(canonReveals)
    .where(inArray(canonReveals.entryId, entryIds));
  const revealedToMe = new Set(
    reveals.filter(r => r.userId === userId).map(r => r.entryId)
  );

  const links = await db
    .select()
    .from(canonLinks)
    .where(eq(canonLinks.campaignId, campaignId));

  // Titles/kinds for link rendering, keyed by id.
  const meta = new Map(entries.map(e => [e.id, e]));

  // Staff-only: names for the reveal list.
  const revealUserIds = [...new Set(reveals.map(r => r.userId))];
  const nameById = new Map<string, string | null>();
  if (staff && revealUserIds.length) {
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, revealUserIds));
    rows.forEach(r => nameById.set(r.id, r.name));
  }

  const visible = entries.filter(
    e => staff || e.visibility === 'shared' || revealedToMe.has(e.id)
  );
  const visibleIds = new Set(visible.map(e => e.id));

  // What the party has written, on what this viewer can read.
  const noteRows = await db
    .select({
      id: canonPartyNotes.id,
      entryId: canonPartyNotes.entryId,
      userId: canonPartyNotes.userId,
      body: canonPartyNotes.body,
      createdAt: canonPartyNotes.createdAt,
      name: users.name,
    })
    .from(canonPartyNotes)
    .leftJoin(users, eq(users.id, canonPartyNotes.userId))
    .where(eq(canonPartyNotes.campaignId, campaignId))
    .orderBy(asc(canonPartyNotes.createdAt));
  const notesOf = new Map<string, PartyNoteRow[]>();
  for (const n of noteRows) {
    if (!visibleIds.has(n.entryId)) continue;
    const list = notesOf.get(n.entryId) ?? [];
    list.push({
      id: n.id,
      body: n.body,
      byName: n.name || 'Somebody',
      mine: n.userId === userId,
      canEdit: staff || n.userId === userId,
      createdAt: n.createdAt,
    });
    notesOf.set(n.entryId, list);
  }

  // Stat blocks, staff only: resolved together, and a homebrew one counts
  // only while it is in this campaign's library (content-model rule 6).
  const statRefs: ContentRef[] = staff
    ? visible
        .filter(e => e.statSource && e.statKey)
        .map(e => ({
          source: e.statSource!,
          type: 'creature' as const,
          key: e.statKey!,
        }))
    : [];
  const [resolvedStats, libraryIds] = statRefs.length
    ? await Promise.all([
        resolveContentRefs(statRefs),
        listCampaignContentIds(campaignId),
      ])
    : [new Map<string, ContentEntry>(), new Set<string>()];

  // Faction standing: the shown sum for everyone, the whole sum for staff.
  const factionIds = visible.filter(e => e.kind === 'faction').map(e => e.id);
  const standingRows = factionIds.length
    ? await db
        .select({
          entryId: factionStanding.canonEntryId,
          delta: factionStanding.delta,
          shown: factionStanding.shown,
        })
        .from(factionStanding)
        .where(inArray(factionStanding.canonEntryId, factionIds))
    : [];

  return visible.map(e => {
    const outgoing = links
      .filter(l => l.fromEntryId === e.id)
      .map(l => meta.get(l.toEntryId))
      .filter((x): x is typeof canonEntries.$inferSelect => Boolean(x))
      // Never leak a DM-only entry's existence through another entry's links.
      .filter(
        target =>
          staff || target.visibility === 'shared' || revealedToMe.has(target.id)
      )
      .map(target => ({
        id: target.id,
        title: target.title,
        kind: target.kind as CanonKind,
      }));

    return {
      id: e.id,
      campaignId: e.campaignId,
      kind: e.kind as CanonKind,
      title: e.title,
      partyBody: e.partyBody,
      dmBody: staff ? e.dmBody : null,
      visibility: e.visibility,
      revealedToMe:
        !staff && e.visibility !== 'shared' && revealedToMe.has(e.id),
      collectionId: e.collectionId,
      imageId: e.imageId,
      fields: (e.fields ?? {}) as Record<string, string>,
      // A place the viewer has not been shown is not somewhere they know
      // this is: the pointer goes with the place.
      placeId: e.placeId && visibleIds.has(e.placeId) ? e.placeId : null,
      partyNotes: notesOf.get(e.id) ?? [],
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      links: outgoing,
      revealedTo: staff
        ? reveals
            .filter(r => r.entryId === e.id)
            .map(r => ({
              userId: r.userId,
              name: nameById.get(r.userId) ?? null,
            }))
        : [],
      // DM-private, nulled here exactly as `dmBody` is.
      attitude: staff && isAttitude(e.attitude) ? e.attitude : null,
      stat: staff ? statFor(e, resolvedStats, libraryIds) : null,
      standing:
        e.kind === 'faction'
          ? (() => {
              const mine = standingRows.filter(r => r.entryId === e.id);
              const shown = mine
                .filter(r => r.shown)
                .reduce((n, r) => n + r.delta, 0);
              const total = mine.reduce((n, r) => n + r.delta, 0);
              return { shown, total: staff ? total : null };
            })()
          : null,
    };
  });
}

function statFor(
  e: typeof canonEntries.$inferSelect,
  resolved: Map<string, ContentEntry>,
  libraryIds: Set<string>
): CanonEntryRow['stat'] {
  if (!e.statSource || !e.statKey) return null;
  const ref: ContentRef = {
    source: e.statSource,
    type: 'creature',
    key: e.statKey,
  };
  const entry = resolved.get(refKey(ref));
  const inPlay = ref.source === 'srd' || libraryIds.has(ref.key);
  return {
    ref,
    name: entry?.name ?? null,
    available: Boolean(entry) && inPlay,
  };
}

/**
 * A place for `entryId` to be in: a `location` entry at the same table, and
 * — when the entry is itself a place — not one inside it, or the tree would
 * close into a loop. Undefined leaves it as it is; null makes it nowhere.
 */
export async function checkPlace(
  campaignId: string,
  entryId: string | null,
  placeId: string | null | undefined
): Promise<string | null | undefined> {
  if (placeId === undefined || placeId === null) return placeId;
  const rows = await db
    .select({
      id: canonEntries.id,
      kind: canonEntries.kind,
      placeId: canonEntries.placeId,
    })
    .from(canonEntries)
    .where(eq(canonEntries.campaignId, campaignId));
  const byId = new Map(rows.map(r => [r.id, r]));
  const target = byId.get(placeId);
  if (!target) throw new Error('NOT_FOUND');
  if (target.kind !== 'location') throw new Error('NOT_A_PLACE');
  if (entryId && wouldLoop(entryId, placeId, id => byId.get(id)?.placeId)) {
    throw new Error('PLACE_LOOP');
  }
  return placeId;
}

export async function createCanonEntry(
  campaignId: string,
  input: CanonInput
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const placeId = await checkPlace(campaignId, null, input.placeId);
  const [row] = await db
    .insert(canonEntries)
    .values({
      campaignId,
      kind: input.kind,
      title: input.title.trim(),
      dmBody: input.dmBody,
      partyBody: input.partyBody,
      visibility: input.visibility ?? 'dm',
      collectionId: input.collectionId ?? null,
      imageId: input.imageId ?? null,
      fields: tidyFields(input.kind, input.fields),
      placeId: placeId ?? null,
      createdBy: userId,
    })
    .returning({ id: canonEntries.id });
  bumpVersion(campaignId);
  return row.id;
}

export async function updateCanonEntry(
  entryId: string,
  patch: Partial<CanonInput>
): Promise<void> {
  const { entry } = await requireStaffForEntry(entryId);
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.dmBody !== undefined) set.dmBody = patch.dmBody;
  if (patch.partyBody !== undefined) set.partyBody = patch.partyBody;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.collectionId !== undefined) set.collectionId = patch.collectionId;
  if (patch.imageId !== undefined) set.imageId = patch.imageId;
  if (patch.placeId !== undefined) {
    set.placeId = await checkPlace(entry.campaignId, entryId, patch.placeId);
  }
  // A place that stops being a place cannot keep things inside it.
  if (patch.kind !== undefined && patch.kind !== 'location') {
    const inside = await db
      .select({ id: canonEntries.id })
      .from(canonEntries)
      .where(eq(canonEntries.placeId, entryId));
    if (inside.length > 0 && entry.kind === 'location') {
      throw new Error('PLACE_IN_USE');
    }
  }
  // Facts are validated against the kind the entry ends up with, so changing
  // an NPC into a spell drops the facts that no longer mean anything.
  if (patch.fields !== undefined) {
    set.fields = tidyFields(
      (patch.kind ?? entry.kind) as CanonKind,
      patch.fields
    );
  }
  await db.update(canonEntries).set(set).where(eq(canonEntries.id, entryId));
  bumpVersion(entry.campaignId);
}

/* --- collections --------------------------------------------------------- */

function hydrateCollection(
  row: typeof canonCollections.$inferSelect
): CanonCollectionRow {
  return {
    id: row.id,
    campaignId: row.campaignId,
    title: row.title,
    blurb: row.blurb,
    icon: row.icon,
    imageId: row.imageId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The shelves at this table. Everyone sees them all — a shelf's existence is
 * not a secret, what stands on it is; an empty-looking Bestiary tells a player
 * only that they have met nothing in it yet.
 */
export async function listCanonCollections(
  campaignId: string
): Promise<CanonCollectionRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const rows = await db
    .select()
    .from(canonCollections)
    .where(eq(canonCollections.campaignId, campaignId))
    .orderBy(asc(canonCollections.sortOrder), asc(canonCollections.createdAt));
  return rows.map(hydrateCollection);
}

export async function createCanonCollection(
  campaignId: string,
  input: CanonCollectionInput
): Promise<string> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const [row] = await db
    .insert(canonCollections)
    .values({
      campaignId,
      title: input.title.trim(),
      blurb: (input.blurb ?? '').trim(),
      icon: shelfGlyphOr('books', input.icon),
      imageId: input.imageId ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning({ id: canonCollections.id });
  return row.id;
}

export async function updateCanonCollection(
  collectionId: string,
  patch: Partial<CanonCollectionInput>
): Promise<void> {
  const row = await db.query.canonCollections.findFirst({
    where: eq(canonCollections.id, collectionId),
  });
  if (!row) throw new Error('NOT_FOUND');
  await requireCampaignRole(row.campaignId, ['gm', 'co-gm']);

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.blurb !== undefined) set.blurb = patch.blurb.trim();
  if (patch.icon !== undefined) set.icon = shelfGlyphOr('books', patch.icon);
  if (patch.imageId !== undefined) set.imageId = patch.imageId;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  await db
    .update(canonCollections)
    .set(set)
    .where(eq(canonCollections.id, collectionId));
}

/**
 * Remove a shelf. Its entries survive as loose entries — deleting the Bestiary
 * must never quietly delete every monster the party has met.
 */
export async function deleteCanonCollection(
  collectionId: string
): Promise<void> {
  const row = await db.query.canonCollections.findFirst({
    where: eq(canonCollections.id, collectionId),
  });
  if (!row) throw new Error('NOT_FOUND');
  await requireCampaignRole(row.campaignId, ['gm', 'co-gm']);

  await db
    .update(canonEntries)
    .set({ collectionId: null })
    .where(eq(canonEntries.collectionId, collectionId));
  await db
    .delete(canonCollections)
    .where(eq(canonCollections.id, collectionId));
}

export async function deleteCanonEntry(entryId: string): Promise<void> {
  const { entry } = await requireStaffForEntry(entryId);
  // canon_links, canon_reveals and party notes cascade on the FK; whatever
  // was in this place is set loose, not deleted (0072).
  await db.delete(canonEntries).where(eq(canonEntries.id, entryId));
  bumpVersion(entry.campaignId);
}

export async function setCanonVisibility(
  entryId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  const { entry } = await requireStaffForEntry(entryId);
  await db
    .update(canonEntries)
    .set({ visibility, updatedAt: new Date().toISOString() })
    .where(eq(canonEntries.id, entryId));
  bumpVersion(entry.campaignId);
}

/* --- party notes (0072) ---------------------------------------------------- */

/**
 * An entry this viewer may read: staff any, a player one that is shared or
 * was shown to them. A note on something the party has not been told about
 * would be a note on nothing.
 */
async function readableEntry(entryId: string) {
  const entry = await db.query.canonEntries.findFirst({
    where: eq(canonEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const { userId, role } = await requireCampaignRole(entry.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const staff = isStaffRole(role);
  if (!staff && entry.visibility !== 'shared') {
    const told = await db.query.canonReveals.findFirst({
      where: and(
        eq(canonReveals.entryId, entryId),
        eq(canonReveals.userId, userId)
      ),
    });
    if (!told) throw new Error('NOT_FOUND');
  }
  return { entry, userId, staff };
}

export const MAX_PARTY_NOTE = 1000;

/** Write down what the party knows about an NPC or a place, signed. */
export async function addPartyNote(
  entryId: string,
  body: string
): Promise<string> {
  const { entry, userId } = await readableEntry(entryId);
  const text = body.trim().slice(0, MAX_PARTY_NOTE);
  if (!text) throw new Error('EMPTY_NOTE');
  const [row] = await db
    .insert(canonPartyNotes)
    .values({ campaignId: entry.campaignId, entryId, userId, body: text })
    .returning({ id: canonPartyNotes.id });
  bumpVersion(entry.campaignId);
  return row.id;
}

/** A note its author may change; staff may only take one down. */
async function noteFor(noteId: string) {
  const note = await db.query.canonPartyNotes.findFirst({
    where: eq(canonPartyNotes.id, noteId),
  });
  if (!note) throw new Error('NOT_FOUND');
  const ctx = await readableEntry(note.entryId);
  return { note, ...ctx };
}

export async function updatePartyNote(
  noteId: string,
  body: string
): Promise<void> {
  const { note, userId, entry } = await noteFor(noteId);
  // Nobody rewrites somebody else's words, the DM included.
  if (note.userId !== userId) throw new Error('FORBIDDEN');
  const text = body.trim().slice(0, MAX_PARTY_NOTE);
  if (!text) throw new Error('EMPTY_NOTE');
  await db
    .update(canonPartyNotes)
    .set({ body: text, updatedAt: new Date().toISOString() })
    .where(eq(canonPartyNotes.id, noteId));
  bumpVersion(entry.campaignId);
}

export async function deletePartyNote(noteId: string): Promise<void> {
  const { note, userId, staff, entry } = await noteFor(noteId);
  if (note.userId !== userId && !staff) throw new Error('FORBIDDEN');
  await db.delete(canonPartyNotes).where(eq(canonPartyNotes.id, noteId));
  bumpVersion(entry.campaignId);
}

export async function linkCanon(
  fromEntryId: string,
  toEntryId: string
): Promise<void> {
  if (fromEntryId === toEntryId) throw new Error('CANNOT_LINK_SELF');
  const { entry } = await requireStaffForEntry(fromEntryId);
  const target = await db.query.canonEntries.findFirst({
    where: eq(canonEntries.id, toEntryId),
  });
  if (!target || target.campaignId !== entry.campaignId) {
    throw new Error('NOT_FOUND');
  }
  const existing = await db.query.canonLinks.findFirst({
    where: and(
      eq(canonLinks.fromEntryId, fromEntryId),
      eq(canonLinks.toEntryId, toEntryId)
    ),
  });
  if (existing) return;
  await db.insert(canonLinks).values({
    campaignId: entry.campaignId,
    fromEntryId,
    toEntryId,
  });
}

export async function unlinkCanon(
  fromEntryId: string,
  toEntryId: string
): Promise<void> {
  await requireStaffForEntry(fromEntryId);
  await db
    .delete(canonLinks)
    .where(
      and(
        eq(canonLinks.fromEntryId, fromEntryId),
        eq(canonLinks.toEntryId, toEntryId)
      )
    );
}

/** Reveal one entry's party text to one campaign member (or the DM). */
export async function revealCanonTo(
  entryId: string,
  targetUserId: string
): Promise<void> {
  const { entry } = await requireStaffForEntry(entryId);

  // The target must belong to the campaign — as GM or as a member row.
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, entry.campaignId),
  });
  const isGm = campaign?.gmId === targetUserId;
  const member = isGm
    ? true
    : await db.query.campaignMembers.findFirst({
        where: and(
          eq(campaignMembers.campaignId, entry.campaignId),
          eq(campaignMembers.userId, targetUserId)
        ),
      });
  if (!member) throw new Error('NOT_A_MEMBER');

  const existing = await db.query.canonReveals.findFirst({
    where: and(
      eq(canonReveals.entryId, entryId),
      eq(canonReveals.userId, targetUserId)
    ),
  });
  if (existing) return;
  await db.insert(canonReveals).values({ entryId, userId: targetUserId });
}

export async function unrevealCanonTo(
  entryId: string,
  targetUserId: string
): Promise<void> {
  await requireStaffForEntry(entryId);
  await db
    .delete(canonReveals)
    .where(
      and(
        eq(canonReveals.entryId, entryId),
        eq(canonReveals.userId, targetUserId)
      )
    );
}
