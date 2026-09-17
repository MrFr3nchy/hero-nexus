import 'server-only';

import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignAvailability,
  campaignMembers,
  campaignSessions,
  sessionPollOptions,
  sessionPolls,
  sessionPollVotes,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';

/*
 * Finding a night the table can make.
 *
 * Two layers, and the DM may use either without the other. Availability is
 * what each person says about their own calendar, day by day, before anybody
 * has proposed anything. A poll is the DM holding up a few candidate dates
 * for one sitting and asking the table to pick. Neither replaces the date
 * field on the sitting: settling a poll writes it, and a DM who already knows
 * the night just types it.
 */

export type Availability = 'yes' | 'maybe' | 'no';
export type PollVote = 'yes' | 'maybe' | 'no';
export type PollStatus = 'open' | 'settled' | 'withdrawn';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const EVERYONE = ['gm', 'co-gm', 'player'] as const;

export interface AvailabilityRow {
  userId: string;
  name: string | null;
  day: string;
  status: Availability;
  note: string;
}

/** Who is at the table, for the columns of the grid. The GM has no member row. */
export interface TableSeat {
  userId: string;
  name: string | null;
  isStaff: boolean;
}

export interface AvailabilityWindow {
  from: string;
  to: string;
  seats: TableSeat[];
  rows: AvailabilityRow[];
}

/**
 * Everybody's answers between two days, inclusive. Readable by any member:
 * a player deciding which night to push for wants to see the same grid the
 * DM does.
 */
export async function listAvailability(
  campaignId: string,
  from: string,
  to: string
): Promise<AvailabilityWindow> {
  if (!DAY.test(from) || !DAY.test(to) || from > to) {
    throw new Error('BAD_RANGE');
  }
  const { campaign } = await requireCampaignRole(campaignId, [...EVERYONE]);

  const [rows, seats] = await Promise.all([
    db
      .select({
        userId: campaignAvailability.userId,
        name: users.name,
        day: campaignAvailability.day,
        status: campaignAvailability.status,
        note: campaignAvailability.note,
      })
      .from(campaignAvailability)
      .leftJoin(users, eq(users.id, campaignAvailability.userId))
      .where(
        and(
          eq(campaignAvailability.campaignId, campaignId),
          gte(campaignAvailability.day, from),
          lte(campaignAvailability.day, to)
        )
      )
      .orderBy(asc(campaignAvailability.day)),
    tableSeats(campaign.id, campaign.gmId),
  ]);

  return { from, to, seats, rows };
}

async function tableSeats(
  campaignId: string,
  gmId: string
): Promise<TableSeat[]> {
  const [gm, members] = await Promise.all([
    db.query.users.findFirst({
      columns: { id: true, name: true },
      where: eq(users.id, gmId),
    }),
    db
      .select({
        userId: campaignMembers.userId,
        role: campaignMembers.role,
        name: users.name,
      })
      .from(campaignMembers)
      .leftJoin(users, eq(users.id, campaignMembers.userId))
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.status, 'active')
        )
      ),
  ]);
  const seats: TableSeat[] = [];
  if (gm) seats.push({ userId: gm.id, name: gm.name, isStaff: true });
  for (const m of members) {
    if (m.userId === gmId) continue;
    seats.push({ userId: m.userId, name: m.name, isStaff: m.role === 'co-gm' });
  }
  return seats;
}

/**
 * Say what your days look like. You answer for yourself only — the DM does
 * not get to mark a player free. `null` clears the day back to unknown.
 */
export async function setAvailability(
  campaignId: string,
  entries: { day: string; status: Availability | null; note?: string }[]
): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, [...EVERYONE]);
  if (entries.length === 0) return;
  for (const e of entries) {
    if (!DAY.test(e.day)) throw new Error('BAD_DAY');
  }

  const now = new Date().toISOString();
  db.transaction(tx => {
    for (const e of entries) {
      tx.delete(campaignAvailability)
        .where(
          and(
            eq(campaignAvailability.campaignId, campaignId),
            eq(campaignAvailability.userId, userId),
            eq(campaignAvailability.day, e.day)
          )
        )
        .run();
      if (e.status === null) continue;
      tx.insert(campaignAvailability)
        .values({
          campaignId,
          userId,
          day: e.day,
          status: e.status,
          note: (e.note ?? '').trim().slice(0, 80),
          updatedAt: now,
        })
        .run();
    }
  });
}

