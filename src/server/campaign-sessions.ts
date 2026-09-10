import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignHandouts,
  campaignMembers,
  campaigns,
  campaignSessionAttendance,
  campaignSessions,
  characters,
  downtimePeriods,
  initiativeEncounters,
  users,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { requireUserId } from './session-user';

export type SessionStatus = 'planned' | 'live' | 'played' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'late';
export type RsvpStatus = 'yes' | 'no' | 'maybe' | 'unknown';

export interface AttendanceRow {
  userId: string;
  name: string | null;
  characterId: string | null;
  characterName: string | null;
  /**
   * The register. Null until the sitting has actually been played.
   *
   * The column is `NOT NULL DEFAULT 'present'`, and an RSVP written a
   * fortnight early creates the row — so reporting it verbatim would have a
   * planned session claiming everyone turned up. It only means something once
   * there was a night to turn up to.
   */
  status: AttendanceStatus | null;
  /** What they said when asked. */
  rsvp: RsvpStatus;
  /** When they said it, so a yes from a month ago reads as one. */
  rsvpAt: string | null;
}

/** One thing that happened at a sitting, for the "what this session held" list. */
export interface SessionLinkRow {
  id: string;
  kind: 'encounter' | 'handout' | 'downtime';
  label: string;
}

export interface SessionRow {
  id: string;
  campaignId: string;
  number: number;
  title: string;
  scheduledFor: string | null;
  playedOn: string | null;
  /** ISO instant the table sat down. Kept after it rises. */
  startedAt: string | null;
  status: SessionStatus;
  /** Staff only — null for a player, so prep never reaches the client. */
  prepBody: string | null;
  /** Null for a player while the recap is still a draft. */
  recapBody: string | null;
  recapVisibility: 'dm' | 'shared';
  attendance: AttendanceRow[];
  links: SessionLinkRow[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionInput {
  title: string;
  scheduledFor?: string | null;
  playedOn?: string | null;
  status?: SessionStatus;
  prepBody?: string;
  recapBody?: string;
}

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

/** Resolve a session's campaign and assert the caller is staff there. */
async function staffForSession(sessionId: string): Promise<{
  session: typeof campaignSessions.$inferSelect;
  userId: string;
}> {
  const session = await db.query.campaignSessions.findFirst({
    where: eq(campaignSessions.id, sessionId),
  });
  if (!session) throw new Error('NOT_FOUND');
  const { userId } = await staff(session.campaignId);
  return { session, userId };
}

/**
 * Every session for a campaign, newest first, with attendance and the things
 * filed under each one.
 *
 * Any member can read. A player gets `prepBody: null` always, and
 * `recapBody: null` until the DM shares it — the filtering is here rather than
 * in the component so a draft recap never travels to the browser.
 */
export async function listSessions(campaignId: string): Promise<SessionRow[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);

  const rows = await db
    .select()
    .from(campaignSessions)
    .where(eq(campaignSessions.campaignId, campaignId))
    .orderBy(desc(campaignSessions.number));
  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);

  const attendance = await db
    .select({
      sessionId: campaignSessionAttendance.sessionId,
      userId: campaignSessionAttendance.userId,
      status: campaignSessionAttendance.status,
      rsvp: campaignSessionAttendance.rsvp,
      rsvpAt: campaignSessionAttendance.rsvpAt,
      characterId: campaignSessionAttendance.characterId,
      name: users.name,
      characterName: characters.name,
    })
    .from(campaignSessionAttendance)
    .leftJoin(users, eq(users.id, campaignSessionAttendance.userId))
    .leftJoin(
      characters,
      eq(characters.id, campaignSessionAttendance.characterId)
    )
    .where(inArray(campaignSessionAttendance.sessionId, ids));

  const [encounters, handouts, periods] = await Promise.all([
    db
      .select({
        id: initiativeEncounters.id,
        sessionId: initiativeEncounters.sessionId,
        name: initiativeEncounters.name,
      })
      .from(initiativeEncounters)
      .where(inArray(initiativeEncounters.sessionId, ids)),
    db
      .select({
        id: campaignHandouts.id,
        sessionId: campaignHandouts.sessionId,
        title: campaignHandouts.title,
        kind: campaignHandouts.kind,
        visibility: campaignHandouts.visibility,
      })
      .from(campaignHandouts)
      .where(inArray(campaignHandouts.sessionId, ids)),
    db
      .select({
        id: downtimePeriods.id,
        sessionId: downtimePeriods.sessionId,
        label: downtimePeriods.label,
      })
      .from(downtimePeriods)
      .where(inArray(downtimePeriods.sessionId, ids)),
  ]);

