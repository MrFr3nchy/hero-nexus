import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { campaignSessions, playerJournals, users } from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';

export type JournalVisibility = 'private' | 'dm' | 'party';

export interface JournalRow {
  id: string;
  title: string;
  body: string;
  visibility: JournalVisibility;
  sessionId: string | null;
  /** Null on your own pages — the byline is for somebody else's. */
  authorName: string | null;
  /** True when the viewer wrote it, and may therefore edit it. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
}

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

/**
 * The journal pages a viewer may read.
 *
 * Everyone reads their own pages and the party-visible ones. Staff additionally
 * read pages a player addressed to them.
 *
 * **Staff do not read a player's private pages**, and this is the filter that
 * makes the feature worth having. It is enforced here rather than in the
 * component, because a private page reaching a DM's browser at all — even
 * unrendered — has already broken the promise.
 */
export async function listJournals(campaignId: string): Promise<JournalRow[]> {
  const { userId, role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);

  const rows = await db
    .select({ journal: playerJournals, authorName: users.name })
    .from(playerJournals)
    .leftJoin(users, eq(users.id, playerJournals.userId))
    .where(eq(playerJournals.campaignId, campaignId))
    .orderBy(desc(playerJournals.updatedAt));

  return rows
    .filter(({ journal }) => {
      if (journal.userId === userId) return true;
      if (journal.visibility === 'party') return true;
      if (journal.visibility === 'dm' && isStaff) return true;
      return false;
    })
    .map(({ journal, authorName }) => ({
      id: journal.id,
      title: journal.title,
      body: journal.body,
      visibility: journal.visibility,
      sessionId: journal.sessionId,
      authorName: journal.userId === userId ? null : authorName,
      mine: journal.userId === userId,
      createdAt: journal.createdAt,
      updatedAt: journal.updatedAt,
    }));
}

export interface JournalInput {
  title: string;
  body?: string;
  visibility?: JournalVisibility;
  sessionId?: string | null;
}

/**
 * A page is the author's, full stop.
 *
 * Not "the author or staff": a DM who can edit or delete a player's journal
 * page can also read it, and the whole feature rests on them not being able
 * to. A DM who needs something gone deletes the campaign.
 */
async function mineOrThrow(journalId: string, userId: string) {
  const journal = await db.query.playerJournals.findFirst({
    where: eq(playerJournals.id, journalId),
  });
  if (!journal) throw new Error('NOT_FOUND');
  if (journal.userId !== userId) throw new Error('FORBIDDEN');
  return journal;
}

async function checkSession(
  campaignId: string,
  sessionId: string | null | undefined
): Promise<string | null> {
  if (!sessionId) return null;
  const row = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.id, sessionId),
      eq(campaignSessions.campaignId, campaignId)
    ),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row.id;
}

export async function createJournal(
  campaignId: string,
  input: JournalInput
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);

  const [row] = await db
    .insert(playerJournals)
    .values({
      campaignId,
      userId,
      title: input.title.trim(),
      body: input.body ?? '',
      visibility: input.visibility ?? 'private',
      sessionId: await checkSession(campaignId, input.sessionId),
    })
    .returning({ id: playerJournals.id });
  return row.id;
}

export async function updateJournal(
  campaignId: string,
  journalId: string,
  patch: Partial<JournalInput>
): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  await mineOrThrow(journalId, userId);

  const set: Partial<typeof playerJournals.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.sessionId !== undefined) {
    set.sessionId = await checkSession(campaignId, patch.sessionId);
  }

  await db
    .update(playerJournals)
    .set(set)
    .where(eq(playerJournals.id, journalId));
}

export async function deleteJournal(
  campaignId: string,
  journalId: string
): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  await mineOrThrow(journalId, userId);
  await db.delete(playerJournals).where(eq(playerJournals.id, journalId));
}
