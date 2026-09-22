import 'server-only';

import {
  and,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  or,
} from 'drizzle-orm';
import { stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { db } from '@/db';
import {
  battleMaps,
  campaignAudio,
  campaignMembers,
  campaignSessions,
  campaigns,
  characters,
  homebrew,
  homebrewApprovals,
  initiativeEncounters,
  publications,
  users,
} from '@/db/schema';
import { requireUserId } from './session-user';
import { UPLOADS_DIR } from './uploads';

/**
 * The operator's view of the box.
 *
 * Hero Nexus is self-hosted: somebody owns the machine it runs on, and until
 * this existed the app had nothing to say to them. How many accounts are
 * there? How much of the disk have the uploads taken? Who signed up and
 * never verified? Which account is forging a hundred classes a night? All of
 * it was a SQLite prompt and a `du`.
 *
 * **What this is not.** A super admin is not a DM at every table. Nothing
 * here reads a campaign's canon, a DM's notebook, a whisper or a character
 * sheet, and nothing here is a back door into `requireCampaignRole`. The
 * shape of the install is the operator's business; what people wrote in it
 * is not. That line is the whole design of this module, and a future
 * addition that crosses it is a bug however convenient it is.
 */

/** Emails that are super admins whatever the database says. */
function envAdmins(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Promote whoever the environment names, once, when they are looked at.
 *
 * `ADMIN_EMAILS` is how the first super admin exists on a fresh install:
 * there is no bootstrap screen to phish and no "the first account wins" rule
 * to be surprised by after a test signup. Later ones are made by an existing
 * super admin.
 */
export async function syncEnvAdmins(): Promise<void> {
  const emails = envAdmins();
  if (emails.length === 0) return;
  for (const email of emails) {
    await db
      .update(users)
      .set({ isSuperAdmin: true })
      .where(and(eq(users.email, email), eq(users.isSuperAdmin, false)));
  }
}

export async function isSuperAdmin(): Promise<boolean> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return false;
  }
  await syncEnvAdmins();
  const row = await db.query.users.findFirst({
    columns: { isSuperAdmin: true },
    where: eq(users.id, userId),
  });
  return row?.isSuperAdmin === true;
}

/** Throws `FORBIDDEN` for anybody who does not run this box. */
export async function requireSuperAdmin(): Promise<string> {
  const userId = await requireUserId();
  await syncEnvAdmins();
  const row = await db.query.users.findFirst({
    columns: { isSuperAdmin: true },
    where: eq(users.id, userId),
  });
  if (row?.isSuperAdmin !== true) throw new Error('FORBIDDEN');
  return userId;
}

/* --- what the box looks like ------------------------------------------- */

export interface AdminStat {
  key: string;
  label: string;
  value: number;
  /** One line under the number. Absent when the number speaks. */
  note?: string;
}

export interface AdminOverview {
  stats: AdminStat[];
  /** Bytes under `UPLOADS_DIR`, and the file count. */
  uploads: { bytes: number; files: number };
  /** Signups per day for the last fortnight, oldest first. */
  signups: { day: string; count: number }[];
  /** The busiest tables, by how many sessions they have actually played. */
  busiest: { id: string; name: string; sessions: number; members: number }[];
}

/** Bytes and files under a directory, walked once. */
async function directorySize(
  dir: string
): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const walk = async (at: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(at, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        try {
          const info = await stat(full);
          bytes += info.size;
          files += 1;
        } catch {
          // A file that vanished between the listing and the stat is a file
          // that is not taking up any disk.
        }
      }
    }
  };
  await walk(dir);
  return { bytes, files };
}