/* --- polls ------------------------------------------------------------ */

export interface PollOptionRow {
  id: string;
  day: string;
  time: string;
  votes: { userId: string; name: string | null; vote: PollVote }[];
  /** The reader's own vote on this option, if any. */
  mine: PollVote | null;
}

export interface PollRow {
  id: string;
  sessionId: string;
  status: PollStatus;
  chosenOptionId: string | null;
  createdAt: string;
  closedAt: string | null;
  options: PollOptionRow[];
}

async function sessionForPoll(sessionId: string) {
  const session = await db.query.campaignSessions.findFirst({
    where: eq(campaignSessions.id, sessionId),
  });
  if (!session) throw new Error('NOT_FOUND');
  return session;
}

async function hydratePolls(
  polls: (typeof sessionPolls.$inferSelect)[],
  viewerId: string
): Promise<PollRow[]> {
  if (polls.length === 0) return [];
  const pollIds = polls.map(p => p.id);
  const options = await db
    .select()
    .from(sessionPollOptions)
    .where(inArray(sessionPollOptions.pollId, pollIds))
    .orderBy(asc(sessionPollOptions.sort), asc(sessionPollOptions.day));
  const optionIds = options.map(o => o.id);
  const votes =
    optionIds.length === 0
      ? []
      : await db
          .select({
            optionId: sessionPollVotes.optionId,
            userId: sessionPollVotes.userId,
            name: users.name,
            vote: sessionPollVotes.vote,
          })
          .from(sessionPollVotes)
          .leftJoin(users, eq(users.id, sessionPollVotes.userId))
          .where(inArray(sessionPollVotes.optionId, optionIds));

  return polls.map(p => ({
    id: p.id,
    sessionId: p.sessionId,
    status: p.status,
    chosenOptionId: p.chosenOptionId,
    createdAt: p.createdAt,
    closedAt: p.closedAt,
    options: options
      .filter(o => o.pollId === p.id)
      .map(o => {
        const ov = votes.filter(v => v.optionId === o.id);
        return {
          id: o.id,
          day: o.day,
          time: o.time,
          votes: ov.map(v => ({
            userId: v.userId,
            name: v.name,
            vote: v.vote,
          })),
          mine: ov.find(v => v.userId === viewerId)?.vote ?? null,
        };
      }),
  }));
}

/**
 * Every poll for a campaign's sittings, keyed by session. Any member may
 * read — the whole point of a poll is that the table sees how it is going.
 */
export async function listPolls(campaignId: string): Promise<PollRow[]> {
  const { userId } = await requireCampaignRole(campaignId, [...EVERYONE]);
  const polls = await db
    .select()
    .from(sessionPolls)
    .where(eq(sessionPolls.campaignId, campaignId))
    .orderBy(asc(sessionPolls.createdAt));
  return hydratePolls(polls, userId);
}

/**
 * Hold up some dates. Only a planned sitting can be polled, and only one poll
 * may be open on it at a time — the partial index in `0061` refuses a second
 * rather than trusting a read-then-write.
 */