  const linksFor = (sessionId: string): SessionLinkRow[] => [
    ...encounters
      .filter(e => e.sessionId === sessionId)
      .map(e => ({ id: e.id, kind: 'encounter' as const, label: e.name })),
    ...handouts
      .filter(
        h => h.sessionId === sessionId && (isStaff || h.visibility === 'shared')
      )
      .map(h => ({
        id: h.id,
        kind: 'handout' as const,
        label: h.title || (h.kind === 'image' ? 'Image' : 'Note'),
      })),
    ...periods
      .filter(p => p.sessionId === sessionId)
      .map(p => ({
        id: p.id,
        kind: 'downtime' as const,
        label: p.label || 'Downtime',
      })),
  ];

  return rows.map(row => ({
    id: row.id,
    campaignId: row.campaignId,
    number: row.number,
    title: row.title,
    scheduledFor: row.scheduledFor,
    playedOn: row.playedOn,
    startedAt: row.startedAt,
    status: row.status,
    prepBody: isStaff ? row.prepBody : null,
    recapBody:
      isStaff || row.recapVisibility === 'shared' ? row.recapBody : null,
    recapVisibility: row.recapVisibility,
    attendance: attendance
      .filter(a => a.sessionId === row.id)
      .map(a => ({
        userId: a.userId,
        name: a.name,
        characterId: a.characterId,
        characterName: a.characterName,
        status: row.status === 'played' ? a.status : null,
        rsvp: a.rsvp,
        rsvpAt: a.rsvpAt,
      })),
    links: linksFor(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * The next planned sitting, for the campaign overview and the dashboard rail.
 * Readable by any member; carries no prep and no unshared recap.
 */
export async function nextSession(campaignId: string): Promise<{
  id: string;
  number: number;
  title: string;
  scheduledFor: string | null;
} | null> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const row = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'planned')
    ),
    orderBy: [asc(campaignSessions.number)],
  });
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    scheduledFor: row.scheduledFor,
  };
}

/**
 * Open the next sitting. The number is the campaign's highest plus one rather
 * than a count, so deleting session 3 leaves 4 as 4 and the chronicle keeps
 * matching what the table calls each evening.
 */
export async function createSession(
  campaignId: string,
  input: SessionInput
): Promise<string> {
  const { userId } = await staff(campaignId);

  const highest = await db.query.campaignSessions.findFirst({
    where: eq(campaignSessions.campaignId, campaignId),
    orderBy: [desc(campaignSessions.number)],
  });

  const [row] = await db
    .insert(campaignSessions)
    .values({
      campaignId,
      number: (highest?.number ?? 0) + 1,
      title: input.title.trim(),
      scheduledFor: input.scheduledFor || null,
      playedOn: input.playedOn || null,
      status: input.status ?? 'planned',
      prepBody: input.prepBody ?? '',
      recapBody: input.recapBody ?? '',
      createdBy: userId,
    })
    .returning({ id: campaignSessions.id });
  return row.id;
}

export async function updateSession(
  sessionId: string,
  patch: Partial<SessionInput>
): Promise<void> {
  await staffForSession(sessionId);
  const set: Partial<typeof campaignSessions.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.scheduledFor !== undefined)
    set.scheduledFor = patch.scheduledFor || null;
  if (patch.playedOn !== undefined) set.playedOn = patch.playedOn || null;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.prepBody !== undefined) set.prepBody = patch.prepBody;
  if (patch.recapBody !== undefined) set.recapBody = patch.recapBody;

  await db
    .update(campaignSessions)
    .set(set)
    .where(eq(campaignSessions.id, sessionId));
}

/**
 * Mark a session played. Defaults `playedOn` to today and fills attendance
 * from the current membership, so the common case is one button rather than a
 * form — the DM corrects the exceptions afterwards.
 */
export async function markSessionPlayed(sessionId: string): Promise<void> {
  const { session } = await staffForSession(sessionId);

  await db
    .update(campaignSessions)
    .set({
      status: 'played',
      playedOn: session.playedOn ?? new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaignSessions.id, sessionId));

  const existing = await db
    .select({ userId: campaignSessionAttendance.userId })
    .from(campaignSessionAttendance)
    .where(eq(campaignSessionAttendance.sessionId, sessionId));
  if (existing.length > 0) return;

  const members = await db
    .select({
      userId: campaignMembers.userId,
      characterId: campaignMembers.characterId,
    })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, session.campaignId),
        eq(campaignMembers.status, 'active')
      )
    );
  if (members.length === 0) return;

  await db.insert(campaignSessionAttendance).values(
    members.map(m => ({
      sessionId,
      userId: m.userId,
      characterId: m.characterId,
      status: 'present' as const,
    }))
  );
}

/* --- the sitting the table is in ------------------------------------- */

/**
 * The evening currently being played, if there is one.
 *
 * Readable by anybody at the table, because the point of it is the way in: a
 * player who was not told the table had sat down is exactly the person this
 * whole feature exists for.
 */
