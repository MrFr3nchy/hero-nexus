/**
 * The table's live stream.
 *
 * Server-Sent Events rather than a WebSocket, because the traffic is
 * one-directional — everything a browser sends is already a server action that
 * goes through `requireCampaignRole` — and a duplex socket under the App
 * Router would mean replacing `next start` with a custom server, which changes
 * the systemd unit, the build and the dev loop for no gain.
 *
 * What travels is in `src/server/live-hub.ts`. The short version: a state
 * frame says only that something changed and carries no payload at all, so
 * `getLiveState` stays the only place role-filtering happens; event frames
 * carry content and so carry an audience, applied in the hub.
 */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { campaignMembers, users } from '@/db/schema';
import { requireCampaignRole } from '@/server/campaigns';
import {
  connectionsHeldBy,
  currentSeq,
  heartbeatFrame,
  replaySince,
  subscribe,
  versionOf,
  type Subscriber,
} from '@/server/live-hub';
import { requestIp } from '@/server/http';
import { rateLimit } from '@/server/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A comment every 25s. Long enough to be quiet, short enough to survive a proxy. */
const HEARTBEAT_MS = 25_000;

/**
 * How many tabs one person may hold open at one table.
 *
 * Not a security limit — a member is allowed to watch their own table. It is a
 * resource limit on a one-vCPU droplet, where six players with a laptop, a
 * phone and a stale tab each is a real number and each connection is a held
 * socket for the length of a session.
 */
const MAX_CONNECTIONS_PER_USER = 6;

/** Opens per user, per minute. A reconnect storm is a bug, not a session. */
const OPEN_LIMIT = 30;
const OPEN_WINDOW_MS = 60_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  let userId: string;
  let role: Awaited<ReturnType<typeof requireCampaignRole>>['role'];
  try {
    ({ userId, role } = await requireCampaignRole(campaignId, [
      'gm',
      'co-gm',
      'player',
    ]));
  } catch {
    // A 404 rather than a 403: whether a campaign exists is not a stranger's
    // business, and the rest of this app answers the same way.
    return new Response('Not found', { status: 404 });
  }

  const gate = rateLimit(
    `live:${userId}:${requestIp(request)}`,
    OPEN_LIMIT,
    OPEN_WINDOW_MS
  );
  if (!gate.ok) {
    return new Response('Too many connections', {
      status: 429,
      headers: { 'Retry-After': String(gate.retryAfter) },
    });
  }

  if (connectionsHeldBy(campaignId, userId) >= MAX_CONNECTIONS_PER_USER) {
    return new Response('Too many open views of this table', { status: 429 });
  }

  const [person, seat] = await Promise.all([
    db.query.users.findFirst({
      columns: { name: true, email: true },
      where: eq(users.id, userId),
    }),
    /*
     * The viewer's seated character, read once at connect rather than on
     * every poll. It is what lets an announcement say "Your turn" instead of
     * naming somebody the reader has to recognise as themselves — and a seat
     * does not change mid-session, so once is the right number of times.
     */
    db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      ),
    }),
  ]);
  const name =
    person?.name?.trim() ||
    person?.email?.split('@')[0] ||
    (role === 'player' ? 'A player' : 'The DM');

  /*
   * `Last-Event-ID` is sent by `EventSource` itself on a reconnect. A gap the
   * buffer can still cover is replayed; one it cannot is answered with a
   * single `resync`, because a partial account of what happened is worse than
   * admitting the thread was lost — the state read that follows is
   * authoritative either way.
   */
  const lastSeen = Number(request.headers.get('last-event-id') ?? '');
  const resumeFrom = Number.isFinite(lastSeen) && lastSeen > 0 ? lastSeen : 0;

  const encoder = new TextEncoder();
  let detach: (() => void) | null = null;
  let beat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (frame: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // The consumer went away between the abort and our cleanup. Nothing
          // to report: `close` below is what actually tidies up.
          open = false;
        }
      };

      const sub: Subscriber = {
        id: randomUUID(),
        userId,
        role,
        name,
        send,
        since: Date.now(),
      };

      // Retry hint first, so a browser that drops mid-session comes back on a
      // sensible cadence rather than the 3s default.
      send('retry: 5000\n\n');

      const missed =
        resumeFrom > 0 ? replaySince(campaignId, resumeFrom, sub) : [];
      if (missed === null) {
        send(
          `event: resync\ndata: ${JSON.stringify({ from: resumeFrom })}\n\n`
        );
      } else {
        for (const frame of missed) send(frame);
      }

      send(
        `event: hello\ndata: ${JSON.stringify({
          v: versionOf(campaignId),
          seq: currentSeq(campaignId),
          role,
          characterId: seat?.characterId ?? null,
        })}\n\n`
      );

      detach = subscribe(campaignId, sub);

      beat = setInterval(() => send(heartbeatFrame()), HEARTBEAT_MS);
      beat.unref?.();

      const close = () => {
        if (!open) return;
        open = false;
        if (beat) clearInterval(beat);
        beat = null;
        detach?.();
        detach = null;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime. Nothing left to do.
        }
      };

      request.signal.addEventListener('abort', close);
    },

    cancel() {
      if (beat) clearInterval(beat);
      beat = null;
      detach?.();
      detach = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` matters as much as `no-store`: it tells an intermediary
      // not to compress or rewrite the body, which is what turns a stream into
      // a page that arrives all at once when it ends.
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // Nginx honours this; Caddy does not buffer streamed responses, but the
      // header costs nothing and the next proxy somebody puts in front of this
      // might.
      'X-Accel-Buffering': 'no',
    },
  });
}
