import 'server-only';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignHandouts,
  campaignMembers,
  campaignNotes,
  campaignRevealTargets,
  campaignReveals,
  campaignSessions,
  campaigns,
  canonEntries,
  users,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';

export type NoteVisibility = 'dm' | 'shared';
export type RevealVisibility = 'party' | 'selected';
export type RevealSourceKind = 'note' | 'session' | 'quest' | 'canon' | 'free';

export interface NoteRow {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  sessionId: string | null;
  visibility: NoteVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface RevealRow {
  id: string;
  sourceKind: RevealSourceKind;
  sourceId: string | null;
  body: string;
  sessionId: string | null;
  visibility: RevealVisibility;
  createdAt: string;
  /** Who it went to, when it went to named people. Staff-facing; `[]` for a player. */
  targets: { userId: string; name: string | null }[];
  /** True when this reveal reached the viewer personally rather than the table. */
  toMeOnly: boolean;
}

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

async function anyMember(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
}

/** Tags are stored as one comma-separated string; normalise both ways here. */
function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function serializeTags(tags: string[] | undefined): string {
  return tags ? parseTags(tags.join(',')).join(',') : '';
}

/* --- the notebook ------------------------------------------------------ */

/**
 * The DM's prep pages.
 *
 * A player receives only the pages marked `shared`, filtered here rather than
 * in the component — an unshared page is the one thing in this feature that
 * must never reach a player's browser, and a client-side filter is not a
 * filter.
 */
export async function listNotes(campaignId: string): Promise<NoteRow[]> {
  const { role } = await anyMember(campaignId);
  const isStaff = isStaffRole(role);

  const rows = await db
    .select()
    .from(campaignNotes)
    .where(eq(campaignNotes.campaignId, campaignId))
    .orderBy(desc(campaignNotes.pinned), desc(campaignNotes.updatedAt));

  return rows
    .filter(n => isStaff || n.visibility === 'shared')
    .map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      tags: parseTags(n.tags),
      pinned: n.pinned,
      sessionId: n.sessionId,
      visibility: n.visibility,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    }));
}

export interface NoteInput {
  title: string;
  body?: string;
  tags?: string[];
  pinned?: boolean;
  sessionId?: string | null;
  visibility?: NoteVisibility;
}

async function staffForNote(noteId: string) {
  const note = await db.query.campaignNotes.findFirst({
    where: eq(campaignNotes.id, noteId),
  });
  if (!note) throw new Error('NOT_FOUND');
  await staff(note.campaignId);
  return note;
}

/** A session id is only accepted if it belongs to this campaign. */
async function checkSession(
  campaignId: string,
  sessionId: string | null | undefined
): Promise<string | null> {
  if (!sessionId) return null;
  const row = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.id, sessionId),
      eq(campaignSessions.campaignId, campaignId)
    ),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row.id;
}

export async function createNote(
  campaignId: string,
  input: NoteInput
): Promise<string> {
  const { userId } = await staff(campaignId);
  const [row] = await db
    .insert(campaignNotes)
    .values({
      campaignId,
      title: input.title.trim(),
      body: input.body ?? '',
      tags: serializeTags(input.tags),
      pinned: input.pinned ?? false,
      sessionId: await checkSession(campaignId, input.sessionId),
      visibility: input.visibility ?? 'dm',
      createdBy: userId,
    })
    .returning({ id: campaignNotes.id });
  return row.id;
}

export async function updateNote(
  noteId: string,
  patch: Partial<NoteInput>
): Promise<void> {
  const note = await staffForNote(noteId);
  const set: Partial<typeof campaignNotes.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.tags !== undefined) set.tags = serializeTags(patch.tags);
  if (patch.pinned !== undefined) set.pinned = patch.pinned;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.sessionId !== undefined) {
    set.sessionId = await checkSession(note.campaignId, patch.sessionId);
  }

  await db.update(campaignNotes).set(set).where(eq(campaignNotes.id, noteId));
}

export async function deleteNote(noteId: string): Promise<void> {
  await staffForNote(noteId);
  await db.delete(campaignNotes).where(eq(campaignNotes.id, noteId));
}

/* --- reveals ----------------------------------------------------------- */

/**
 * What the party has been told, oldest first.
 *
 * This is the answer to "we last played three weeks ago, what do we know?",
 * which until now had no answer anywhere: reveals were scattered across canon
 * entries, quest summaries and recaps with no shared chronology.
 *
 * A player receives the table's reveals plus the ones addressed to them, and
 * never learns that a reveal they were left out of exists.
 */
