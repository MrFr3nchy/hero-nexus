import 'server-only';

import { after } from 'next/server';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignDiscord,
  campaignMembers,
  campaigns,
  campaignSessions,
} from '@/db/schema';
import {
  discordDate,
  maskWebhookUrl,
  normalizeDiscordEvents,
  reminderDue,
  validateDiscordUserId,
  validateWebhookUrl,
  type DiscordEvents,
  type DiscordTrigger,
} from '@/@creator/campaign/lib/discord';
import { appUrl } from './app-url';
import { requireCampaignRole } from './campaigns';
import { rateLimit } from './rate-limit';

/**
 * Discord notifications: one channel webhook per campaign, campaign-wide
 * announcements only.
 *
 * Every post is fire-and-forget after the write that caused it has
 * committed. A Discord outage, a deleted webhook or a slow network must never
 * stop a session from opening, so nothing here throws into its caller: a
 * failure is logged, written to `last_error` for the card, and forgotten.
 *
 * **Only what a player could already see is posted.** Session titles and
 * dates, a shared recap's existence, a poll's existence, a hero's name and
 * level. Never prep, never a DM body, never a recap draft. Mentions are
 * always explicit (`allowed_mentions.parse: []`), so a session titled
 * "@everyone" cannot ping a server.
 */

const TIMEOUT_MS = 5000;
/** The longest `retry_after` worth waiting out once, in seconds. */
const MAX_RETRY_WAIT = 10;

export interface DiscordSettingsView {
  configured: boolean;
  /** `…/webhooks/123/••••abcd`, never the URL itself. */
  masked: string | null;
  events: DiscordEvents;
  lastError: string | null;
}

/* --- the card ---------------------------------------------------------- */

export async function getDiscordSettings(
  campaignId: string
): Promise<DiscordSettingsView> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const row = await db.query.campaignDiscord.findFirst({
    where: eq(campaignDiscord.campaignId, campaignId),
  });
  return {
    configured: Boolean(row),
    masked: row ? maskWebhookUrl(row.webhookUrl) : null,
    events: normalizeDiscordEvents(row?.events),
    lastError: row?.lastError ?? null,
  };
}

/**
 * Save the card. `webhookUrl`: a new URL replaces the old one; `undefined`
 * keeps it (the field shows a mask, so an untouched field must not erase
 * anything); `null` disconnects the channel.
 */
export async function saveDiscordSettings(
  campaignId: string,
  input: { webhookUrl?: string | null; events?: Partial<DiscordEvents> }
): Promise<DiscordSettingsView> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const row = await db.query.campaignDiscord.findFirst({
    where: eq(campaignDiscord.campaignId, campaignId),
  });

  if (input.webhookUrl === null) {
    await db
      .delete(campaignDiscord)
      .where(eq(campaignDiscord.campaignId, campaignId));
    return getDiscordSettings(campaignId);
  }

  const events = {
    ...normalizeDiscordEvents(row?.events),
    ...(input.events ?? {}),
  };
  const now = new Date().toISOString();

  if (input.webhookUrl !== undefined) {
    const url = validateWebhookUrl(input.webhookUrl);
    if (!url) throw new Error('BAD_WEBHOOK');
    await db
      .insert(campaignDiscord)
      .values({ campaignId, webhookUrl: url, events, updatedAt: now })
      .onConflictDoUpdate({
        target: campaignDiscord.campaignId,
        set: { webhookUrl: url, events, lastError: null, updatedAt: now },
      });
  } else if (row) {
    await db
      .update(campaignDiscord)
      .set({ events, updatedAt: now })
      .where(eq(campaignDiscord.campaignId, campaignId));
  } else {
    throw new Error('NO_WEBHOOK');
  }
  return getDiscordSettings(campaignId);
}

/**
 * Send a test line, synchronously, so the DM sees the error if there is one.
 * Rate-limited per campaign: it is a button, and Discord rate-limits the
 * webhook, not us.
 */
