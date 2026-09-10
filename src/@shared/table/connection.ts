'use client';

/**
 * One live connection per table, per browser.
 *
 * `DmScreen` already makes this argument about polling — _"Mounting three
 * panels that each poll would be three requests every three seconds for one
 * answer"_ — and it applies harder to a held socket. So the `EventSource` is
 * owned here, at module scope, and everything that wants the table's traffic
 * joins the same one: the live-state hook, the announcement layer, the feed
 * panel, whatever comes next.
 *
 * Module scope rather than React state on purpose. A ref-counted resource
 * whose lifetime must survive React's mount/unmount churn — StrictMode
 * double-mounts every effect in development — is not a thing to keep in a
 * context value. The grace period below is what makes that churn free.
 */
import type { TableEvent } from './events';
import { TABLE_EVENT_KINDS } from './events';

/** Who the reader is at this table, read once when the stream opens. */
export interface Seat {
  role: 'gm' | 'co-gm' | 'player';
  /** The reader's own character here, so "Your turn" can be said as such. */
  characterId: string | null;
}

/** What a joiner is told. Connection status is a frame like any other. */
export type Frame =
  | { kind: 'open'; seat: Seat }
  | { kind: 'closed' }
  /** Something changed. Deliberately carries no payload — re-read instead. */
  | { kind: 'state'; version: number }
  /** The gap was longer than the server's buffer; nothing can be replayed. */
  | { kind: 'resync' }
  | { kind: 'event'; event: TableEvent };

type Listener = (frame: Frame) => void;

interface Channel {
  source: EventSource | null;
  listeners: Set<Listener>;
  connected: boolean;
  seat: Seat | null;
  /** Set while the last joiner has left but the socket is being held open. */
  reaper: ReturnType<typeof setTimeout> | null;
}

/**
 * How long a channel outlives its last joiner.
 *
 * Long enough to cover a route change and React's development double-mount,
 * short enough that closing the table really does let go of the socket.
 * Without it, moving between the campaign page and the screen tears down a
 * connection and opens a new one for no reason.
 */
const GRACE_MS = 5_000;

const channels = new Map<string, Channel>();

function channelFor(campaignId: string): Channel {
  let channel = channels.get(campaignId);
  if (!channel) {
    channel = {
      source: null,
      listeners: new Set(),
      connected: false,
      seat: null,
      reaper: null,
    };
    channels.set(campaignId, channel);
  }
  return channel;
}

function emit(channel: Channel, frame: Frame): void {
  // Copied first: a listener may leave in response to what it is told, and
  // mutating the set mid-iteration silently skips the next one.
  for (const listener of [...channel.listeners]) listener(frame);
}

function open(campaignId: string): void {
  const channel = channelFor(campaignId);
  if (channel.source) return;

  const source = new EventSource(`/api/campaigns/${campaignId}/live`);
  channel.source = source;

  source.addEventListener('hello', message => {
    channel.connected = true;
    try {
      const data = JSON.parse((message as MessageEvent).data);
      channel.seat = {
        role: data?.role ?? 'player',
        characterId: data?.characterId ?? null,
      };
    } catch {
      channel.seat = { role: 'player', characterId: null };
    }
    emit(channel, { kind: 'open', seat: channel.seat });
  });

  source.addEventListener('state', message => {
    let version = 0;
    try {
      version = Number(JSON.parse((message as MessageEvent).data)?.v ?? 0);
    } catch {
      // A frame we cannot read is still a frame saying something changed.
    }
    emit(channel, { kind: 'state', version });
  });

  source.addEventListener('resync', () => emit(channel, { kind: 'resync' }));

  for (const kind of TABLE_EVENT_KINDS) {
    source.addEventListener(kind, message => {
      try {
        const event = JSON.parse((message as MessageEvent).data) as TableEvent;
        emit(channel, { kind: 'event', event });
      } catch {
        // A malformed announcement is dropped rather than drawn. The state it
        // came from is still readable, which is the whole reason a moment is
        // allowed to be missed.
      }
    });
  }

  /*
   * `EventSource` reconnects on its own and re-sends `Last-Event-ID`, so this
   * is a status change rather than a failure to handle. Consumers use it to
   * fall back to polling; nothing here retries, because a hand-rolled retry
   * beside the built-in one is how a dropped server gets hammered.
   */
  source.onerror = () => {
    if (!channel.connected) return;
    channel.connected = false;
    emit(channel, { kind: 'closed' });
  };
}

function close(campaignId: string): void {
  const channel = channels.get(campaignId);
  if (!channel) return;
  channel.source?.close();
  channel.source = null;
  channel.connected = false;
  channels.delete(campaignId);
}

/**
 * Listen to one table. Returns the leave, which the caller must run on
 * unmount — a listener that is never removed keeps the socket open for the
 * life of the tab.
 */
export function joinTable(campaignId: string, listener: Listener): () => void {
  const channel = channelFor(campaignId);
  if (channel.reaper) {
    clearTimeout(channel.reaper);
    channel.reaper = null;
  }
  channel.listeners.add(listener);
  open(campaignId);
  // A latecomer is told where it stands rather than waiting for the next
  // frame: joining an already-open channel must not look like a dead one.
  if (channel.connected && channel.seat) {
    listener({ kind: 'open', seat: channel.seat });
  }

  return () => {
    channel.listeners.delete(listener);
    if (channel.listeners.size > 0) return;
    channel.reaper = setTimeout(() => {
      const current = channels.get(campaignId);
      if (!current || current.listeners.size > 0) return;
      close(campaignId);
    }, GRACE_MS);
  };
}

/** Whether the stream is up. Consumers poll faster when it is not. */
export function isTableConnected(campaignId: string): boolean {
  return channels.get(campaignId)?.connected ?? false;
}
