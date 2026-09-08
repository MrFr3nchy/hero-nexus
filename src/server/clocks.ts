import 'server-only';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { campaignClocks } from '@/db/schema';
import { normalizeSegments } from '@/@creator/campaign/lib/clocks';
import { requireCampaignRole, type CampaignRole } from './campaigns';

export {
  CLOCK_SEGMENTS,
  normalizeSegments,
  type ClockSegments,
} from '@/@creator/campaign/lib/clocks';

export interface ClockRow {
  id: string;
  title: string;
  /** Null for a player — what happens at the last segment never travels. */
  dmNote: string | null;
  segments: number;
  filled: number;
  visibility: 'dm' | 'shared';
  status: 'running' | 'done';
  sortOrder: number;
}

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

async function staffForClock(clockId: string) {
  const clock = await db.query.campaignClocks.findFirst({
    where: eq(campaignClocks.id, clockId),
  });
  if (!clock) throw new Error('NOT_FOUND');
  await staff(clock.campaignId);
  return clock;
}

/**
 * The clocks a viewer may see.
 *
 * A player receives shared clocks, with the note stripped: they get to watch
 * the ritual reach five-eighths and not to read what happens at eight. A
 * DM-only clock does not reach them at all — knowing that a hidden clock
 * exists is itself information about the plot.
 */
export async function listClocks(campaignId: string): Promise<ClockRow[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);

  const rows = await db
    .select()
    .from(campaignClocks)
    .where(eq(campaignClocks.campaignId, campaignId))
    .orderBy(asc(campaignClocks.sortOrder), asc(campaignClocks.createdAt));

  return rows
    .filter(c => isStaff || c.visibility === 'shared')
    .map(c => ({
      id: c.id,
      title: c.title,
      dmNote: isStaff ? c.dmNote : null,
      segments: c.segments,
      filled: c.filled,
      visibility: c.visibility,
      status: c.status,
      sortOrder: c.sortOrder,
    }));
}

export interface ClockInput {
  title: string;
  dmNote?: string;
  segments?: number;
  visibility?: 'dm' | 'shared';
}

export async function createClock(
  campaignId: string,
  input: ClockInput
): Promise<string> {
  const { userId } = await staff(campaignId);
  const existing = await db
    .select({ sortOrder: campaignClocks.sortOrder })
    .from(campaignClocks)
    .where(eq(campaignClocks.campaignId, campaignId));
  const next = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

  const [row] = await db
    .insert(campaignClocks)
    .values({
      campaignId,
      title: input.title.trim(),
      dmNote: input.dmNote ?? '',
      segments: normalizeSegments(input.segments),
      visibility: input.visibility ?? 'dm',
      sortOrder: next,
      createdBy: userId,
    })
    .returning({ id: campaignClocks.id });
  return row.id;
}

export async function updateClock(
  clockId: string,
  patch: Partial<ClockInput>
): Promise<void> {
  const clock = await staffForClock(clockId);
  const set: Partial<typeof campaignClocks.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.dmNote !== undefined) set.dmNote = patch.dmNote;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.segments !== undefined) {
    const segments = normalizeSegments(patch.segments);
    const filled = Math.min(clock.filled, segments);
    set.segments = segments;
    // Shrinking a clock past where it already stands would leave it reading
    // 8/6. The hand does not go backwards on its own, so it stops at the end.
    set.filled = filled;
    // And the status follows the hand. Resizing 7/8 down to four segments
    // fills the face, and a full face that still says "running" is a clock
    // that went off without anybody being told.
    set.status = filled >= segments ? 'done' : 'running';
  }

  await db
    .update(campaignClocks)
    .set(set)
    .where(eq(campaignClocks.id, clockId));
}

/**
 * Move the hand.
 *
 * A delta rather than a total, so two co-DMs ticking at once advance it twice
 * instead of one of them winning — the same reason hit points are a delta.
 * Reaching the last segment marks it done, and a clock wound back off its last
 * segment is running again: a DM correcting a mis-tick has not made the ritual
 * un-happen, they have said it never happened.
 */
export async function tickClock(
  clockId: string,
  delta: number
): Promise<ClockRow> {
  const clock = await staffForClock(clockId);
  const filled = Math.max(
    0,
    Math.min(clock.segments, clock.filled + Math.trunc(delta))
  );
  const status = filled >= clock.segments ? 'done' : 'running';

  await db
    .update(campaignClocks)
    .set({ filled, status, updatedAt: new Date().toISOString() })
    .where(eq(campaignClocks.id, clockId));

  return {
    id: clock.id,
    title: clock.title,
    dmNote: clock.dmNote,
    segments: clock.segments,
    filled,
    visibility: clock.visibility,
    status,
    sortOrder: clock.sortOrder,
  };
}

export async function deleteClock(clockId: string): Promise<void> {
  await staffForClock(clockId);
  await db.delete(campaignClocks).where(eq(campaignClocks.id, clockId));
}
