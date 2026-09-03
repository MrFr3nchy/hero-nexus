import 'server-only';

import { desc, eq, inArray } from 'drizzle-orm';

import { requireUserId } from './session-user';
import { db } from '@/db';
import {
  characterHistory,
  characters,
  downtimeActions,
  downtimePeriods,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import type {
  DowntimeActionInput,
  DowntimePeriodInput,
  DowntimePeriodRow,
} from '@/@creator/campaign/lib/downtime';

export {
  DOWNTIME_KINDS,
  DOWNTIME_KIND_LABELS,
  type DowntimeActionInput,
  type DowntimeActionRow,
  type DowntimeActionStatus,
  type DowntimeKind,
  type DowntimePeriodInput,
  type DowntimePeriodRow,
  type DowntimePeriodStatus,
} from '@/@creator/campaign/lib/downtime';

/** Resolve an action's campaign and assert the caller is staff there. */
async function staffForAction(actionId: string): Promise<{
  action: typeof downtimeActions.$inferSelect;
  period: typeof downtimePeriods.$inferSelect;
  userId: string;
}> {
  const action = await db.query.downtimeActions.findFirst({
    where: eq(downtimeActions.id, actionId),
  });
  if (!action) throw new Error('NOT_FOUND');
  const period = await db.query.downtimePeriods.findFirst({
    where: eq(downtimePeriods.id, action.periodId),
  });
  if (!period) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(period.campaignId, [
    'gm',
    'co-gm',
  ]);
  return { action, period, userId };
}

async function staffForPeriod(periodId: string): Promise<{
  period: typeof downtimePeriods.$inferSelect;
  userId: string;
}> {
  const period = await db.query.downtimePeriods.findFirst({
    where: eq(downtimePeriods.id, periodId),
  });
  if (!period) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(period.campaignId, [
    'gm',
    'co-gm',
  ]);
  return { period, userId };
}

/**
 * Every downtime period for a campaign with its actions. Any member can read —
 * the log is shared on purpose ("everyone can see the log"). `mine` marks the
 * caller's own actions so the UI can offer edit / withdraw.
 */
export async function listDowntime(
  campaignId: string
): Promise<DowntimePeriodRow[]> {
  const { userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);

  const periods = await db
    .select()
    .from(downtimePeriods)
    .where(eq(downtimePeriods.campaignId, campaignId))
    .orderBy(desc(downtimePeriods.createdAt));
  if (periods.length === 0) return [];

  const periodIds = periods.map(p => p.id);
  const actions = await db
    .select({
      id: downtimeActions.id,
      periodId: downtimeActions.periodId,
      characterId: downtimeActions.characterId,
      characterName: characters.name,
      actorUserId: downtimeActions.actorUserId,
      actorName: users.name,
      kind: downtimeActions.kind,
      body: downtimeActions.body,
      dmResponse: downtimeActions.dmResponse,
      status: downtimeActions.status,
      resolvedByUserId: downtimeActions.resolvedByUserId,
      resolvedAt: downtimeActions.resolvedAt,
      createdAt: downtimeActions.createdAt,
      updatedAt: downtimeActions.updatedAt,
    })
    .from(downtimeActions)
    .leftJoin(characters, eq(characters.id, downtimeActions.characterId))
    .leftJoin(users, eq(users.id, downtimeActions.actorUserId))
    .where(inArray(downtimeActions.periodId, periodIds))
    .orderBy(desc(downtimeActions.createdAt));

  // Resolver names in one extra lookup.
  const resolverIds = [
    ...new Set(
      actions
        .map(a => a.resolvedByUserId)
        .filter((x): x is string => Boolean(x))
    ),
  ];
  const resolverName = new Map<string, string | null>();
  if (resolverIds.length) {
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, resolverIds));
    rows.forEach(r => resolverName.set(r.id, r.name));
  }

  return periods.map(p => ({
    id: p.id,
    campaignId: p.campaignId,
    label: p.label,
    opensAt: p.opensAt,
    closesAt: p.closesAt,
    status: p.status,
    createdAt: p.createdAt,
    actions: actions
      .filter(a => a.periodId === p.id)
      .map(a => ({
        id: a.id,
        periodId: a.periodId,
        characterId: a.characterId,
        characterName: a.characterName,
        actorUserId: a.actorUserId,
        actorName: a.actorName,
        kind: a.kind,
        body: a.body,
        dmResponse: a.dmResponse,
        status: a.status,
        resolvedByName: a.resolvedByUserId
          ? (resolverName.get(a.resolvedByUserId) ?? null)
          : null,
        resolvedAt: a.resolvedAt,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        mine: a.actorUserId === userId,
      })),
  }));
}

/* --- periods (staff) ------------------------------------------------- */

