/**
 * Discord notifications — the pure half.
 *
 * A campaign may name one Discord channel webhook; the server posts a short
 * line there for table-level moments. What lives here is what both sides of
 * the wire read: which moments exist, what they are called on the card, what
 * a webhook URL must look like, and how a stored one is shown back. The
 * posting is `server/discord.ts`.
 *
 * Pure: no React, no server, no database.
 */

/** Every moment the channel can be told about. */
export const DISCORD_TRIGGERS = [
  'schedule',
  'reminder',
  'start',
  'recap',
  'poll',
  'levelup',
] as const;

export type DiscordTrigger = (typeof DISCORD_TRIGGERS)[number];

/** The card's label for each, in the order the card lists them. */
export const DISCORD_TRIGGER_LABELS: Record<DiscordTrigger, string> = {
  schedule: 'A session is scheduled or moved',
  reminder: 'A day before a session',
  start: 'A session starts',
  recap: 'A recap is shared',
  poll: 'A date poll opens or settles',
  levelup: 'A hero earns a level',
};

export type DiscordEvents = Record<DiscordTrigger, boolean>;

/** Read the stored toggles. A missing key is on: a new trigger arrives on. */
export function normalizeDiscordEvents(raw: unknown): DiscordEvents {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const out = {} as DiscordEvents;
  for (const t of DISCORD_TRIGGERS) out[t] = r[t] !== false;
  return out;
}

const WEBHOOK_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'canary.discord.com',
  'ptb.discord.com',
]);

const WEBHOOK_PATH = /^\/api\/webhooks\/\d+\/[\w-]+$/;

/**
 * The webhook URL in its one accepted shape, or null.
 *
 * This is the first URL a user hands the server to fetch, so it doubles as
 * the SSRF guard: `https:`, one of Discord's own hosts, no port, no
 * credentials, and the webhook path and nothing else. A query string or a
 * fragment is dropped rather than refused — Discord's "Copy Webhook URL"
 * never adds one, but `?wait=true` pasted from the docs is harmless.
 */
export function validateWebhookUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  if (!WEBHOOK_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (!WEBHOOK_PATH.test(url.pathname)) return null;
  return `https://${url.hostname.toLowerCase()}${url.pathname}`;
}

/**
 * How a stored webhook is shown back: enough to recognise, not enough to use.
 * `…/webhooks/123/••••abcd`.
 */
export function maskWebhookUrl(url: string): string {
  const m = /\/webhooks\/(\d+)\/([\w-]+)$/.exec(url);
  if (!m) return '••••';
  return `…/webhooks/${m[1]}/••••${m[2].slice(-4)}`;
}

/** A Discord user id is a snowflake: 17 to 20 digits. */
export function validateDiscordUserId(input: string): string | null {
  const id = input.trim();
  return /^\d{17,20}$/.test(id) ? id : null;
}

/**
 * When a session's day-ahead reminder is due.
 *
 * `scheduled_for` is usually a bare date ("2026-10-10") and sometimes an
 * instant. A bare date is a whole day, so the reminder is due from 24 hours
 * before that day begins until it ends; an instant, from 24 hours before
 * it until it arrives. Either way a reminder never goes out for something
 * already past.
 */
export function reminderDue(scheduledFor: string, now: number): boolean {
  const at = Date.parse(scheduledFor);
  if (Number.isNaN(at)) return false;
  const day = 24 * 60 * 60 * 1000;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(scheduledFor.trim());
  return now >= at - day && now < at + (dateOnly ? day : 0);
}

/**
 * A scheduled date as the channel reads it.
 *
 * A bare date is written out in words, in UTC so it is the day the DM
 * picked. An instant uses Discord's own timestamp markup, which each reader
 * sees in their own time zone.
 */
export function discordDate(scheduledFor: string): string {
  const s = scheduledFor.trim();
  const at = Date.parse(s);
  if (Number.isNaN(at)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(at).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  return `<t:${Math.floor(at / 1000)}:F>`;
}