export async function listReveals(campaignId: string): Promise<RevealRow[]> {
  const { userId, role } = await anyMember(campaignId);
  const isStaff = isStaffRole(role);

  const rows = await db
    .select()
    .from(campaignReveals)
    .where(eq(campaignReveals.campaignId, campaignId))
    .orderBy(asc(campaignReveals.createdAt));
  if (rows.length === 0) return [];

  const targets = await db
    .select()
    .from(campaignRevealTargets)
    .where(
      inArray(
        campaignRevealTargets.revealId,
        rows.map(r => r.id)
      )
    );

  // Names are only ever attached for staff — a player has no business
  // learning which of the others was told something privately.
  const nameById = new Map<string, string | null>();
  if (isStaff && targets.length) {
    const found = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [...new Set(targets.map(t => t.userId))]));
    found.forEach(u => nameById.set(u.id, u.name));
  }

  const mine = new Set(
    targets.filter(t => t.userId === userId).map(t => t.revealId)
  );

  return rows
    .filter(r => isStaff || r.visibility === 'party' || mine.has(r.id))
    .map(r => ({
      id: r.id,
      sourceKind: r.sourceKind,
      sourceId: isStaff ? r.sourceId : null,
      body: r.body,
      sessionId: r.sessionId,
      visibility: r.visibility,
      createdAt: r.createdAt,
      targets: isStaff
        ? targets
            .filter(t => t.revealId === r.id)
            .map(t => ({
              userId: t.userId,
              name: nameById.get(t.userId) ?? null,
            }))
        : [],
      toMeOnly: r.visibility === 'selected' && mine.has(r.id),
    }));
}

export interface RevealInput {
  /** The excerpt, exactly as the party will read it. */
  body: string;
  sourceKind?: RevealSourceKind;
  sourceId?: string | null;
  sessionId?: string | null;
  visibility?: RevealVisibility;
  /** Users a 'selected' reveal is addressed to. Ignored when it goes to the table. */
  targetUserIds?: string[];
  /** Also append the excerpt to this canon entry's party-facing body. */
  appendToCanonId?: string | null;
  /** Also append it to this session's recap. */
  appendToRecapSessionId?: string | null;
  /** Also drop it on the table as a shared handout with this title. */
  asHandoutTitle?: string | null;
}

/** Everyone who may be addressed: the GM, plus every member row. */
async function campaignAudience(campaignId: string): Promise<Set<string>> {
  const [campaign, members] = await Promise.all([
    db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) }),
    db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(eq(campaignMembers.campaignId, campaignId)),
  ]);
  const ids = new Set(members.map(m => m.userId));
  if (campaign?.gmId) ids.add(campaign.gmId);
  return ids;
}

/**
 * Tell the party something.
 *
 * The excerpt is written down here as text and never re-read from its source,
 * so the record of what was said survives the DM rewriting their notes.
 *
 * The three "also" destinations exist because a reveal usually wants to land
 * somewhere permanent as well as on the timeline — in the NPC's entry, in the
 * recap, or as a handout on the table. All three are party-wide surfaces, so a
 * reveal addressed to selected players refuses them rather than quietly
 * telling everyone: that combination is the exact shape of a leak.
 *
 * Everything is resolved *before* the first row is written. An earlier version
 * inserted the reveal and then walked the destinations, and a bad destination
 * id — a session belonging to another campaign — left the party looking at a
 * reveal the DM had been told failed. A half-done reveal is worse than a
 * refused one.
 */
