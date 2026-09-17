import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { describeMinutes, restMinutes } from '@/@creator/campaign/lib/calendar';
import {
  normalizeRestAnswers,
  type RestAnswers,
  type RestKind,
} from '@/@creator/campaign/lib/rests';
import { db } from '@/db';
import { campaignMembers, campaignRests } from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { applyRestUnchecked, spendHitDice, type HitDiceResult } from './play';
import { readWorldClock, advanceTimeAs, resetSleep } from './world-time';
import { effectiveRules } from './table-rules';
import { requireUserId } from './session-user';

/**
 * Rests as a flow (improvements 10).
 *
 * Staff **call** a rest; each player **answers** from their own hero panel —
 * hit dice through the tray, then a confirm; staff **confirm** the lot, and
 * only then do the sheets move, the clock advance and the round-measured
 * effects clear. A rest can be **broken** — a random encounter — and then
 * nothing is granted and the time already spent stays spent.
 *
 * The one writer of `campaign_rests`.
 */

export interface RestRow {
  id: string;
  kind: RestKind;
  status: 'open' | 'done' | 'broken';
  answers: RestAnswers;
  startedAt: string;
  resolvedAt: string | null;
  /** How long it takes at this table, in minutes, under the `rests` rule. */
  minutes: number;
}

function toRow(r: typeof campaignRests.$inferSelect, minutes: number): RestRow {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    answers: normalizeRestAnswers(r.answers),
    startedAt: r.startedAt,
    resolvedAt: r.resolvedAt,
    minutes,
  };
}

async function minutesFor(campaignId: string, kind: RestKind): Promise<number> {
  const [rules, clock] = await Promise.all([
    effectiveRules(campaignId, null),
    readWorldClock(campaignId),
  ]);
  return restMinutes(kind, rules.rests, clock.calendar);
}

/** The rest in progress, or null. No role check: the callers have sat down. */
export async function openRest(campaignId: string): Promise<RestRow | null> {
  const row = await db.query.campaignRests.findFirst({
    where: and(
      eq(campaignRests.campaignId, campaignId),
      eq(campaignRests.status, 'open')
    ),
    orderBy: [desc(campaignRests.startedAt)],
  });
  if (!row) return null;
  return toRow(row, await minutesFor(campaignId, row.kind));
}

/** Call a rest. Staff only. A rest already open is returned, not doubled. */
export async function callRest(
  campaignId: string,
  kind: RestKind
): Promise<RestRow> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const already = await openRest(campaignId);
  if (already) return already;

  const [row] = await db
    .insert(campaignRests)
    .values({ campaignId, kind, calledBy: userId })
    .returning();
  const minutes = await minutesFor(campaignId, kind);
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'rest',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    restKind: kind,
    state: 'called',
    takes: describeMinutes(minutes),
  });
  return toRow(row, minutes);
}

async function ownSeat(
  campaignId: string,
  characterId: string
): Promise<{ userId: string; isStaff: boolean }> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const userId = await requireUserId();
  const isStaff = role === 'gm' || role === 'co-gm';
  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId)
    ),
  });
  if (!member) throw new Error('NOT_FOUND');
  if (!isStaff && member.userId !== userId) throw new Error('FORBIDDEN');
  return { userId, isStaff };
}

/**
 * Spend hit dice during a short rest. The player's own decision, through
 * `spendHitDice` as ever — the tray draws the roll — and the count is kept
 * on the rest so the DM's screen says who has spent what.
 */
export async function restSpendHitDice(
  campaignId: string,
  characterId: string,
  count: number,
  faces?: number[]
): Promise<{ rest: RestRow; roll: HitDiceResult['roll']; physical: boolean }> {
  await ownSeat(campaignId, characterId);
  const rest = await openRest(campaignId);
  if (!rest) throw new Error('NO_REST');
  if (rest.kind !== 'short') throw new Error('NOT_A_SHORT_REST');

  const result = await spendHitDice(characterId, campaignId, count, faces);
  const spent = result.roll.dice.length;
  const answers = { ...rest.answers };
  const mine = answers[characterId] ?? { hitDice: 0, confirmed: false };
  answers[characterId] = { ...mine, hitDice: mine.hitDice + spent };
  await db
    .update(campaignRests)
    .set({ answers })
    .where(eq(campaignRests.id, rest.id));
  bumpVersion(campaignId);
  return {
    rest: { ...rest, answers },
    roll: result.roll,
    physical: result.physical,
  };
}

/** "I'm done." A player for their own hero; staff for anybody. */
export async function confirmRestAnswer(
  campaignId: string,
  characterId: string,
  confirmed: boolean
): Promise<RestRow> {
  await ownSeat(campaignId, characterId);
  const rest = await openRest(campaignId);
  if (!rest) throw new Error('NO_REST');
  const answers = { ...rest.answers };
  const mine = answers[characterId] ?? { hitDice: 0, confirmed: false };
  answers[characterId] = { ...mine, confirmed };
  await db
    .update(campaignRests)
    .set({ answers })
    .where(eq(campaignRests.id, rest.id));
  bumpVersion(campaignId);
  return { ...rest, answers };
}

/**
 * Confirm the rest. Staff only. The sheets move (`applyRestUnchecked` —
 * the same write the instant buttons made), the clock advances by what the
 * rest takes at this table, and on a long rest the hours awake go to zero.
 */
export async function confirmRest(campaignId: string): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const rest = await openRest(campaignId);
  if (!rest) throw new Error('NO_REST');

  const now = new Date().toISOString();
  await db
    .update(campaignRests)
    .set({ status: 'done', resolvedAt: now })
    .where(eq(campaignRests.id, rest.id));

  const { characterIds } = await applyRestUnchecked(campaignId, rest.kind);

  // The day tick runs inside: a gritty week on the road is seven days of
  // rations. The hours it counts awake are zeroed after, on a long rest —
  // that is what the rest was.
  await advanceTimeAs(
    campaignId,
    userId,
    rest.minutes,
    rest.kind === 'long' ? 'A long rest' : 'A short rest'
  );
  if (rest.kind === 'long') await resetSleep(characterIds);

  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'rest',
    id: randomUUID(),
    at: now,
    by: userId,
    restKind: rest.kind,
    state: 'done',
    takes: describeMinutes(rest.minutes),
  });
}

/**
 * Break the rest. Staff only. Nothing is granted; hit dice already spent
 * stay spent (they healed somebody, and that stands); the time counted so
 * far is the DM's to advance by hand.
 */
export async function breakRest(campaignId: string): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const rest = await openRest(campaignId);
  if (!rest) return;
  const now = new Date().toISOString();
  await db
    .update(campaignRests)
    .set({ status: 'broken', resolvedAt: now })
    .where(eq(campaignRests.id, rest.id));
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'rest',
    id: randomUUID(),
    at: now,
    by: userId,
    restKind: rest.kind,
    state: 'broken',
    takes: describeMinutes(rest.minutes),
  });
}
