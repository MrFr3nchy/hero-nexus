import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/db';
import {
  campaignMembers,
  campaigns,
  homebrew,
  homebrewApprovals,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ApprovalRow {
  id: string;
  campaignId: string;
  campaignName: string;
  homebrewId: string;
  homebrewName: string;
  homebrewType: 'class' | 'spell' | 'item';
  homebrewDescription: string;
  homebrewData: unknown;
  requestedByUserId: string;
  requestedByName: string | null;
  status: ApprovalStatus;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error('NOT_AUTHENTICATED');
  return id;
}

async function isMember(campaignId: string, userId: string): Promise<boolean> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) return false;
  if (campaign.gmId === userId) return true;
  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  return Boolean(member);
}

/** A player submits one of their homebrew items to a campaign for review. */
export async function requestApproval(
  homebrewId: string,
  campaignId: string
): Promise<void> {
  const userId = await requireUserId();

  const item = await db.query.homebrew.findFirst({
    where: eq(homebrew.id, homebrewId),
  });
  if (!item || item.ownerId !== userId) throw new Error('NOT_YOUR_HOMEBREW');
  if (!(await isMember(campaignId, userId))) throw new Error('NOT_A_MEMBER');

  const existing = await db.query.homebrewApprovals.findFirst({
    where: and(
      eq(homebrewApprovals.homebrewId, homebrewId),
      eq(homebrewApprovals.campaignId, campaignId)
    ),
  });

  if (existing) {
    if (existing.status === 'pending') return;
    // Resubmit after a decision — reset to pending.
    await db
      .update(homebrewApprovals)
      .set({
        status: 'pending',
        reviewNotes: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: new Date().toISOString(),
      })
      .where(eq(homebrewApprovals.id, existing.id));
    return;
  }

  await db.insert(homebrewApprovals).values({
    campaignId,
    homebrewId,
    requestedByUserId: userId,
  });
}

const approvalColumns = {
  id: homebrewApprovals.id,
  campaignId: homebrewApprovals.campaignId,
  campaignName: campaigns.name,
  homebrewId: homebrewApprovals.homebrewId,
  homebrewName: homebrew.name,
  homebrewType: homebrew.type,
  homebrewDescription: homebrew.description,
  homebrewData: homebrew.data,
  requestedByUserId: homebrewApprovals.requestedByUserId,
  requestedByName: users.name,
  status: homebrewApprovals.status,
  reviewNotes: homebrewApprovals.reviewNotes,
  createdAt: homebrewApprovals.createdAt,
  reviewedAt: homebrewApprovals.reviewedAt,
};

/** GM / co-GM: every approval request for a campaign. */
export async function listApprovals(
  campaignId: string
): Promise<ApprovalRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  return db
    .select(approvalColumns)
    .from(homebrewApprovals)
    .innerJoin(homebrew, eq(homebrew.id, homebrewApprovals.homebrewId))
    .innerJoin(campaigns, eq(campaigns.id, homebrewApprovals.campaignId))
    .innerJoin(users, eq(users.id, homebrewApprovals.requestedByUserId))
    .where(eq(homebrewApprovals.campaignId, campaignId))
    .orderBy(desc(homebrewApprovals.createdAt)) as Promise<ApprovalRow[]>;
}

/** The current user's own submissions, across all campaigns. */
export async function listMyApprovals(): Promise<ApprovalRow[]> {
  const userId = await requireUserId();
  return db
    .select(approvalColumns)
    .from(homebrewApprovals)
    .innerJoin(homebrew, eq(homebrew.id, homebrewApprovals.homebrewId))
    .innerJoin(campaigns, eq(campaigns.id, homebrewApprovals.campaignId))
    .innerJoin(users, eq(users.id, homebrewApprovals.requestedByUserId))
    .where(eq(homebrewApprovals.requestedByUserId, userId))
    .orderBy(desc(homebrewApprovals.createdAt)) as Promise<ApprovalRow[]>;
}

export async function reviewApproval(
  approvalId: string,
  status: 'approved' | 'denied',
  notes: string
): Promise<void> {
  const approval = await db.query.homebrewApprovals.findFirst({
    where: eq(homebrewApprovals.id, approvalId),
  });
  if (!approval) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(approval.campaignId, [
    'gm',
    'co-gm',
  ]);

  if (status === 'denied' && !notes.trim()) {
    throw new Error('DENY_NEEDS_NOTE');
  }

  await db
    .update(homebrewApprovals)
    .set({
      status,
      reviewNotes: notes.trim() || null,
      reviewedByUserId: userId,
      reviewedAt: new Date().toISOString(),
    })
    .where(eq(homebrewApprovals.id, approvalId));
}
