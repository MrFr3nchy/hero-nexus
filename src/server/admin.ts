import 'server-only';

import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  or,
  sql,
} from 'drizzle-orm';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { db, DB_PATH } from '@/db';
import {
  adoptions,
  battleMapTokens,
  battleMaps,
  campaignAudio,
  campaignChecks,
  campaignClocks,
  campaignHandouts,
  campaignImages,
  campaignMaps,
  campaignMembers,
  campaignNotes,
  campaignQuests,
  campaignRolls,
  campaignSessions,
  campaignShops,
  campaignWhispers,
  campaigns,
  canonEntries,
  characterPortraits,
  characters,
  downtimeActions,
  encounterPlans,
  homebrew,
  homebrewApprovals,
  initiativeEncounters,
  initiativeEntries,
  partyLoot,
  playerJournals,
  publicationAssets,
  publications,
  sessionAwards,
  users,
} from '@/db/schema';
import { requireUserId } from './session-user';
import { UPLOADS_DIR } from './uploads';

/**
 * The operator's view of the install.
 *
 * Hero Nexus is self-hosted: somebody owns the machine it runs on, and until
 * this existed the app had nothing to say to them. How many accounts are
 * there? How much of the disk have the uploads taken? Who signed up and never
 * verified? Is anybody actually playing? All of it was a SQLite prompt and a
 * `du`.
 *
 * **What this is not.** A super admin is not a DM at every table. Nothing here
 * reads a campaign's canon, a DM's notebook, a whisper or a character sheet —
 * it counts rows and sums bytes. Campaign names appear in one list and nothing
 * else does. The shape of the install is the operator's business; what people
 * wrote in it is not. That line is the whole design of this module, and a
 * future addition that crosses it is a bug however convenient it is.
 *
 * **Voice.** Plain, unlike the rest of the app, and deliberately exempt from
 * the naming document's in-world vocabulary. This page is read while something
 * is going wrong, by the one person who owns the box: "accounts" beats "souls
 * at the table" when you are deciding whether the disk is full.
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

/** Throws `FORBIDDEN` for anybody who does not run this install. */
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

/* --- the shapes the page draws ----------------------------------------- */

export interface AdminMetric {
  key: string;
  label: string;
  value: number;
  /** One line under it, when the number alone would mislead. */
  hint?: string;
  /**
   * A state worth colouring. Always drawn beside its own label, never colour
   * alone: `warn` is something to look at, `bad` is something wrong.
   */
  tone?: 'warn' | 'bad';
}

/** A named group of counts. One card on the page. */
export interface AdminGroup {
  key: string;
  title: string;
  line: string;
  metrics: AdminMetric[];
}

/** A magnitude comparison of named things. One bar list on the page. */
export interface AdminBreakdown {
  key: string;
  title: string;
  line: string;
  /** What a row's number counts: "characters", "pieces". */
  unit: string;
  rows: { label: string; value: number }[];
}

/** A count per bucket, oldest first. Buckets are never sparse. */
export interface AdminSeries {
  key: string;
  title: string;
  line: string;
  unit: string;
  points: { label: string; full: string; value: number }[];
}

export interface AdminOverview {
  /** When this was read, so a tab left open says so rather than lying. */
  generatedAt: string;
  groups: AdminGroup[];
  breakdowns: AdminBreakdown[];
  series: AdminSeries[];
  storage: {
    /** What each kind of upload accounts for, from the rows that own it. */
    kinds: { label: string; bytes: number; files: number }[];
    /** What is actually on the disk, which may differ from the rows. */
    onDisk: { bytes: number; files: number };
    /** The SQLite file itself. */
    database: number;
  };
  busiestCampaigns: {
    id: string;
    name: string;
    sessions: number;
    members: number;
    rolls: number;
  }[];
}

/* --- helpers ------------------------------------------------------------ */

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

/** The last `n` days as `YYYY-MM-DD`, oldest first. */
function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/** The last `n` months as `YYYY-MM`, oldest first. */
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * Fill a bucket list from grouped rows, so no bucket is missing.
 *
 * A sparse series is the classic lie: three bars for three days that happened
 * to have traffic reads as three consecutive days of it.
 */