export async function openDowntimePeriod(
  campaignId: string,
  input: DowntimePeriodInput
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const [row] = await db
    .insert(downtimePeriods)
    .values({
      campaignId,
      label: input.label.trim(),
      opensAt: input.opensAt ?? null,
      closesAt: input.closesAt ?? null,
      createdBy: userId,
    })
    .returning({ id: downtimePeriods.id });
  return row.id;
}

export async function setDowntimePeriodStatus(
  periodId: string,
  status: 'open' | 'closed'
): Promise<void> {
  await staffForPeriod(periodId);
  await db
    .update(downtimePeriods)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(downtimePeriods.id, periodId));
}

export async function deleteDowntimePeriod(periodId: string): Promise<void> {
  await staffForPeriod(periodId);
  await db.delete(downtimePeriods).where(eq(downtimePeriods.id, periodId));
}

/* --- actions (players + staff) ------------------------------------- */

/** A member submits a downtime action against an open period. */
export async function submitDowntimeAction(
  periodId: string,
  input: DowntimeActionInput
): Promise<string> {
  const period = await db.query.downtimePeriods.findFirst({
    where: eq(downtimePeriods.id, periodId),
  });
  if (!period) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(period.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  if (period.status !== 'open') throw new Error('PERIOD_CLOSED');
  if (!input.body.trim()) throw new Error('BODY_REQUIRED');

  if (input.characterId) {
    const character = await db.query.characters.findFirst({
      where: eq(characters.id, input.characterId),
    });
    if (!character || character.ownerId !== userId) {
      throw new Error('NOT_YOUR_CHARACTER');
    }
  }

  const [row] = await db
    .insert(downtimeActions)
    .values({
      periodId,
      characterId: input.characterId,
      actorUserId: userId,
      kind: input.kind,
      body: input.body.trim(),
    })
    .returning({ id: downtimeActions.id });
  return row.id;
}

/**
 * The author edits their own action. Mirrors the approval resubmit: editing a
 * decided action drops it back to `submitted` and clears the DM's response.
 */
export async function updateDowntimeAction(
  actionId: string,
  input: Partial<DowntimeActionInput>
): Promise<void> {
  const userId = await requireUserId();
  const action = await db.query.downtimeActions.findFirst({
    where: eq(downtimeActions.id, actionId),
  });
  if (!action) throw new Error('NOT_FOUND');
  if (action.actorUserId !== userId) throw new Error('NOT_YOUR_ACTION');

  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.kind !== undefined) set.kind = input.kind;
  if (input.body !== undefined) {
    if (!input.body.trim()) throw new Error('BODY_REQUIRED');
    set.body = input.body.trim();
  }
  if (input.characterId !== undefined) {
    if (input.characterId) {
      const character = await db.query.characters.findFirst({
        where: eq(characters.id, input.characterId),
      });
      if (!character || character.ownerId !== userId) {
        throw new Error('NOT_YOUR_CHARACTER');
      }
    }
    set.characterId = input.characterId;
  }
  if (action.status !== 'submitted') {
    set.status = 'submitted';
    set.dmResponse = null;
    set.resolvedByUserId = null;
    set.resolvedAt = null;
  }

  await db
    .update(downtimeActions)
    .set(set)
    .where(eq(downtimeActions.id, actionId));
}

export async function withdrawDowntimeAction(actionId: string): Promise<void> {
  const userId = await requireUserId();
  const action = await db.query.downtimeActions.findFirst({
    where: eq(downtimeActions.id, actionId),
  });
  if (!action) throw new Error('NOT_FOUND');
  if (action.actorUserId !== userId) throw new Error('NOT_YOUR_ACTION');
  if (action.status !== 'submitted') throw new Error('ALREADY_RESOLVED');
  await db.delete(downtimeActions).where(eq(downtimeActions.id, actionId));
}

/**
 * The DM resolves or rejects an action with a written response. A rejection
 * with no explanation is refused (the DENY_NEEDS_NOTE rule from approvals).
 * A resolved action tied to a character is recorded in that character's
 * history, so a sheet-affecting downtime (bought armour, crafted an item) is
 * traceable next to every other change.
 */
export async function resolveDowntimeAction(
  actionId: string,
  status: 'resolved' | 'rejected',
  response: string
): Promise<void> {
  const { action, userId } = await staffForAction(actionId);
  if (!response.trim()) throw new Error('RESPONSE_REQUIRED');

  const now = new Date().toISOString();
  await db
    .update(downtimeActions)
    .set({
      status,
      dmResponse: response.trim(),
      resolvedByUserId: userId,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(eq(downtimeActions.id, actionId));

  if (status === 'resolved' && action.characterId) {
    await db.insert(characterHistory).values({
      characterId: action.characterId,
      actorUserId: userId,
      kind: 'downtime',
      field: `downtime.${action.id}`,
      fromValue: null,
      toValue: null,
      detail: `Downtime (${action.kind}): ${action.body} — ${response.trim()}`,
      occurredAt: now,
    });
  }
}
