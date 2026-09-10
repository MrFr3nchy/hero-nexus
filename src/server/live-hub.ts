/**
 * The table's broadcast hub.
 *
 * Deliberately process-local, held on `globalThis`: this app runs as a single
 * Node process on a single droplet (see `docs/ops/security-decisions.md`), so
 * there is no second instance to coordinate with and nothing to put in Redis.
 * The same licence `src/server/rate-limit.ts` claims in its header, and the
 * same pin `src/db/index.ts` uses for the SQLite connection.
 *
 * If the deployment ever grows a second instance this becomes wrong at exactly
 * the moment `rate-limit.ts` does. That coupling is useful: they fail together
 * and they are fixed together.
 *
 * Two different things travel over one connection, and conflating them is the
 * mistake this file exists to avoid:
 *
 * - **State** is what is true now. It is re-readable and safe to miss, so the
 *   hub sends only a version number and lets the browser re-read through the
 *   role-filtered path it already calls. Nothing about the state is composed
 *   into a broadcast, which is what makes a leak impossible rather than
 *   merely unlikely — `getLiveState` stays the only place secrecy is decided.
 * - **An event** is a moment. Missing one is acceptable because the state it
 *   produced is still readable; seeing one twice is not, because an
 *   announcement claims something just happened. Events carry content, so
 *   every one of them carries an audience decided here on the server.
 *
 * See `docs/handoff/the-same-room/README.md`, model decisions 1–4.
 */
import 'server-only';

import type { CampaignRole } from './campaigns';
import type { TableEvent } from '@/@shared/table/events';

/* --- who an event is for ---------------------------------------------- */

/**
 * Who may receive an event.
 *
 * Decided by the writer at publish time and applied in `reaches` below —
 * one rule, in one place. A payload must be safe for its audience; where
 * there is any doubt, publish a kind and an id and let the browser re-read.
 */
export type Audience = 'everyone' | 'staff' | { users: string[] };

export function reaches(
  audience: Audience,
  viewer: { userId: string; role: CampaignRole }
): boolean {
  if (audience === 'everyone') return true;
  if (audience === 'staff') {
    return viewer.role === 'gm' || viewer.role === 'co-gm';
  }
  // Staff see everything addressed at anybody at their own table: a DM who
  // cannot see the check they just pushed cannot tell whether it landed.
  if (viewer.role === 'gm' || viewer.role === 'co-gm') return true;
  return audience.users.includes(viewer.userId);
}

/* --- subscribers ------------------------------------------------------ */

export interface Subscriber {
  /** Unique per connection, not per user: one person may have four tabs. */
  id: string;
  userId: string;
  role: CampaignRole;
  /** Display name, so presence can say who is looking without a second read. */
  name: string;
  /** Writes a raw SSE frame. Must not throw; a closed stream is a no-op. */
  send(frame: string): void;
  since: number;
}

interface BufferedEvent {
  seq: number;
  audience: Audience;
  event: TableEvent;
}

interface Channel {
  /** Bumped on every write that changes what `getLiveState` would return. */
  version: number;
  /** Monotonic, echoed as the SSE `id:` so a reconnect can ask for a replay. */
  seq: number;
  buffer: BufferedEvent[];
  subscribers: Map<string, Subscriber>;
  /** Set while a coalesced state nudge is pending. */
  flush: ReturnType<typeof setTimeout> | null;
  /** Last time anything happened here, for the sweeper. */
  touched: number;
}

/**
 * How many moments a channel remembers.
 *
 * Only ever read by a browser that dropped and came back, and only to redraw
 * announcements it missed. Two hundred is far more than a reconnect gap and
 * still nothing on a droplet; past it, a client is told to resync rather than
 * handed a partial story.
 */
const BUFFER_LIMIT = 200;

/**
 * Bumps inside this window become one nudge.
 *
 * `addPartyToEncounter` writes five rows in a loop and `restParty` writes one
 * per character. Coalescing here means every caller can bump freely without
 * knowing whether it is in a loop — which is the only way a rule like "bump
 * after every write" survives contact with the next person to add a write.
 */
const COALESCE_MS = 40;

/** An idle channel is dropped after this long. Its buffer goes with it. */
const IDLE_MS = 10 * 60 * 1000;

const globalForHub = globalThis as unknown as {
  __heroNexusLiveHub?: Map<string, Channel>;
  __heroNexusLiveSweeper?: ReturnType<typeof setInterval>;
};

const channels: Map<string, Channel> = (globalForHub.__heroNexusLiveHub ??=
  new Map());

function ensureSweeper() {
  if (globalForHub.__heroNexusLiveSweeper) return;
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [id, channel] of channels) {
      if (channel.subscribers.size > 0) continue;
      if (now - channel.touched < IDLE_MS) continue;
      if (channel.flush) clearTimeout(channel.flush);
      channels.delete(id);
    }
  }, 60_000);
  sweeper.unref?.();
  globalForHub.__heroNexusLiveSweeper = sweeper;
}

function channelFor(campaignId: string): Channel {
  ensureSweeper();
  let channel = channels.get(campaignId);
  if (!channel) {
    channel = {
      version: 0,
      seq: 0,
      buffer: [],
      subscribers: new Map(),
      flush: null,
      touched: Date.now(),
    };
    channels.set(campaignId, channel);
  }
  channel.touched = Date.now();
  return channel;
}