export async function revealExcerpt(
  campaignId: string,
  input: RevealInput
): Promise<string> {
  const { userId } = await staff(campaignId);

  const body = input.body.trim();
  if (!body) throw new Error('EMPTY_REVEAL');

  const visibility = input.visibility ?? 'party';
  const wantsPartyWideDestination =
    Boolean(input.appendToCanonId) ||
    Boolean(input.appendToRecapSessionId) ||
    Boolean(input.asHandoutTitle);
  if (visibility === 'selected' && wantsPartyWideDestination) {
    throw new Error('SELECTED_CANNOT_BROADCAST');
  }

  /* Resolve everything first — nothing below this block may fail. */

  const sessionId = await checkSession(campaignId, input.sessionId);

  let targetUserIds: string[] = [];
  if (visibility === 'selected') {
    const audience = await campaignAudience(campaignId);
    targetUserIds = [...new Set(input.targetUserIds ?? [])].filter(id =>
      audience.has(id)
    );
    // A 'selected' reveal with nobody to receive it reaches no one, which is
    // never what the DM meant to press the button for.
    if (targetUserIds.length === 0) throw new Error('NO_TARGETS');
  }

  let canonEntry: typeof canonEntries.$inferSelect | undefined;
  if (input.appendToCanonId) {
    canonEntry = await db.query.canonEntries.findFirst({
      where: and(
        eq(canonEntries.id, input.appendToCanonId),
        eq(canonEntries.campaignId, campaignId)
      ),
    });
    if (!canonEntry) throw new Error('NOT_FOUND');
  }

  let recapSession: typeof campaignSessions.$inferSelect | undefined;
  if (input.appendToRecapSessionId) {
    const recapId = await checkSession(
      campaignId,
      input.appendToRecapSessionId
    );
    recapSession = await db.query.campaignSessions.findFirst({
      where: eq(campaignSessions.id, recapId!),
    });
    if (!recapSession) throw new Error('NOT_FOUND');
  }

  /* Write. */

  const [row] = await db
    .insert(campaignReveals)
    .values({
      campaignId,
      sourceKind: input.sourceKind ?? 'free',
      sourceId: input.sourceId ?? null,
      body,
      revealedBy: userId,
      sessionId,
      visibility,
    })
    .returning({ id: campaignReveals.id });

  if (targetUserIds.length > 0) {
    await db
      .insert(campaignRevealTargets)
      .values(targetUserIds.map(id => ({ revealId: row.id, userId: id })));
  }

  if (canonEntry) {
    await db
      .update(canonEntries)
      .set({
        partyBody: canonEntry.partyBody
          ? `${canonEntry.partyBody}\n\n${body}`
          : body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(canonEntries.id, canonEntry.id));
  }

  if (recapSession) {
    await db
      .update(campaignSessions)
      .set({
        recapBody: recapSession.recapBody
          ? `${recapSession.recapBody}\n\n${body}`
          : body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(campaignSessions.id, recapSession.id));
  }

  if (input.asHandoutTitle !== undefined && input.asHandoutTitle !== null) {
    await db.insert(campaignHandouts).values({
      campaignId,
      kind: 'note',
      title: input.asHandoutTitle.trim() || 'From the DM',
      body,
      visibility: 'shared',
      sessionId,
      createdBy: userId,
    });
  }

  return row.id;
}

async function staffForReveal(revealId: string) {
  const reveal = await db.query.campaignReveals.findFirst({
    where: eq(campaignReveals.id, revealId),
  });
  if (!reveal) throw new Error('NOT_FOUND');
  await staff(reveal.campaignId);
  return reveal;
}

/**
 * Widen a private reveal to the whole table.
 *
 * Only in this direction. Narrowing back would mean claiming the party can be
 * un-told something they have already read, and the timeline would then be a
 * record of what the DM currently wishes had happened.
 */
export async function widenRevealToParty(revealId: string): Promise<void> {
  const reveal = await staffForReveal(revealId);
  if (reveal.visibility === 'party') return;
  await db
    .update(campaignReveals)
    .set({ visibility: 'party' })
    .where(eq(campaignReveals.id, revealId));
  await db
    .delete(campaignRevealTargets)
    .where(eq(campaignRevealTargets.revealId, revealId));
}

/** Address an existing private reveal to one more person. */
export async function addRevealTarget(
  revealId: string,
  targetUserId: string
): Promise<void> {
  const reveal = await staffForReveal(revealId);
  if (reveal.visibility !== 'selected') throw new Error('ALREADY_PARTY_WIDE');

  const audience = await campaignAudience(reveal.campaignId);
  if (!audience.has(targetUserId)) throw new Error('NOT_A_MEMBER');

  const existing = await db.query.campaignRevealTargets.findFirst({
    where: and(
      eq(campaignRevealTargets.revealId, revealId),
      eq(campaignRevealTargets.userId, targetUserId)
    ),
  });
  if (existing) return;
  await db
    .insert(campaignRevealTargets)
    .values({ revealId, userId: targetUserId });
}

/**
 * Strike a reveal from the record.
 *
 * Deliberately a full delete rather than a hidden flag: this is for the line
 * pasted into the wrong campaign, and a "revealed by mistake" row that stays
 * readable to the party it was shown to has not undone anything.
 */
export async function deleteReveal(revealId: string): Promise<void> {
  await staffForReveal(revealId);
  await db.delete(campaignReveals).where(eq(campaignReveals.id, revealId));
}