export async function liveSitting(campaignId: string): Promise<{
  id: string;
  number: number;
  title: string;
  startedAt: string | null;
} | null> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const row = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });
  return row
    ? {
        id: row.id,
        number: row.number,
        title: row.title,
        startedAt: row.startedAt,
      }
    : null;
}

/**
 * The sitting the signed-in person should be at, if any.
 *
 * Asked by the shell on every page, which is the whole point: the complaint
 * this work answers is that a table only reached whoever was already looking
 * at it. One query across the campaigns they belong to, so a player reading
 * the compendium still learns their table has sat down.
 *
 * If two of their tables are somehow sitting at once, the one that started
 * most recently wins. That is a rare enough shape not to deserve a chooser,
 * and the most recent is the better guess.
 */
export async function mySitting(): Promise<{
  campaignId: string;
  campaignName: string;
  id: string;
  number: number;
  title: string;
  startedAt: string | null;
  isStaff: boolean;
} | null> {
  const userId = await requireUserId();

  const [runs, plays] = await Promise.all([
    db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.gmId, userId)),
    db
      .select({ id: campaignMembers.campaignId })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.userId, userId),
          eq(campaignMembers.status, 'active')
        )
      ),
  ]);

  const staffOf = new Set(runs.map(r => r.id));
  const mine = [...new Set([...staffOf, ...plays.map(r => r.id)])];
  if (mine.length === 0) return null;

  const row = await db
    .select({
      id: campaignSessions.id,
      campaignId: campaignSessions.campaignId,
      number: campaignSessions.number,
      title: campaignSessions.title,
      startedAt: campaignSessions.startedAt,
      campaignName: campaigns.name,
    })
    .from(campaignSessions)
    .innerJoin(campaigns, eq(campaigns.id, campaignSessions.campaignId))
    .where(
      and(
        eq(campaignSessions.status, 'live'),
        inArray(campaignSessions.campaignId, mine)
      )
    )
    .orderBy(desc(campaignSessions.startedAt))
    .limit(1);

  const found = row[0];
  if (!found) return null;
  return {
    campaignId: found.campaignId,
    campaignName: found.campaignName,
    id: found.id,
    number: found.number,
    title: found.title,
    startedAt: found.startedAt,
    // A co-DM is staff here too, but the membership read above did not ask for
    // the role. The bar only uses this to word a button, and getting it wrong
    // costs a co-DM one extra press — not worth a third query on every page.
    isStaff: staffOf.has(found.campaignId),
  };
}

/** How a sitting reads in one line — "Session 7 · The bridge at Duskwater". */
function sittingTitle(number: number, title: string): string {
  return title ? `Session ${number} · ${title}` : `Session ${number}`;
}

/**
 * Take your seats.
 *
 * Opens the next planned sitting, or mints one if the DM never wrote it down —
 * a table that sat without prep is the ordinary case, not an error, and
 * refusing to start because nobody filed a session would make this the third
 * thing to do before playing rather than the first.
 *
 * At most one live sitting per campaign, enforced by the partial unique index
 * in `0037`. Opening while one is already open returns that one rather than
 * failing: two people pressing "take your seats" is not a conflict, it is two
 * people agreeing.
 */
export async function openSitting(campaignId: string): Promise<string> {
  const { userId } = await staff(campaignId);

  const already = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });
  if (already) return already.id;

  const startedAt = new Date().toISOString();
  const planned = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'planned')
    ),
    orderBy: [asc(campaignSessions.number)],
  });

  let id: string;
  let number: number;
  let title: string;

  if (planned) {
    id = planned.id;
    number = planned.number;
    title = planned.title;
    await db
      .update(campaignSessions)
      .set({ status: 'live', startedAt, updatedAt: startedAt })
      .where(eq(campaignSessions.id, planned.id));
  } else {
    const highest = await db
      .select({ number: campaignSessions.number })
      .from(campaignSessions)
      .where(eq(campaignSessions.campaignId, campaignId))
      .orderBy(desc(campaignSessions.number))
      .limit(1);
    number = (highest[0]?.number ?? 0) + 1;
    title = '';
    const [row] = await db
      .insert(campaignSessions)
      .values({
        campaignId,
        number,
        status: 'live',
        startedAt,
        createdBy: userId,
      })
      .returning({ id: campaignSessions.id });
    id = row.id;
  }

  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'sitting',
    id: randomUUID(),
    at: startedAt,
    by: userId,
    state: 'opened',
    title: sittingTitle(number, title),
  });
  return id;
}

/**
 * The table rises.
 *
 * Stamps `played_on` and files the evening, which is the chore a DM does by
 * hand in the chronicle today — so the feature pays for part of itself. The
 * register is filled in by `markSessionPlayed`, which already knows not to
 * overwrite an attendance list somebody has edited.
 */
