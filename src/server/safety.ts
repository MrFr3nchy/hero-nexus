import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignSafety,
  campaignSessions,
  campaignTimers,
  sessionFeedbackForms,
} from '@/db/schema';
import {
  SAFETY_TEXT_MAX,
  SESSION_ZERO_QUESTIONS,
  SESSION_ZERO_TITLE,
  type SafetyKind,
  type SafetyRow,
} from '@/@creator/campaign/lib/safety';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { rateLimit } from './rate-limit';
import { saveFeedbackForm } from './session-feedback';

/**
 * Session zero and the safety tools.
 *
 * **Anonymity is enforced by storage.** A player's line or veil, and an
 * X-card tap, store no user id anywhere: not a column, not an event's `by`,
 * not a log line. Nothing in this module writes the caller's id or name
 * into anything that outlives the request, and nothing logs it. The one
 * place it is held is the rate limiter's in-memory key, which is never
 * written down and expires in a minute.
 */

function isStaffRole(role: string): boolean {
  return role === 'gm' || role === 'co-gm';
}

/* --- lines and veils ---------------------------------------------------- */

/** The table's lines and veils. Any member reads them. */
export async function listSafety(campaignId: string): Promise<SafetyRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const rows = await db
    .select()
    .from(campaignSafety)
    .where(eq(campaignSafety.campaignId, campaignId))
    .orderBy(asc(campaignSafety.createdAt));
  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    text: r.text,
    source: r.source,
    createdAt: r.createdAt,
  }));
}

/**
 * Add a line or a veil. Staff and players alike; a player's is anonymous
 * because only `source` is written. Rate-limited per person in memory, so a
 * table cannot be flooded, without that limit becoming a record.
 */
export async function addSafety(
  campaignId: string,
  input: { kind: SafetyKind; text: string }
): Promise<void> {
  const { userId, role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const text = input.text.trim().slice(0, SAFETY_TEXT_MAX);
  if (!text) throw new Error('EMPTY');
  if (input.kind !== 'line' && input.kind !== 'veil') {
    throw new Error('BAD_KIND');
  }
  if (!rateLimit(`safety-add:${campaignId}:${userId}`, 20, 60_000).ok) {
    throw new Error('RATE_LIMITED');
  }
  await db.insert(campaignSafety).values({
    campaignId,
    kind: input.kind,
    text,
    source: isStaffRole(role) ? 'staff' : 'player',
  });
}

/** Staff take any line or veil down. Nobody else can: nobody else is named. */
export async function deleteSafety(
  campaignId: string,
  id: string
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await db
    .delete(campaignSafety)
    .where(
      and(eq(campaignSafety.id, id), eq(campaignSafety.campaignId, campaignId))
    );
}

/* --- the X-card ---------------------------------------------------------- */

/**
 * Tap the X-card: tell staff to pause and check in, without saying who.
 *
 * Holds every running countdown — the hourglass should not run out on a
 * table that has stopped to talk — and announces to staff with `by: null`.
 * No row records the tap. The countdowns are a durable change, so the
 * version is bumped when there were any.
 */
export async function tapXCard(
  campaignId: string
): Promise<{ pausedTimers: number }> {
  const { userId } = await requireCampaignRole(campaignId, ['player']);
  if (!rateLimit(`xcard:${campaignId}:${userId}`, 3, 60_000).ok) {
    throw new Error('RATE_LIMITED');
  }

  const now = new Date().toISOString();
  const held = await db
    .update(campaignTimers)
    .set({ pausedAt: now })
    .where(
      and(
        eq(campaignTimers.campaignId, campaignId),
        isNull(campaignTimers.stoppedAt),
        isNull(campaignTimers.pausedAt)
      )
    )
    .returning({ id: campaignTimers.id, endsAt: campaignTimers.endsAt });
  // One that had already run out was not running; give it back as it was.
  const spent = held.filter(t => t.endsAt <= now);
  for (const t of spent) {
    await db
      .update(campaignTimers)
      .set({ pausedAt: null })
      .where(eq(campaignTimers.id, t.id));
  }
  const pausedTimers = held.length - spent.length;
  if (pausedTimers > 0) bumpVersion(campaignId);

  publish(
    campaignId,
    { kind: 'safety', id: randomUUID(), at: now, by: null, pausedTimers },
    'staff'
  );
  return { pausedTimers };
}

/* --- session zero --------------------------------------------------------- */

/** The campaign's session zero, if it has one. */
export async function sessionZero(
  campaignId: string
): Promise<{ id: string; status: string } | null> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const row = await db.query.campaignSessions.findFirst({
    columns: { id: true, status: true },
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.number, 0)
    ),
  });
  return row ?? null;
}

/**
 * Put session zero on the books: an ordinary session numbered 0, with a
 * feedback form seeded with the session-zero questions rather than the
 * usual after-the-night ones. Answers carry a name, which is right for
 * expectations — and why lines and veils are not asked here.
 *
 * Idempotent: a second press returns the one that exists, and gives it the
 * questionnaire if it somehow has none.
 */
export async function planSessionZero(campaignId: string): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const existing = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.number, 0)
    ),
  });
  const id =
    existing?.id ??
    (
      await db
        .insert(campaignSessions)
        .values({
          campaignId,
          number: 0,
          title: SESSION_ZERO_TITLE,
          status: 'planned',
          createdBy: userId,
        })
        .returning({ id: campaignSessions.id })
    )[0].id;

  const form = await db.query.sessionFeedbackForms.findFirst({
    columns: { id: true },
    where: eq(sessionFeedbackForms.sessionId, id),
  });
  if (!form) {
    await saveFeedbackForm(
      id,
      SESSION_ZERO_QUESTIONS.map((q, i) => ({ ...q, id: `zero-${i + 1}` }))
    );
  }
  bumpVersion(campaignId);
  return id;
}
