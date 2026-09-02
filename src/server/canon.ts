import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  canonEntries,
  canonLinks,
  canonReveals,
  campaignMembers,
  campaigns,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import type {
  CanonEntryRow,
  CanonInput,
  CanonKind,
} from '@/@creator/campaign/lib/canon';

export {
  CANON_KINDS,
  CANON_KIND_LABELS,
  type CanonEntryRow,
  type CanonInput,
  type CanonKind,
  type CanonLinkRef,
  type CanonVisibility,
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
    };
  });
}

export async function createCanonEntry(
  campaignId: string,
  input: CanonInput
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const [row] = await db
    .insert(canonEntries)
    .values({
      campaignId,
      kind: input.kind,
      title: input.title.trim(),
      dmBody: input.dmBody,
      partyBody: input.partyBody,
      visibility: input.visibility ?? 'dm',
      createdBy: userId,
    })
    .returning({ id: canonEntries.id });
  return row.id;
}

export async function updateCanonEntry(
  entryId: string,
  patch: Partial<CanonInput>
): Promise<void> {
  await requireStaffForEntry(entryId);
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.dmBody !== undefined) set.dmBody = patch.dmBody;
  if (patch.partyBody !== undefined) set.partyBody = patch.partyBody;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  await db.update(canonEntries).set(set).where(eq(canonEntries.id, entryId));
}

export async function deleteCanonEntry(entryId: string): Promise<void> {
  await requireStaffForEntry(entryId);
  // canon_links and canon_reveals cascade on the FK.
  await db.delete(canonEntries).where(eq(canonEntries.id, entryId));
}

export async function setCanonVisibility(
  entryId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  await requireStaffForEntry(entryId);
  await db
    .update(canonEntries)
    .set({ visibility, updatedAt: new Date().toISOString() })
    .where(eq(canonEntries.id, entryId));
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
