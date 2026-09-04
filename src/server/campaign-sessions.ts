import 'server-only';

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

export type SessionStatus = 'planned' | 'played' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface AttendanceRow {
  userId: string;
  name: string | null;
  characterId: string | null;
  characterName: string | null;
  status: AttendanceStatus;
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
        status: a.status,
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