function fill(
  buckets: string[],
  rows: { bucket: string | null; n: number }[],
  label: (bucket: string) => string
): AdminSeries['points'] {
  const by = new Map(rows.map(r => [String(r.bucket ?? ''), r.n]));
  return buckets.map(b => ({
    label: label(b),
    full: b,
    value: by.get(b) ?? 0,
  }));
}

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

/* --- the overview -------------------------------------------------------- */

export async function adminOverview(): Promise<AdminOverview> {
  await requireSuperAdmin();

  /** `SELECT count(*) FROM table [WHERE …]`, as one number. */
  const countOf = async (
    // Drizzle's table type is not usefully nameable across thirty call sites.
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

  const since7 = iso(7);
  const since30 = iso(30);

  /* --- people ---------------------------------------------------------- */

  const [accounts, verified, disabled, admins] = await Promise.all([
    countOf(users),
    countOf(users, isNotNull(users.emailVerified)),
    countOf(users, isNotNull(users.disabledAt)),
    countOf(users, eq(users.isSuperAdmin, true)),
  ]);

  /*
   * "Active" means *wrote something*, not "held a session open": sessions are
   * JWTs and there is no row to count. Three tables cover nearly everything a
   * person does — rolling at a table, touching a sheet, forging something —
   * and somebody who did none of the three in a month is fairly called quiet.
   */
  const activeSince = async (since: string): Promise<number> => {
    const [rolled, sheets, forged] = await Promise.all([
      db
        .selectDistinct({ id: campaignRolls.actorUserId })
        .from(campaignRolls)
        .where(gte(campaignRolls.createdAt, since)),
      db
        .selectDistinct({ id: characters.ownerId })
        .from(characters)
        .where(gte(characters.updatedAt, since)),
      db
        .selectDistinct({ id: homebrew.ownerId })
        .from(homebrew)
        .where(gte(homebrew.updatedAt, since)),
    ]);
    const seen = new Set<string>();
    for (const row of [...rolled, ...sheets, ...forged]) {
      if (row.id) seen.add(row.id);
    }
    return seen.size;
  };
  const [active7, active30] = await Promise.all([
    activeSince(since7),
    activeSince(since30),
  ]);

  /* --- campaigns ------------------------------------------------------- */

  const [
    campaignCount,
    campaignsActive,
    campaignsPaused,
    campaignsCompleted,
    campaignsArchived,
    sittingNow,
    fightingNow,
    memberCount,
  ] = await Promise.all([
    countOf(campaigns),
    countOf(campaigns, eq(campaigns.status, 'active')),
    countOf(campaigns, eq(campaigns.status, 'paused')),
    countOf(campaigns, eq(campaigns.status, 'completed')),
    countOf(campaigns, eq(campaigns.status, 'archived')),
    countOf(campaignSessions, eq(campaignSessions.status, 'live')),
    countOf(initiativeEncounters, eq(initiativeEncounters.isActive, true)),
    countOf(campaignMembers),
  ]);

  /* --- play ------------------------------------------------------------ */

  const [
    sessionsPlanned,
    sessionsPlayed,
    sessionsCancelled,
    fights,
    combatants,
    plans,
    rollsAll,
    rolls30,
    checksAsked,
    whispers,
    handouts,
    awards,
  ] = await Promise.all([
    countOf(campaignSessions, eq(campaignSessions.status, 'planned')),
    countOf(campaignSessions, eq(campaignSessions.status, 'played')),
    countOf(campaignSessions, eq(campaignSessions.status, 'cancelled')),
    countOf(initiativeEncounters),
    countOf(initiativeEntries),
    countOf(encounterPlans),
    countOf(campaignRolls),
    countOf(campaignRolls, gte(campaignRolls.createdAt, since30)),
    countOf(campaignChecks),
    countOf(campaignWhispers),
    countOf(campaignHandouts),
    countOf(sessionAwards),
  ]);

  /* --- characters ------------------------------------------------------ */

  const [
    characterCount,
    drafts,
    seated,
    blueprints,
    withHomebrew,
    avgLevelRows,
  ] = await Promise.all([
    countOf(characters),
    countOf(characters, eq(characters.status, 'draft')),
    countOf(characters, isNotNull(characters.campaignId)),
    countOf(characters, isNull(characters.campaignId)),
    countOf(characters, eq(characters.hasHomebrew, true)),
    db.select({ v: avg(characters.level) }).from(characters),
  ]);
  const avgLevel = Number(avgLevelRows[0]?.v ?? 0);

  /* --- the world ------------------------------------------------------- */

  const [quests, clocks, canon, notes, journals, downtime, maps, loot, shops] =
    await Promise.all([
      countOf(campaignQuests),
      countOf(campaignClocks),
      countOf(canonEntries),
      countOf(campaignNotes),
      countOf(playerJournals),
      countOf(downtimeActions),
      countOf(campaignMaps),
      countOf(partyLoot),
      countOf(campaignShops),
    ]);

  /* --- boards ---------------------------------------------------------- */

  const [boards, boardsInPlay, boardsShared, tokens] = await Promise.all([
    countOf(battleMaps),
    countOf(battleMaps, eq(battleMaps.isActive, true)),
    countOf(battleMaps, eq(battleMaps.visibility, 'shared')),
    countOf(battleMapTokens),
  ]);

  /* --- content --------------------------------------------------------- */

  const [
    forgedCount,
    forgedPublic,
    pendingApprovals,
    approvedApprovals,
    deniedApprovals,
    published,
    adopted,
  ] = await Promise.all([
    countOf(homebrew),
    countOf(homebrew, eq(homebrew.visibility, 'public')),
    countOf(homebrewApprovals, eq(homebrewApprovals.status, 'pending')),
    countOf(homebrewApprovals, eq(homebrewApprovals.status, 'approved')),
    countOf(homebrewApprovals, eq(homebrewApprovals.status, 'denied')),
    countOf(publications),
    countOf(adoptions),
  ]);

  /* --- breakdowns ------------------------------------------------------ */

  const groupRows = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    column: any
  ): Promise<{ label: string; value: number }[]> => {
    const rows = await db
      .select({ k: column, n: count() })
      .from(table)
      .groupBy(column)
      .orderBy(desc(count()));
    return rows
      .map(r => ({
        label: String(r.k ?? '').trim() || 'Not chosen',
        value: r.n,
      }))
      .filter(r => r.value > 0);
  };

  const [byType, byClass, bySpecies, byPublicationKind] = await Promise.all([
    groupRows(homebrew, homebrew.type),
    groupRows(characters, characters.class),
    groupRows(characters, characters.species),
    groupRows(publications, publications.kind),
  ]);

  const levelRows = await db
    .select({ k: characters.level, n: count() })
    .from(characters)
    .groupBy(characters.level)
    .orderBy(characters.level);

  /* --- series ---------------------------------------------------------- */

  const days30 = lastDays(30);
  const months12 = lastMonths(12);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dayOf = (column: any) => sql<string>`substr(${column}, 1, 10)`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monthOf = (column: any) => sql<string>`substr(${column}, 1, 7)`;

  const signupDay = dayOf(users.createdAt);
  const rollDay = dayOf(campaignRolls.createdAt);
  const sessionMonth = monthOf(campaignSessions.createdAt);

  const [signupRows, rollRows, sessionRows] = await Promise.all([
    db
      .select({ bucket: signupDay, n: count() })
      .from(users)
      .where(gte(users.createdAt, since30))
      .groupBy(signupDay),
    db
      .select({ bucket: rollDay, n: count() })
      .from(campaignRolls)
      .where(gte(campaignRolls.createdAt, since30))
      .groupBy(rollDay),
    db
      .select({ bucket: sessionMonth, n: count() })
      .from(campaignSessions)
      .where(eq(campaignSessions.status, 'played'))
      .groupBy(sessionMonth),
  ]);

  /* --- storage --------------------------------------------------------- */

  const sizeOf = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    column: any
  ): Promise<{ bytes: number; files: number }> => {
    const rows = await db
      .select({ b: sql<number>`coalesce(sum(${column}), 0)`, n: count() })
      .from(table);
    return { bytes: Number(rows[0]?.b ?? 0), files: rows[0]?.n ?? 0 };
  };

  const [images, audioFiles, portraits, libraryAssets, onDisk] =
    await Promise.all([
      sizeOf(campaignImages, campaignImages.bytes),
      sizeOf(campaignAudio, campaignAudio.bytes),
      sizeOf(characterPortraits, characterPortraits.bytes),
      sizeOf(publicationAssets, publicationAssets.bytes),
      directorySize(UPLOADS_DIR),
    ]);
  const database = await stat(DB_PATH)
    .then(s => s.size)
    .catch(() => 0);

  /* --- the busiest campaigns -------------------------------------------- */

  const campaignRows = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns);
  const [playedBy, membersBy, rollsBy] = await Promise.all([
    db
      .select({ id: campaignSessions.campaignId, n: count() })
      .from(campaignSessions)
      .where(eq(campaignSessions.status, 'played'))
      .groupBy(campaignSessions.campaignId),
    db
      .select({ id: campaignMembers.campaignId, n: count() })
      .from(campaignMembers)
      .groupBy(campaignMembers.campaignId),
    db
      .select({ id: campaignRolls.campaignId, n: count() })
      .from(campaignRolls)
      .groupBy(campaignRolls.campaignId),
  ]);
  const played = new Map(playedBy.map(r => [r.id, r.n]));
  const members = new Map(membersBy.map(r => [r.id, r.n]));
  const rolled = new Map(rollsBy.map(r => [r.id, r.n]));

  const busiestCampaigns = campaignRows
    .map(c => ({
      id: c.id,
      name: c.name,
      sessions: played.get(c.id) ?? 0,
      members: members.get(c.id) ?? 0,
      rolls: rolled.get(c.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.sessions - a.sessions || b.rolls - a.rolls || b.members - a.members
    )
    .slice(0, 10);

  /* --- assembled ------------------------------------------------------- */

  const unverified = accounts - verified;

  return {
    generatedAt: new Date().toISOString(),
    groups: [
      {
        key: 'people',
        title: 'People',
        line: 'Accounts, and how many of them are doing anything.',
        metrics: [
          { key: 'accounts', label: 'Accounts', value: accounts },
          { key: 'verified', label: 'Verified', value: verified },
          {
            key: 'unverified',
            label: 'Unverified',
            value: unverified,
            hint: 'Cannot sign in until the address is confirmed.',
            ...(unverified > 0 ? { tone: 'warn' as const } : {}),
          },
          {
            key: 'disabled',
            label: 'Disabled',
            value: disabled,
            ...(disabled > 0 ? { tone: 'bad' as const } : {}),
          },
          { key: 'admins', label: 'Super admins', value: admins },
          {
            key: 'active7',
            label: 'Active, 7 days',
            value: active7,
            hint: 'Rolled, edited a sheet, or forged something.',
          },
          { key: 'active30', label: 'Active, 30 days', value: active30 },
        ],
      },
      {
        key: 'campaigns',
        title: 'Campaigns',
        line: 'Tables, what state they are in, and who is at them.',
        metrics: [
          { key: 'total', label: 'Campaigns', value: campaignCount },
          { key: 'active', label: 'Active', value: campaignsActive },
          { key: 'paused', label: 'Paused', value: campaignsPaused },
          { key: 'completed', label: 'Completed', value: campaignsCompleted },
          { key: 'archived', label: 'Archived', value: campaignsArchived },
          { key: 'members', label: 'Seats taken', value: memberCount },
          { key: 'sitting', label: 'In session now', value: sittingNow },
          { key: 'fighting', label: 'In a fight now', value: fightingNow },
        ],
      },
      {
        key: 'play',
        title: 'Play',
        line: 'What has actually happened at those tables.',
        metrics: [
          { key: 'played', label: 'Sessions played', value: sessionsPlayed },
          { key: 'planned', label: 'Sessions planned', value: sessionsPlanned },
          {
            key: 'cancelled',
            label: 'Sessions cancelled',
            value: sessionsCancelled,
          },
          { key: 'fights', label: 'Fights run', value: fights },
          { key: 'combatants', label: 'Combatants in them', value: combatants },
          { key: 'plans', label: 'Encounters prepared', value: plans },
          { key: 'rollsAll', label: 'Dice rolled, all time', value: rollsAll },
          { key: 'rolls30', label: 'Dice rolled, 30 days', value: rolls30 },
          { key: 'checks', label: 'Checks asked for', value: checksAsked },
          { key: 'whispers', label: 'Whispers sent', value: whispers },
          { key: 'handouts', label: 'Handouts', value: handouts },
          { key: 'awards', label: 'Awards given', value: awards },
        ],
      },
      {
        key: 'characters',
        title: 'Characters',
        line: 'Sheets, and how far along they are.',
        metrics: [
          { key: 'total', label: 'Characters', value: characterCount },
          {
            key: 'seated',
            label: 'Seated at a table',
            value: seated,
            hint: 'A table copy. The original stays on its owner’s shelf.',
          },
          { key: 'blueprints', label: 'Unseated originals', value: blueprints },
          {
            key: 'drafts',
            label: 'Unfinished drafts',
            value: drafts,
            ...(drafts > 0 ? { tone: 'warn' as const } : {}),
          },
          {
            key: 'avgLevel',
            label: 'Average level',
            value: Math.round(avgLevel * 10) / 10,
          },
          { key: 'homebrewed', label: 'Using homebrew', value: withHomebrew },
        ],
      },
      {
        key: 'world',
        title: 'World and records',
        line: 'Everything the tables have written down.',
        metrics: [
          { key: 'quests', label: 'Quests', value: quests },
          { key: 'clocks', label: 'Clocks', value: clocks },
          { key: 'canon', label: 'Canon entries', value: canon },
          { key: 'notes', label: 'Notebook pages', value: notes },
          { key: 'journals', label: 'Journal entries', value: journals },
          { key: 'downtime', label: 'Downtime actions', value: downtime },
          { key: 'maps', label: 'Region maps', value: maps },
          { key: 'loot', label: 'Loot entries', value: loot },
          { key: 'shops', label: 'Shops', value: shops },
        ],
      },
      {
        key: 'boards',
        title: 'Battle boards',
        line: 'Rooms built, and what is standing on them.',
        metrics: [
          { key: 'boards', label: 'Boards', value: boards },
          { key: 'inPlay', label: 'In play', value: boardsInPlay },
          { key: 'shared', label: 'Visible to a party', value: boardsShared },
          { key: 'tokens', label: 'Tokens placed', value: tokens },
        ],
      },
      {
        key: 'content',
        title: 'Content and library',
        line: 'What people have forged, and where it has gone.',
        metrics: [
          { key: 'forged', label: 'Homebrew pieces', value: forgedCount },
          { key: 'public', label: 'Marked public', value: forgedPublic },
          {
            key: 'pending',
            label: 'Waiting on a DM',
            value: pendingApprovals,
            ...(pendingApprovals > 0 ? { tone: 'warn' as const } : {}),
          },
          { key: 'approved', label: 'Approved', value: approvedApprovals },
          { key: 'denied', label: 'Denied', value: deniedApprovals },
          { key: 'published', label: 'Library listings', value: published },
          { key: 'adopted', label: 'Adoptions', value: adopted },
        ],
      },
    ],
    breakdowns: [
      {
        key: 'homebrew-type',
        title: 'Homebrew by type',
        line: 'Every forged piece, by what it is.',
        unit: 'pieces',
        rows: byType,
      },
      {
        key: 'character-class',
        title: 'Characters by class',
        line: 'The fifteen commonest.',
        unit: 'characters',
        rows: byClass.slice(0, 15),
      },
      {
        key: 'character-species',
        title: 'Characters by species',
        line: 'The fifteen commonest.',
        unit: 'characters',
        rows: bySpecies.slice(0, 15),
      },
      {
        key: 'character-level',
        title: 'Characters by level',
        line: 'Where this install actually plays.',
        unit: 'characters',
        rows: levelRows.map(r => ({ label: `Level ${r.k}`, value: r.n })),
      },
      {
        key: 'publication-kind',
        title: 'Library listings by kind',
        line: 'What people are publishing.',
        unit: 'listings',
        rows: byPublicationKind,
      },
    ],
    series: [
      {
        key: 'signups',
        title: 'New accounts',
        line: 'One bar a day, for the last thirty.',
        unit: 'accounts',
        points: fill(days30, signupRows, d => d.slice(8)),
      },
      {
        key: 'rolls',
        title: 'Dice rolled',
        line: 'The closest thing this install has to “is anybody playing”.',
        unit: 'rolls',
        points: fill(days30, rollRows, d => d.slice(8)),
      },
      {
        key: 'sessions',
        title: 'Sessions played',
        line: 'One bar a month, for the last twelve.',
        unit: 'sessions',
        points: fill(months12, sessionRows, m => m.slice(5)),
      },
    ],
    storage: {
      kinds: [
        { label: 'Campaign images', ...images },
        { label: 'Character portraits', ...portraits },
        { label: 'Sound', ...audioFiles },
        { label: 'Library assets', ...libraryAssets },
      ],
      onDisk,
      database,
    },
    busiestCampaigns,
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
  /** Pieces of homebrew they have forged. */
  forged: number;
  /** The most recent thing they wrote, across rolls, sheets and homebrew. */
  lastSeen: string | null;
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

  const [
    charCounts,
    memberships,
    owned,
    forged,
    lastRoll,
    lastSheet,
    lastForge,
  ] = await Promise.all([
    db
      .select({ id: characters.ownerId, n: count() })
      .from(characters)
      .groupBy(characters.ownerId),
    db
      .select({ id: campaignMembers.userId, n: count() })
      .from(campaignMembers)
      .groupBy(campaignMembers.userId),
    db
      .select({ id: campaigns.gmId, n: count() })
      .from(campaigns)
      .groupBy(campaigns.gmId),
    db
      .select({ id: homebrew.ownerId, n: count() })
      .from(homebrew)
      .groupBy(homebrew.ownerId),
    db
      .select({
        id: campaignRolls.actorUserId,
        at: sql<string>`max(${campaignRolls.createdAt})`,
      })
      .from(campaignRolls)
      .groupBy(campaignRolls.actorUserId),
    db
      .select({
        id: characters.ownerId,
        at: sql<string>`max(${characters.updatedAt})`,
      })
      .from(characters)
      .groupBy(characters.ownerId),
    db
      .select({
        id: homebrew.ownerId,
        at: sql<string>`max(${homebrew.updatedAt})`,
      })
      .from(homebrew)
      .groupBy(homebrew.ownerId),
  ]);

  const chars = new Map(charCounts.map(r => [r.id, r.n]));
  const inTables = new Map(memberships.map(r => [r.id, r.n]));
  const runs = new Map(owned.map(r => [r.id, r.n]));
  const forgedBy = new Map(forged.map(r => [r.id, r.n]));

  const seen = new Map<string, string>();
  for (const list of [lastRoll, lastSheet, lastForge]) {
    for (const row of list) {
      if (!row.id || !row.at) continue;
      const current = seen.get(row.id);
      if (!current || row.at > current) seen.set(row.id, row.at);
    }
  }

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
    forged: forgedBy.get(r.id) ?? 0,
    lastSeen: seen.get(r.id) ?? null,
  }));
}

