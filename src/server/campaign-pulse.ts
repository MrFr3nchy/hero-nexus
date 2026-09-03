import 'server-only';

import { and, asc, count, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignQuests,
  campaignSessions,
  downtimeActions,
  downtimePeriods,
  homebrewApprovals,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';

/**
 * The state of a table in one call.
 *
 * Everything here is a number the campaign page needs before a tab is opened:
 * the ledger line under the title, and the "this wants your attention" marks
 * on the tabs. A DM should be able to see that three homebrew submissions and
 * two downtime actions are waiting without clicking through six tabs to find
 * out, and a player should see that a recap is waiting to be read.
 */
export interface CampaignPulse {
  sessionsPlayed: number;
  /** The next planned sitting, if there is one. */
  next: {
    id: string;
    number: number;
    title: string;
    date: string | null;
  } | null;
  questsInHand: number;
  /** Homebrew submissions awaiting a decision. Staff-facing. */
  pendingApprovals: number;
  /** Downtime actions submitted and not yet resolved. Staff-facing. */
  openDowntime: number;
  /** Recaps written but not yet handed to the party. Staff-facing. */
  unsentRecaps: number;
}

export async function getCampaignPulse(
  campaignId: string
): Promise<CampaignPulse> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  const sessions = await db
    .select()
    .from(campaignSessions)
    .where(eq(campaignSessions.campaignId, campaignId))
    .orderBy(asc(campaignSessions.number));

  const next = sessions.find(s => s.status === 'planned') ?? null;

  const quests = await db
    .select({ n: count() })
    .from(campaignQuests)
    .where(
      isStaff
        ? and(
            eq(campaignQuests.campaignId, campaignId),
            eq(campaignQuests.status, 'active')
          )
        : and(
            eq(campaignQuests.campaignId, campaignId),
            eq(campaignQuests.status, 'active'),
            eq(campaignQuests.visibility, 'shared')
          )
    );

  const base: CampaignPulse = {
    sessionsPlayed: sessions.filter(s => s.status === 'played').length,
    next: next
      ? {
          id: next.id,
          number: next.number,
          title: next.title,
          date: next.scheduledFor,
        }
      : null,
    questsInHand: quests[0]?.n ?? 0,
    pendingApprovals: 0,
    openDowntime: 0,
    unsentRecaps: 0,
  };

  if (!isStaff) return base;

  const [approvals, downtime] = await Promise.all([
    db
      .select({ n: count() })
      .from(homebrewApprovals)
      .where(
        and(
          eq(homebrewApprovals.campaignId, campaignId),
          eq(homebrewApprovals.status, 'pending')
        )
      ),
    db
      .select({ n: count() })
      .from(downtimeActions)
      .innerJoin(
        downtimePeriods,
        eq(downtimePeriods.id, downtimeActions.periodId)
      )
      .where(
        and(
          eq(downtimePeriods.campaignId, campaignId),
          eq(downtimeActions.status, 'submitted')
        )
      ),
  ]);

  return {
    ...base,
    pendingApprovals: approvals[0]?.n ?? 0,
    openDowntime: downtime[0]?.n ?? 0,
    unsentRecaps: sessions.filter(
      s => s.recapVisibility === 'dm' && s.recapBody.trim().length > 0
    ).length,
  };
}
