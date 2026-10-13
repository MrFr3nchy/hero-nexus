import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignHandoutTargets,
  campaignHandouts,
  campaignMembers,
  campaigns,
} from '@/db/schema';
import { requireCampaignRole } from '../campaigns';

import { bumpVersion, publish } from '../live-hub';
import { staff } from './encounter';

/**
 * Handouts: what is passed across the table, and who may see it.
 */
export async function createNote(
  campaignId: string,
  title: string,
  body: string
): Promise<void> {
  const { userId } = await staff(campaignId);
  await db.insert(campaignHandouts).values({
    campaignId,
    kind: 'note',
    title: title.trim(),
    body,
    createdBy: userId,
  });
  bumpVersion(campaignId);
}

/** Called by the upload route handler after the file is written. */
export async function createImageHandout(
  campaignId: string,
  userId: string,
  filePath: string,
  mime: string,
  title: string
): Promise<void> {
  await db.insert(campaignHandouts).values({
    campaignId,
    kind: 'image',
    title: title.trim(),
    filePath,
    mime,
    createdBy: userId,
  });
  bumpVersion(campaignId);
}

async function handoutRow(handoutId: string) {
  const row = await db.query.campaignHandouts.findFirst({
    where: eq(campaignHandouts.id, handoutId),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row;
}

export async function setHandoutVisibility(
  handoutId: string,
  visibility: 'dm' | 'shared' | 'selected',
  targetUserIds: string[] = []
): Promise<void> {
  const row = await handoutRow(handoutId);
  const { userId } = await staff(row.campaignId);

  /*
   * Targets are resolved against the table before anything is written, the
   * same order `revealExcerpt` insists on: a handout addressed to somebody who
   * is not at this table would be a handout addressed to nobody, and finding
   * that out after the visibility flipped leaves the DM told it worked.
   */
  let targets: string[] = [];
  if (visibility === 'selected') {
    const members = await db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(eq(campaignMembers.campaignId, row.campaignId));
    const atTable = new Set(members.map(m => m.userId));
    const campaign = await db.query.campaigns.findFirst({
      columns: { gmId: true },
      where: eq(campaigns.id, row.campaignId),
    });
    if (campaign?.gmId) atTable.add(campaign.gmId);
    targets = [...new Set(targetUserIds)].filter(id => atTable.has(id));
    if (targets.length === 0) throw new Error('NOBODY_TO_SHOW');
  }

  await db
    .update(campaignHandouts)
    .set({ visibility })
    .where(eq(campaignHandouts.id, handoutId));

  // Rewritten wholesale rather than diffed: the target list is small, and
  // "who can see this now" is one answer, not a set of edits to it.
  await db
    .delete(campaignHandoutTargets)
    .where(eq(campaignHandoutTargets.handoutId, handoutId));
  if (targets.length > 0) {
    await db
      .insert(campaignHandoutTargets)
      .values(targets.map(id => ({ handoutId, userId: id })));
  }

  bumpVersion(row.campaignId);

  /*
   * Only the crossing announces, and only to the people it crossed to. A
   * handout is created behind the screen and lives there until the DM pushes
   * it, so the moment worth telling the table about is the push — not the
   * making, and not the taking back.
   */
  if (visibility === 'dm') return;
  publish(
    row.campaignId,
    {
      kind: 'handout',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      title: row.title,
      handoutKind: row.kind,
    },
    visibility === 'selected' ? { users: targets } : 'everyone'
  );
}

export async function deleteHandout(handoutId: string): Promise<string | null> {
  const row = await handoutRow(handoutId);
  await staff(row.campaignId);
  await db.delete(campaignHandouts).where(eq(campaignHandouts.id, handoutId));
  bumpVersion(row.campaignId);
  return row.filePath ?? null;
}

/** Used by the file-serving route to authorize a GET. */
export async function canViewHandout(
  handoutId: string
): Promise<
  { ok: true; row: Awaited<ReturnType<typeof handoutRow>> } | { ok: false }
> {
  const row = await handoutRow(handoutId);
  try {
    const { role, userId } = await requireCampaignRole(row.campaignId, [
      'gm',
      'co-gm',
      'player',
    ]);
    const isStaff = role === 'gm' || role === 'co-gm';
    if (isStaff) return { ok: true, row };
    if (row.visibility === 'shared') return { ok: true, row };
    // The file route authorises separately from the live view on purpose: a
    // player who guesses another handout's id must be refused the bytes, not
    // merely left without a link to them.
    if (row.visibility === 'selected') {
      const addressed = await db.query.campaignHandoutTargets.findFirst({
        where: and(
          eq(campaignHandoutTargets.handoutId, handoutId),
          eq(campaignHandoutTargets.userId, userId)
        ),
      });
      if (addressed) return { ok: true, row };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
