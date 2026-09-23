/**
 * The table's live state, over GET.
 *
 * The same `getLiveState` the server action returned — role-filtered there
 * and nowhere else — but read as a plain request. Two reasons. Next runs a
 * browser's server actions one at a time, so a re-read that a `state` nudge
 * set off sat in the queue in front of the DM's next click; a fetch does
 * not queue behind anything. And an unchanged table comes back as a 304
 * with no body: the answer is hashed into an ETag, and a browser that sends
 * the one it holds is told "the same" instead of handed the whole document
 * again.
 *
 * It saves bandwidth and the queue, not the server's work: the state is
 * still assembled for every read, because the hash is of the answer.
 */
import { createHash } from 'node:crypto';

import { getLiveState } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  let body: string;
  try {
    body = JSON.stringify(await getLiveState(campaignId));
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'NOT_AUTHENTICATED' || code === 'SESSION_STALE') {
      return new Response('Sign in again', { status: 401 });
    }
    // Not found and not yours read the same: whether a campaign exists is
    // not a stranger's business, as the live route says.
    if (code === 'NOT_FOUND' || code === 'FORBIDDEN') {
      return new Response('Not found', { status: 404 });
    }
    console.error('[state]', err);
    return new Response('Could not read the table', { status: 500 });
  }

  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  const headers = {
    ETag: etag,
    // Per reader, and never answered from a cache without asking.
    'Cache-Control': 'private, no-cache',
    Vary: 'Cookie',
  };
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, {
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