export async function adminOverview(): Promise<AdminOverview> {
  await requireSuperAdmin();

  const countOf = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where?: any
  ): Promise<number> => {
    const rows = where
      ? await db.select({ n: count() }).from(table).where(where)
      : await db.select({ n: count() }).from(table);
    return rows[0]?.n ?? 0;
  };

  const fortnightAgo = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    accounts,
    unverified,
    disabled,
    tables,
    heroes,
    forged,
    pendingApprovals,
    published,
    boards,
    tracks,
    sessionsPlayed,
    fightsRun,
    recent,
  ] = await Promise.all([
    countOf(users),
    countOf(users, isNull(users.emailVerified)),
    countOf(users, isNotNull(users.disabledAt)),
    countOf(campaigns),
    countOf(characters),
    countOf(homebrew),
    countOf(homebrewApprovals, eq(homebrewApprovals.status, 'pending')),
    countOf(publications),
    countOf(battleMaps),
    countOf(campaignAudio),
    countOf(campaignSessions, eq(campaignSessions.status, 'played')),
    countOf(initiativeEncounters),
    db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(gte(users.createdAt, fortnightAgo)),
  ]);

  const byDay = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    byDay.set(day, 0);
  }
  for (const row of recent) {
    const day = String(row.createdAt).slice(0, 10);
    if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  const campaignRows = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns);
  const played = await db
    .select({ campaignId: campaignSessions.campaignId, n: count() })
    .from(campaignSessions)
    .where(eq(campaignSessions.status, 'played'))
    .groupBy(campaignSessions.campaignId);
  const members = await db
    .select({ campaignId: campaignMembers.campaignId, n: count() })
    .from(campaignMembers)
    .groupBy(campaignMembers.campaignId);
  const playedBy = new Map(played.map(r => [r.campaignId, r.n]));
  const membersBy = new Map(members.map(r => [r.campaignId, r.n]));

  const busiest = campaignRows
    .map(c => ({
      id: c.id,
      name: c.name,
      sessions: playedBy.get(c.id) ?? 0,
      members: membersBy.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.members - a.members)
    .slice(0, 8);

  return {
    stats: [
      { key: 'accounts', label: 'accounts', value: accounts },
      {
        key: 'unverified',
        label: 'never verified an address',
        value: unverified,
        note: 'They cannot sign in until they do.',
      },
      { key: 'disabled', label: 'accounts shut off', value: disabled },
      { key: 'tables', label: 'campaigns', value: tables },
      { key: 'heroes', label: 'characters', value: heroes },
      { key: 'sessions', label: 'sessions played', value: sessionsPlayed },
      { key: 'fights', label: 'fights run', value: fightsRun },
      { key: 'forged', label: 'pieces of homebrew forged', value: forged },
      {
        key: 'approvals',
        label: 'submissions waiting on a DM',
        value: pendingApprovals,
      },
      { key: 'published', label: 'things in the library', value: published },
      { key: 'boards', label: 'battle boards built', value: boards },
      { key: 'tracks', label: 'sounds uploaded', value: tracks },
    ],
    uploads: await directorySize(UPLOADS_DIR),
    signups: [...byDay].map(([day, n]) => ({ day, count: n })),
    busiest,
  };
}

/* --- the people ---------------------------------------------------------- */

export interface AdminUserRow {
  id: string;
  name: string | null;
  email: string;
  verified: boolean;
  isSuperAdmin: boolean;
  disabledAt: string | null;
  createdAt: string;
  characters: number;
  campaigns: number;
  /** Campaigns they own, which is what makes an account load-bearing. */
  runs: number;
}

/** Every account, newest first, with what hangs off it. */
export async function listUsers(query = ''): Promise<AdminUserRow[]> {
  await requireSuperAdmin();
  const q = query.trim().toLowerCase();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      isSuperAdmin: users.isSuperAdmin,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      q
        ? or(like(users.email, `%${q}%`), like(users.name, `%${q}%`))
        : undefined
    )
    .orderBy(desc(users.createdAt))
    .limit(500);

  const [charCounts, memberships, gmShips] = await Promise.all([
    db
      .select({ ownerId: characters.ownerId, n: count() })
      .from(characters)
      .groupBy(characters.ownerId),
    db
      .select({ userId: campaignMembers.userId, n: count() })
      .from(campaignMembers)
      .groupBy(campaignMembers.userId),
    db
      .select({ userId: campaigns.gmId, n: count() })
      .from(campaigns)
      .groupBy(campaigns.gmId),
  ]);
  const chars = new Map(charCounts.map(r => [r.ownerId, r.n]));
  const inTables = new Map(memberships.map(r => [r.userId, r.n]));
  const runs = new Map(gmShips.map(r => [r.userId, r.n]));

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    verified: r.emailVerified !== null,
    isSuperAdmin: r.isSuperAdmin,
    disabledAt: r.disabledAt,
    createdAt: r.createdAt,
    characters: chars.get(r.id) ?? 0,
    campaigns: inTables.get(r.id) ?? 0,
    runs: runs.get(r.id) ?? 0,
  }));
}

/** Shut an account off, or turn it back on. Never the operator's own. */
export async function setUserDisabled(
  userId: string,
  disabled: boolean
): Promise<void> {
  const me = await requireSuperAdmin();
  // Locking yourself out of the box you run is not a feature.
  if (userId === me) throw new Error('NOT_YOURSELF');
  await db
    .update(users)
    .set({ disabledAt: disabled ? new Date().toISOString() : null })
    .where(eq(users.id, userId));
}

/** Hand the keys to somebody else, or take them back. */
export async function setUserSuperAdmin(
  userId: string,
  isAdmin: boolean
): Promise<void> {
  const me = await requireSuperAdmin();
  if (userId === me && !isAdmin) throw new Error('NOT_YOURSELF');
  await db
    .update(users)
    .set({ isSuperAdmin: isAdmin })
    .where(eq(users.id, userId));
}

/**
 * Mark an address verified by hand.
 *
 * Self-hosted installs often have no outbound mail at all — the `mail-outbox`
 * exists for exactly that — so "the verification email never arrived" is the
 * ordinary case rather than the exception, and the operator needs a way to
 * say "yes, that is them" without a SQLite prompt.
 *
 * Deliberately not a password reset. That is the one thing an operator must
 * not be able to do silently, and the reset flow the app already has is the
 * way in.
 */
export async function verifyUserEmail(userId: string): Promise<void> {
  await requireSuperAdmin();
  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(eq(users.id, userId));
}