/** Disable an account, or enable it again. Never the operator's own. */
export async function setUserDisabled(
  userId: string,
  disabled: boolean
): Promise<void> {
  const me = await requireSuperAdmin();
  // Locking yourself out of the install you run is not a feature.
  if (userId === me) throw new Error('NOT_YOURSELF');
  await db
    .update(users)
    .set({ disabledAt: disabled ? new Date().toISOString() : null })
    .where(eq(users.id, userId));
}

/**
 * Grant or revoke super admin.
 *
 * Revoking does not stick for an address named in `ADMIN_EMAILS`:
 * `syncEnvAdmins` grants it back on the next check, by design. The caller is
 * told, so the page can say so rather than appearing to have done nothing.
 */
export async function setUserSuperAdmin(
  userId: string,
  isAdmin: boolean
): Promise<{ overriddenByEnv: boolean }> {
  const me = await requireSuperAdmin();
  if (userId === me && !isAdmin) throw new Error('NOT_YOURSELF');

  const row = await db.query.users.findFirst({
    columns: { email: true },
    where: eq(users.id, userId),
  });
  if (!row) throw new Error('NOT_FOUND');

  await db
    .update(users)
    .set({ isSuperAdmin: isAdmin })
    .where(eq(users.id, userId));

  return {
    overriddenByEnv:
      !isAdmin && envAdmins().includes(row.email.trim().toLowerCase()),
  };
}

/**
 * Mark an address verified by hand.
 *
 * Self-hosted installs often have no outbound mail at all — the mail outbox
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
