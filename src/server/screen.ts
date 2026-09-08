import 'server-only';

import { and, eq } from 'drizzle-orm';

import {
  normalizeLayout,
  type ScreenLayout,
} from '@/@creator/campaign/lib/screen';
import { db } from '@/db';
import { campaignScreenLayouts } from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';

export interface ScreenState {
  role: CampaignRole;
  layout: ScreenLayout;
}

/**
 * The screen this person has at this table.
 *
 * The stored blob is run through `normalizeLayout` on the way out, so a panel
 * this build no longer has, a duplicate, or one a demoted co-DM may no longer
 * see is dropped rather than drawn. Nothing has ever been arranged is a normal
 * state and yields the default screen for the role.
 */
export async function getScreen(campaignId: string): Promise<ScreenState> {
  const { userId, role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  const row = await db.query.campaignScreenLayouts.findFirst({
    where: and(
      eq(campaignScreenLayouts.campaignId, campaignId),
      eq(campaignScreenLayouts.userId, userId)
    ),
  });

  return { role, layout: normalizeLayout(row?.layout, isStaff) };
}

/**
 * Keep this person's arrangement.
 *
 * Normalised on the way in as well as out: the client is never trusted to say
 * which panels exist, and a player posting the DM's notebook key gets it
 * dropped here rather than stored and filtered later.
 */
export async function saveScreen(
  campaignId: string,
  layout: unknown
): Promise<ScreenLayout> {
  const { userId, role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  const clean = normalizeLayout(layout, isStaff);

  const existing = await db.query.campaignScreenLayouts.findFirst({
    where: and(
      eq(campaignScreenLayouts.campaignId, campaignId),
      eq(campaignScreenLayouts.userId, userId)
    ),
  });

  if (existing) {
    await db
      .update(campaignScreenLayouts)
      .set({ layout: clean, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(campaignScreenLayouts.campaignId, campaignId),
          eq(campaignScreenLayouts.userId, userId)
        )
      );
  } else {
    await db
      .insert(campaignScreenLayouts)
      .values({ campaignId, userId, layout: clean });
  }

  return clean;
}