export async function openPoll(
  sessionId: string,
  options: { day: string; time?: string }[]
): Promise<string> {
  const session = await sessionForPoll(sessionId);
  const { userId } = await requireCampaignRole(session.campaignId, [
    'gm',
    'co-gm',
  ]);
  if (session.status !== 'planned') throw new Error('SESSION_NOT_PLANNED');

  const seen = new Set<string>();
  const clean = options
    .map(o => ({ day: o.day.trim(), time: (o.time ?? '').trim() }))
    .filter(o => {
      const key = `${o.day} ${o.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (clean.length === 0) throw new Error('NO_OPTIONS');
  for (const o of clean) {
    if (!DAY.test(o.day)) throw new Error('BAD_DAY');
    if (o.time && !TIME.test(o.time)) throw new Error('BAD_TIME');
  }

  const existing = await db.query.sessionPolls.findFirst({
    where: and(
      eq(sessionPolls.sessionId, sessionId),
      eq(sessionPolls.status, 'open')
    ),
  });
  if (existing) throw new Error('POLL_OPEN');

  return db.transaction(tx => {
    const [poll] = tx
      .insert(sessionPolls)
      .values({
        campaignId: session.campaignId,
        sessionId,
        createdBy: userId,
      })
      .returning({ id: sessionPolls.id })
      .all();
    tx.insert(sessionPollOptions)
      .values(
        clean.map((o, i) => ({
          pollId: poll.id,
          day: o.day,
          time: o.time,
          sort: i,
        }))
      )
      .run();
    return poll.id;
  });
}

/**
 * Vote on one option. Your own vote only; `null` withdraws it. A settled
 * poll is a record and is not voted on.
 */
export async function votePoll(
  optionId: string,
  vote: PollVote | null
): Promise<void> {
  const option = await db.query.sessionPollOptions.findFirst({
    where: eq(sessionPollOptions.id, optionId),
  });
  if (!option) throw new Error('NOT_FOUND');
  const poll = await db.query.sessionPolls.findFirst({
    where: eq(sessionPolls.id, option.pollId),
  });
  if (!poll) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(poll.campaignId, [...EVERYONE]);
  if (poll.status !== 'open') throw new Error('POLL_CLOSED');

  await db
    .delete(sessionPollVotes)
    .where(
      and(
        eq(sessionPollVotes.optionId, optionId),
        eq(sessionPollVotes.userId, userId)
      )
    );
  if (vote === null) return;
  await db.insert(sessionPollVotes).values({
    optionId,
    userId,
    vote,
    votedAt: new Date().toISOString(),
  });
}

/**
 * Pick the night. Copies the option's day onto the sitting — the time stays
 * on the option, where the chronicle reads it from — and closes the poll.
 */
export async function settlePoll(
  pollId: string,
  optionId: string
): Promise<void> {
  const poll = await db.query.sessionPolls.findFirst({
    where: eq(sessionPolls.id, pollId),
  });
  if (!poll) throw new Error('NOT_FOUND');
  await requireCampaignRole(poll.campaignId, ['gm', 'co-gm']);
  if (poll.status !== 'open') throw new Error('POLL_CLOSED');
  const option = await db.query.sessionPollOptions.findFirst({
    where: and(
      eq(sessionPollOptions.id, optionId),
      eq(sessionPollOptions.pollId, pollId)
    ),
  });
  if (!option) throw new Error('NOT_FOUND');

  const now = new Date().toISOString();
  db.transaction(tx => {
    tx.update(sessionPolls)
      .set({ status: 'settled', chosenOptionId: option.id, closedAt: now })
      .where(eq(sessionPolls.id, pollId))
      .run();
    tx.update(campaignSessions)
      .set({ scheduledFor: option.day, updatedAt: now })
      .where(eq(campaignSessions.id, poll.sessionId))
      .run();
  });
}

/** Take the poll down without choosing. The votes stay as a record. */
export async function withdrawPoll(pollId: string): Promise<void> {
  const poll = await db.query.sessionPolls.findFirst({
    where: eq(sessionPolls.id, pollId),
  });
  if (!poll) throw new Error('NOT_FOUND');
  await requireCampaignRole(poll.campaignId, ['gm', 'co-gm']);
  if (poll.status !== 'open') throw new Error('POLL_CLOSED');
  await db
    .update(sessionPolls)
    .set({ status: 'withdrawn', closedAt: new Date().toISOString() })
    .where(eq(sessionPolls.id, pollId));
}
