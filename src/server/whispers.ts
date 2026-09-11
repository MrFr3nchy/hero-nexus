/**
 * A note passed under the table.
 *
 * Three rules, enforced here rather than in a control:
 *
 * 1. **Anyone at the table may whisper to anyone at it.** A player to the DM
 *    ("I pocket the key"), the DM to a player, a player to a player ("cover
 *    me"). The targets are resolved against the table before anything is
 *    written — the same order `revealExcerpt` and `setHandoutVisibility`
 *    insist on — so a whisper addressed to nobody who is here is refused
 *    rather than filed and never read.
 * 2. **Staff read every whisper.** Not a setting. A DM who cannot see what the
 *    rogue told the wizard cannot run the table, and `reaches` in the hub
 *    already lets staff hear anything addressed at anybody; the read here
 *    says the same thing about the rows.
 * 3. **It is not canon.** A whisper never touches `campaign_reveals` and never
 *    widens to the party. It lives in the evening and nowhere else.
 *
 * See `docs/handoff/the-three-tables/README.md`, model decision 4.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignMembers,
  campaignSessions,
  campaignWhisperTargets,
  campaignWhispers,
  characters,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';

/** How much of the evening's whispering the live view carries. */
const WHISPER_LIMIT = 40;

/** One line is one line. Long enough for a sentence, not for a speech. */
const BODY_LIMIT = 500;

export interface WhisperTargetRow {
  userId: string;
  name: string;
  characterName: string | null;
}

export interface WhisperRow {
  id: string;
  fromUserId: string | null;
  fromName: string;
  /** The character the sender sits behind at this table, if any. */
  fromCharacterName: string | null;
  body: string;
  targets: WhisperTargetRow[];
  createdAt: string;
  /** The reader said it. */
  mine: boolean;
  /** The reader was told it. False for a staff member merely overhearing. */
  toMe: boolean;
}

function displayName(row: {
  name: string | null;
  email: string | null;
}): string {
  return row.name?.trim() || row.email?.split('@')[0] || 'Somebody';
}

/**
 * Everybody at this table, by user id, with the name and seat to say it by.
 *
 * Members plus the GM — the GM has no member row, and "whisper to the DM" is
 * the commonest whisper there is.
 */
async function peopleAt(campaignId: string, gmId: string) {
  const members = await db
    .select({
      userId: campaignMembers.userId,
      name: users.name,
      email: users.email,
      characterName: characters.name,
    })
    .from(campaignMembers)
    .innerJoin(users, eq(users.id, campaignMembers.userId))
    .leftJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );
  const gm = await db.query.users.findFirst({
    columns: { id: true, name: true, email: true },
    where: eq(users.id, gmId),
  });

  const people = new Map<string, WhisperTargetRow>();
  if (gm) {
    people.set(gm.id, {
      userId: gm.id,
      name: displayName(gm),
      characterName: null,
    });
  }
  for (const m of members) {
    people.set(m.userId, {
      userId: m.userId,
      name: displayName(m),
      characterName: m.characterName ?? null,
    });
  }
  return people;
}

/* --- reading ----------------------------------------------------------- */

/**
 * The whispering at this table, oldest first, as far back as the live view
 * carries. Any member may read; what they read is filtered here.
 *
 * Staff see everything. A player sees what they said and what was said to
 * them — and nothing that passed between two other people, which is what
 * makes a note under the table a note under the table.
 */
export async function listWhispers(campaignId: string): Promise<WhisperRow[]> {
  const { role, userId, campaign } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  const rows = await db
    .select()
    .from(campaignWhispers)
    .where(eq(campaignWhispers.campaignId, campaignId))
    .orderBy(desc(campaignWhispers.createdAt))
    .limit(WHISPER_LIMIT);
  if (rows.length === 0) return [];

  const targets = await db
    .select({
      whisperId: campaignWhisperTargets.whisperId,
      userId: campaignWhisperTargets.userId,
    })
    .from(campaignWhisperTargets)
    .where(
      inArray(
        campaignWhisperTargets.whisperId,
        rows.map(r => r.id)
      )
    );

  const people = await peopleAt(campaignId, campaign.gmId);
  // Somebody who has since left the table still said what they said; their
  // name is read off the user row rather than dropped.
  const strangers = [
    ...new Set(
      [...rows.map(r => r.fromUserId), ...targets.map(t => t.userId)].filter(
        (id): id is string => id !== null && !people.has(id)
      )
    ),
  ];
  if (strangers.length > 0) {
    const found = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, strangers));
    for (const u of found) {
      people.set(u.id, {
        userId: u.id,
        name: displayName(u),
        characterName: null,
      });
    }
  }
  const nameOf = (id: string | null): WhisperTargetRow =>
    (id && people.get(id)) || {
      userId: id ?? '',
      name: 'Somebody',
      characterName: null,
    };

  return (
    rows
      .map(r => {
        const to = targets.filter(t => t.whisperId === r.id).map(t => t.userId);
        const mine = r.fromUserId === userId;
        const toMe = to.includes(userId);
        return { row: r, to, mine, toMe };
      })
      // The single decision this module turns on: a player reads what they
      // said and what was said to them, and nothing else.
      .filter(w => isStaff || w.mine || w.toMe)
      .reverse()
      .map(({ row, to, mine, toMe }) => {
        const from = nameOf(row.fromUserId);
        return {
          id: row.id,
          fromUserId: row.fromUserId,
          fromName: from.name,
          fromCharacterName: from.characterName,
          body: row.body,
          targets: to.map(nameOf),
          createdAt: row.createdAt,
          mine,
          toMe,
        };
      })
  );
}

/* --- saying ------------------------------------------------------------ */

export interface WhisperInput {
  body: string;
  /** Who it is said to. At least one person at the table other than you. */
  targetUserIds: string[];
}

/**
 * Pass a note. Any member; the targets must be at the table.
 *
 * Announced through the hub to exactly the sender and the targets — staff
 * hear it through `reaches`, which lets them hear anything addressed at
 * anybody at their own table. The line itself travels in the event, because
 * everybody it reaches was meant to read it.
 */
export async function sendWhisper(
  campaignId: string,
  input: WhisperInput
): Promise<string> {
  const { userId, campaign } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);

  const body = input.body.trim().slice(0, BODY_LIMIT);
  if (!body) throw new Error('NOTHING_TO_SAY');

  const people = await peopleAt(campaignId, campaign.gmId);
  // Whispering to yourself is a thought, not a whisper.
  const to = [...new Set(input.targetUserIds)].filter(
    id => id !== userId && people.has(id)
  );
  if (to.length === 0) throw new Error('NOBODY_TO_TELL');

  const sitting = await db.query.campaignSessions.findFirst({
    columns: { id: true },
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });

  const [row] = await db
    .insert(campaignWhispers)
    .values({
      campaignId,
      fromUserId: userId,
      body,
      sessionId: sitting?.id ?? null,
    })
    .returning({ id: campaignWhispers.id });
  await db
    .insert(campaignWhisperTargets)
    .values(to.map(id => ({ whisperId: row.id, userId: id })));

  bumpVersion(campaignId);

  const from = people.get(userId);
  publish(
    campaignId,
    {
      kind: 'whisper',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      whisperId: row.id,
      fromName: from?.characterName ?? from?.name ?? 'Somebody',
      toUserIds: to,
      toNames: to.map(id => {
        const p = people.get(id);
        return p?.characterName ?? p?.name ?? 'Somebody';
      }),
      body,
    },
    { users: [userId, ...to] }
  );

  return row.id;
}
