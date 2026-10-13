import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { campaignTimers } from '@/db/schema';
import { requireCampaignRole } from '../campaigns';

import { bumpVersion, publish } from '../live-hub';

/**
 * Countdowns running at the table.
 */
/**
 * Start a countdown. Staff only.
 *
 * `seconds` becomes an instant here rather than being stored as a duration, so
 * every viewer counts down to the same moment and a slow response cannot make
 * the clock wrong.
 */
export async function startTimer(
  campaignId: string,
  input: { label: string; seconds: number; visibility?: 'dm' | 'shared' }
): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const seconds = Math.max(
    1,
    Math.min(24 * 60 * 60, Math.trunc(input.seconds))
  );
  const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
  await db.insert(campaignTimers).values({
    campaignId,
    label: input.label.trim().slice(0, 120),
    endsAt,
    visibility: input.visibility ?? 'shared',
    createdBy: userId,
  });
  bumpVersion(campaignId);

  const visibility = input.visibility ?? 'shared';
  publish(
    campaignId,
    {
      kind: 'timer',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      label: input.label.trim().slice(0, 120),
      endsAt,
      secret: visibility === 'dm',
    },
    visibility === 'dm' ? 'staff' : 'everyone'
  );
}

/**
 * Call one off. The row stays with `stoppedAt` set: a countdown that was
 * stopped is a thing that happened, and deleting it would say it never ran.
 */
export async function stopTimer(
  campaignId: string,
  timerId: string
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await db
    .update(campaignTimers)
    .set({ stoppedAt: new Date().toISOString() })
    .where(
      and(
        eq(campaignTimers.id, timerId),
        eq(campaignTimers.campaignId, campaignId)
      )
    );
  bumpVersion(campaignId);
}

/**
 * Let the sand fall again after an X-card tap held it. Every held countdown
 * at the table resumes with the time it had left: `endsAt` moves on by
 * however long it was paused.
 */
export async function resumeTimers(campaignId: string): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const now = Date.now();
  const held = await db
    .select()
    .from(campaignTimers)
    .where(
      and(
        eq(campaignTimers.campaignId, campaignId),
        isNull(campaignTimers.stoppedAt),
        isNotNull(campaignTimers.pausedAt)
      )
    );
  for (const t of held) {
    const pausedFor = Math.max(0, now - Date.parse(t.pausedAt!));
    await db
      .update(campaignTimers)
      .set({
        pausedAt: null,
        endsAt: new Date(Date.parse(t.endsAt) + pausedFor).toISOString(),
      })
      .where(eq(campaignTimers.id, t.id));
  }
  if (held.length > 0) bumpVersion(campaignId);
}