export async function closeSitting(campaignId: string): Promise<void> {
  await staff(campaignId);
  const row = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });
  if (!row) return;

  await markSessionPlayed(row.id);

  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'sitting',
    id: randomUUID(),
    at: new Date().toISOString(),
    state: 'closed',
    title: sittingTitle(row.number, row.title),
  });
}

export async function setRecapVisibility(
  sessionId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  const { session } = await staffForSession(sessionId);
  if (visibility === 'shared' && !session.recapBody.trim()) {
    throw new Error('RECAP_EMPTY');
  }
  await db
    .update(campaignSessions)
    .set({ recapVisibility: visibility, updatedAt: new Date().toISOString() })
    .where(eq(campaignSessions.id, sessionId));
}

/**
 * Say whether you are coming.
 *
 * You answer for yourself and nobody else — including the DM, who marks the
 * register afterwards but does not get to decide in advance who is coming.
 * That is the whole difference between this and `setAttendance`.
 *
 * Only a planned sitting can be answered. An RSVP for a night that has already
 * happened is either a mistake or an argument, and neither should be written
 * over the record of who was there.
 */
export async function setRsvp(
  sessionId: string,
  rsvp: RsvpStatus
): Promise<void> {
  const session = await db.query.campaignSessions.findFirst({
    where: eq(campaignSessions.id, sessionId),
  });
  if (!session) throw new Error('NOT_FOUND');

  const { userId } = await requireCampaignRole(session.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  if (session.status !== 'planned') throw new Error('SESSION_NOT_PLANNED');

  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, session.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });

  const existing = await db.query.campaignSessionAttendance.findFirst({
    where: and(
      eq(campaignSessionAttendance.sessionId, sessionId),
      eq(campaignSessionAttendance.userId, userId)
    ),
  });

  const rsvpAt = new Date().toISOString();

  // The register starts from what people said, so a DM marking it after the
  // night is correcting a sensible guess rather than filling in five rows.
  //
  // Safe to write here because the register means nothing until the sitting
  // has been played, and an RSVP is refused once it has — so this can never
  // overwrite a register the DM has actually marked. Without it, a row created
  // by an RSVP carried the column's 'present' default and the played sitting
  // then claimed the person who said no had turned up.
  const status: AttendanceStatus = rsvp === 'no' ? 'absent' : 'present';

  if (existing) {
    await db
      .update(campaignSessionAttendance)
      .set({
        rsvp,
        rsvpAt,
        status,
        characterId: member?.characterId ?? existing.characterId,
      })
      .where(eq(campaignSessionAttendance.id, existing.id));
    return;
  }

  await db.insert(campaignSessionAttendance).values({
    sessionId,
    userId,
    characterId: member?.characterId ?? null,
    rsvp,
    rsvpAt,
    status,
  });
}

export async function setAttendance(
  sessionId: string,
  userId: string,
  status: AttendanceStatus
): Promise<void> {
  const { session } = await staffForSession(sessionId);

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, session.campaignId),
  });
  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, session.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  // The GM has no member row, so allow them by id rather than by membership.
  if (!member && campaign?.gmId !== userId) throw new Error('NOT_A_MEMBER');

  const existing = await db.query.campaignSessionAttendance.findFirst({
    where: and(
      eq(campaignSessionAttendance.sessionId, sessionId),
      eq(campaignSessionAttendance.userId, userId)
    ),
  });

  if (existing) {
    await db
      .update(campaignSessionAttendance)
      .set({
        status,
        characterId: member?.characterId ?? existing.characterId,
      })
      .where(eq(campaignSessionAttendance.id, existing.id));
    return;
  }

  await db.insert(campaignSessionAttendance).values({
    sessionId,
    userId,
    characterId: member?.characterId ?? null,
    status,
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await staffForSession(sessionId);
  await db.delete(campaignSessions).where(eq(campaignSessions.id, sessionId));
}

/**
 * File an encounter, handout or downtime window under a session — or unfile it
 * by passing null. Each target's campaign is checked against the session's, so
 * a handout cannot be filed under another table's evening.
 */
export async function fileUnderSession(
  kind: 'encounter' | 'handout' | 'downtime',
  targetId: string,
  sessionId: string | null
): Promise<void> {
  const table =
    kind === 'encounter'
      ? initiativeEncounters
      : kind === 'handout'
        ? campaignHandouts
        : downtimePeriods;

  const target = await db
    .select({ id: table.id, campaignId: table.campaignId })
    .from(table)
    .where(eq(table.id, targetId))
    .then(rows => rows[0]);
  if (!target) throw new Error('NOT_FOUND');
  await staff(target.campaignId);

  if (sessionId) {
    const { session } = await staffForSession(sessionId);
    if (session.campaignId !== target.campaignId) throw new Error('FORBIDDEN');
  }

  await db.update(table).set({ sessionId }).where(eq(table.id, targetId));
}