/* --- frames ----------------------------------------------------------- */

/**
 * One SSE frame.
 *
 * `data` is always one line of JSON. Multi-line data is legal in the protocol
 * and is a source of subtle framing bugs; there is no reason to allow it.
 */
function frame(name: string, data: unknown, id?: number): string {
  const head = id === undefined ? '' : `id: ${id}\n`;
  return `${head}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A comment. Keeps intermediaries from reaping an idle connection. */
export function heartbeatFrame(): string {
  return `: ping ${Date.now()}\n\n`;
}

/* --- state ------------------------------------------------------------ */

/**
 * Say that something changed, without saying what.
 *
 * Called from the server modules **after the write commits**, never from an
 * action wrapper — a bump that lives in the wrapper is one that every future
 * writer forgets. The browser answers by re-reading `getLiveState`, which is
 * role-filtered, so nothing here has to know who is allowed to see what.
 */
export function bumpVersion(campaignId: string): void {
  const channel = channelFor(campaignId);
  channel.version += 1;
  if (channel.flush) return;
  channel.flush = setTimeout(() => {
    channel.flush = null;
    const text = frame('state', { v: channel.version });
    for (const sub of channel.subscribers.values()) sub.send(text);
  }, COALESCE_MS);
  channel.flush.unref?.();
}

export function versionOf(campaignId: string): number {
  return channels.get(campaignId)?.version ?? 0;
}

/* --- events ----------------------------------------------------------- */

/**
 * Announce a moment to the people it belongs to.
 *
 * The audience is applied here and nowhere else. A roll made behind the
 * screen publishes to `'staff'`; a check pushed at one player publishes to
 * that player (and to staff, per `reaches`). Nothing whose visibility is
 * interesting is composed into the payload — see the header.
 */
export function publish(
  campaignId: string,
  event: TableEvent,
  audience: Audience = 'everyone'
): void {
  const channel = channelFor(campaignId);
  channel.seq += 1;
  const seq = channel.seq;

  channel.buffer.push({ seq, audience, event });
  if (channel.buffer.length > BUFFER_LIMIT) {
    channel.buffer.splice(0, channel.buffer.length - BUFFER_LIMIT);
  }

  const text = frame(event.kind, event, seq);
  for (const sub of channel.subscribers.values()) {
    if (reaches(audience, sub)) sub.send(text);
  }
}

/**
 * What a returning browser missed, or `null` if it cannot be told honestly.
 *
 * Null means the gap is older than the buffer — after a deploy, or a very
 * long absence. The caller sends one `resync` instead: a partial story about
 * what just happened is worse than admitting the thread was lost, because the
 * state read that follows is authoritative either way.
 */
export function replaySince(
  campaignId: string,
  lastEventId: number,
  viewer: { userId: string; role: CampaignRole }
): string[] | null {
  const channel = channels.get(campaignId);
  if (!channel) return null;
  if (lastEventId >= channel.seq) return [];
  const oldest = channel.buffer[0]?.seq;
  if (oldest === undefined || oldest > lastEventId + 1) return null;
  return channel.buffer
    .filter(b => b.seq > lastEventId && reaches(b.audience, viewer))
    .map(b => frame(b.event.kind, b.event, b.seq));
}

/* --- subscribing ------------------------------------------------------ */

/** Who is looking, right now. Derived from held connections, never stored. */
export interface Watcher {
  userId: string;
  name: string;
  role: CampaignRole;
  since: number;
}

/**
 * Presence, one row per person rather than per connection.
 *
 * A player with the table open in two tabs is one person at the table, and
 * their arrival is the earlier of the two.
 */
export function watchersOf(campaignId: string): Watcher[] {
  const channel = channels.get(campaignId);
  if (!channel) return [];
  const byUser = new Map<string, Watcher>();
  for (const sub of channel.subscribers.values()) {
    const existing = byUser.get(sub.userId);
    if (existing) {
      existing.since = Math.min(existing.since, sub.since);
      continue;
    }
    byUser.set(sub.userId, {
      userId: sub.userId,
      name: sub.name,
      role: sub.role,
      since: sub.since,
    });
  }
  return [...byUser.values()].sort((a, b) => a.since - b.since);
}

/** How many connections one person is holding open. Used to cap them. */
export function connectionsHeldBy(campaignId: string, userId: string): number {
  const channel = channels.get(campaignId);
  if (!channel) return 0;
  let count = 0;
  for (const sub of channel.subscribers.values()) {
    if (sub.userId === userId) count += 1;
  }
  return count;
}

/**
 * Attach a connection. Returns the detach, which the route **must** call on
 * abort — a subscriber that is not removed on disconnect is a leak that
 * survives until the next deploy.
 */
export function subscribe(campaignId: string, sub: Subscriber): () => void {
  const channel = channelFor(campaignId);
  channel.subscribers.set(sub.id, sub);
  return () => {
    const current = channels.get(campaignId);
    if (!current) return;
    current.subscribers.delete(sub.id);
    current.touched = Date.now();
  };
}

/** The sequence a connection should treat as its starting point. */
export function currentSeq(campaignId: string): number {
  return channels.get(campaignId)?.seq ?? 0;
}