export async function sendDiscordTest(
  campaignId: string
): Promise<{ ok: boolean; error: string | null }> {
  const { campaign } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  if (!rateLimit(`discord-test:${campaignId}`, 5, 60_000).ok) {
    throw new Error('RATE_LIMITED');
  }
  return post(campaignId, {
    content: `Hero Nexus is connected to this channel for **${campaign.name}**.`,
    mentions: [],
    force: true,
  });
}

/** A member's own Discord id, so posts can mention them. Null clears it. */
export async function setMyDiscordUserId(
  campaignId: string,
  discordUserId: string | null
): Promise<void> {
  const { userId, role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  // The GM of a campaign is not a member row; there is nothing to mention.
  if (role === 'gm') throw new Error('FORBIDDEN');
  const id =
    discordUserId === null || discordUserId.trim() === ''
      ? null
      : validateDiscordUserId(discordUserId);
  if (discordUserId && discordUserId.trim() && !id) {
    throw new Error('BAD_DISCORD_ID');
  }
  await db
    .update(campaignMembers)
    .set({ discordUserId: id })
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      )
    );
}

/**
 * The caller's own Discord id at this table, for their field, and whether
 * the table has a channel at all — the field is noise at a table without
 * one. Whether a channel exists is not a secret; its URL is.
 */
export async function getMyDiscord(
  campaignId: string
): Promise<{ connected: boolean; discordUserId: string | null }> {
  const { userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const row = await db.query.campaignMembers.findFirst({
    columns: { discordUserId: true },
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  return {
    connected: await hasChannel(campaignId),
    discordUserId: row?.discordUserId ?? null,
  };
}

/* --- posting ----------------------------------------------------------- */

interface Post {
  content: string;
  /** Discord user ids to mention. Nobody else can be pinged. */
  mentions: string[];
  /** Post even when the trigger is off — the test button. */
  force?: boolean;
  trigger?: DiscordTrigger;
}

/**
 * POST one message. Returns the outcome rather than throwing; writes
 * `last_error` on failure and clears it on success.
 */
async function post(
  campaignId: string,
  message: Post
): Promise<{ ok: boolean; error: string | null }> {
  const row = await db.query.campaignDiscord.findFirst({
    where: eq(campaignDiscord.campaignId, campaignId),
  });
  if (!row) return { ok: false, error: 'No Discord channel is connected.' };
  if (!message.force && message.trigger) {
    if (!normalizeDiscordEvents(row.events)[message.trigger]) {
      return { ok: true, error: null };
    }
  }

  const mentions = [...new Set(message.mentions)].slice(0, 100);
  const pings = mentions.map(id => `<@${id}>`).join(' ');
  const body = JSON.stringify({
    content: (pings ? `${message.content}\n${pings}` : message.content).slice(
      0,
      2000
    ),
    allowed_mentions: { parse: [], users: mentions },
  });

  let error: string | null = null;
  try {
    let res = await send(row.webhookUrl, body);
    if (res.status === 429) {
      const wait = await retryAfter(res);
      if (wait !== null && wait <= MAX_RETRY_WAIT) {
        await new Promise(r => setTimeout(r, wait * 1000));
        res = await send(row.webhookUrl, body);
      }
    }
    if (!res.ok) {
      error =
        res.status === 404 || res.status === 401
          ? 'Discord says this webhook no longer exists. Paste a new one.'
          : res.status === 429
            ? 'Discord is rate-limiting this webhook. Try again in a minute.'
            : `Discord answered ${res.status}.`;
    }
  } catch (err) {
    error =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'Discord did not answer within 5 seconds.'
        : 'Could not reach Discord.';
  }

  if (error) {
    console.error(`[discord] campaign ${campaignId}: ${error}`);
  }
  await db
    .update(campaignDiscord)
    .set({ lastError: error })
    .where(eq(campaignDiscord.campaignId, campaignId));
  return { ok: !error, error };
}

function send(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });
}

async function retryAfter(res: Response): Promise<number | null> {
  const header = Number(res.headers.get('retry-after'));
  try {
    const json = (await res.json()) as { retry_after?: unknown };
    if (typeof json.retry_after === 'number') return json.retry_after;
  } catch {
    // Not JSON; fall back to the header.
  }
  return Number.isFinite(header) ? header : null;
}

/**
 * Post after the response, never blocking or failing the write that caused
 * it. Outside a request (the reminder loop) `after()` is unavailable, and the
 * post simply runs detached.
 */
function later(campaignId: string, build: () => Promise<Post | null>): void {
  const run = async () => {
    try {
      const message = await build();
      if (message) await post(campaignId, message);
    } catch (err) {
      console.error(`[discord] campaign ${campaignId}:`, err);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

async function hasChannel(campaignId: string): Promise<boolean> {
  const row = await db.query.campaignDiscord.findFirst({
    columns: { campaignId: true },
    where: eq(campaignDiscord.campaignId, campaignId),
  });
  return Boolean(row);
}

async function campaignName(campaignId: string): Promise<string> {
  const row = await db.query.campaigns.findFirst({
    columns: { name: true },
    where: eq(campaigns.id, campaignId),
  });
  return row?.name ?? 'The campaign';
}

/** Discord ids of the table's members, or of the given users only. */
async function mentionIds(
  campaignId: string,
  userIds?: string[]
): Promise<string[]> {
  if (userIds && userIds.length === 0) return [];
  const rows = await db
    .select({ id: campaignMembers.discordUserId })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active'),
        isNotNull(campaignMembers.discordUserId),
        ...(userIds ? [inArray(campaignMembers.userId, userIds)] : [])
      )
    );
  return rows.map(r => r.id).filter((id): id is string => Boolean(id));
}

function sessionLabel(number: number, title: string): string {
  return title ? `Session ${number} · ${title}` : `Session ${number}`;
}

/* --- the moments -------------------------------------------------------- */

/** A session was given a date, or its date moved. */
export function announceScheduled(
  campaignId: string,
  session: { number: number; title: string; scheduledFor: string },
  moved: boolean
): void {
  later(campaignId, async () => {
    if (!(await hasChannel(campaignId))) return null;
    const name = await campaignName(campaignId);
    const when = discordDate(session.scheduledFor);
    return {
      trigger: 'schedule',
      content: `**${name}** — ${sessionLabel(session.number, session.title)} ${
        moved ? 'has moved to' : 'is set for'
      } ${when}.\n${appUrl(`/campaigns/${campaignId}`)}`,
      mentions: [],
    };
  });
}

/** The table sat down. */
export function announceStarting(
  campaignId: string,
  session: { number: number; title: string }
): void {
  later(campaignId, async () => {
    if (!(await hasChannel(campaignId))) return null;
    const name = await campaignName(campaignId);
    return {
      trigger: 'start',
      content: `**${name}** — ${sessionLabel(session.number, session.title)} is starting now.\n${appUrl(
        `/campaigns/${campaignId}/screen`
      )}`,
      mentions: await mentionIds(campaignId),
    };
  });
}

/** A recap went from draft to shared. Says it exists; never quotes it. */
export function announceRecap(
  campaignId: string,
  session: { number: number; title: string }
): void {
  later(campaignId, async () => {
    if (!(await hasChannel(campaignId))) return null;
    const name = await campaignName(campaignId);
    return {
      trigger: 'recap',
      content: `**${name}** — the recap of ${sessionLabel(session.number, session.title)} is up.\n${appUrl(
        `/campaigns/${campaignId}`
      )}`,
      mentions: [],
    };
  });
}

/** A date poll opened, or was settled on a day. */
export function announcePoll(
  campaignId: string,
  session: { number: number; title: string },
  settledOn: string | null
): void {
  later(campaignId, async () => {
    if (!(await hasChannel(campaignId))) return null;
    const name = await campaignName(campaignId);
    const label = sessionLabel(session.number, session.title);
    return {
      trigger: 'poll',
      content: settledOn
        ? `**${name}** — the date poll is settled: ${label} is on ${discordDate(settledOn)}.\n${appUrl(
            `/campaigns/${campaignId}`
          )}`
        : `**${name}** — when can you play ${label}? A date poll is open.\n${appUrl(
            `/campaigns/${campaignId}`
          )}`,
      mentions: settledOn ? [] : await mentionIds(campaignId),
    };
  });
}

/** A hero crossed a level threshold. */
export function announceLevelUp(
  campaignId: string,
  hero: { name: string; level: number; ownerId: string }
): void {
  later(campaignId, async () => {
    if (!(await hasChannel(campaignId))) return null;
    const name = await campaignName(campaignId);
    return {
      trigger: 'levelup',
      content: `**${name}** — ${hero.name} has enough experience to reach level ${hero.level}.`,
      mentions: await mentionIds(campaignId, [hero.ownerId]),
    };
  });
}

/** The DM put the party's next stop on a shared map. */
export function announceJourney(
  campaignId: string,
  stop: {
    mapTitle: string;
    label: string | null;
    seq: number;
    worldDate: string | null;
  }
): void {
  later(campaignId, async () => {
    if (!(await hasChannel(campaignId))) return null;
    const name = await campaignName(campaignId);
    const where = stop.label ? `reached ${stop.label}` : 'moved on';
    const when = stop.worldDate ? `, ${stop.worldDate}` : '';
    return {
      trigger: 'journey',
      content: `**${name}** — the party ${where} (stop ${stop.seq} on ${stop.mapTitle}${when}).\n${appUrl(
        `/campaigns/${campaignId}#canon`
      )}`,
      mentions: [],
    };
  });
}

/* --- the reminder loop ---------------------------------------------------- */

/**
 * Post the day-ahead reminder for every planned session that is due one.
 *
 * `reminded_at` is set *before* posting, so a crash between the two loses a
 * reminder rather than sending it twice — a missed reminder is a shrug, a
 * double one is spam. The conditional update is the claim: of two overlapping
 * runs, only one sees its write land.
 */
export async function sendDueReminders(now = Date.now()): Promise<number> {
  const rows = await db
    .select({
      id: campaignSessions.id,
      campaignId: campaignSessions.campaignId,
      number: campaignSessions.number,
      title: campaignSessions.title,
      scheduledFor: campaignSessions.scheduledFor,
    })
    .from(campaignSessions)
    .innerJoin(
      campaignDiscord,
      eq(campaignDiscord.campaignId, campaignSessions.campaignId)
    )
    .where(
      and(
        eq(campaignSessions.status, 'planned'),
        isNotNull(campaignSessions.scheduledFor),
        isNull(campaignSessions.remindedAt)
      )
    );

  let sent = 0;
  for (const s of rows) {
    if (!s.scheduledFor || !reminderDue(s.scheduledFor, now)) continue;
    const claimed = await db
      .update(campaignSessions)
      .set({ remindedAt: new Date(now).toISOString() })
      .where(
        and(eq(campaignSessions.id, s.id), isNull(campaignSessions.remindedAt))
      )
      .returning({ id: campaignSessions.id });
    if (claimed.length === 0) continue;
    const name = await campaignName(s.campaignId);
    await post(s.campaignId, {
      trigger: 'reminder',
      content: `**${name}** — reminder: ${sessionLabel(s.number, s.title)} is ${discordDate(
        s.scheduledFor
      )}.\n${appUrl(`/campaigns/${s.campaignId}`)}`,
      mentions: await mentionIds(s.campaignId),
    });
    sent += 1;
  }
  return sent;
}
