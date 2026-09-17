import 'server-only';

import { randomUUID } from 'node:crypto';

import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';

/**
 * Undo for staff (improvements 11).
 *
 * An in-process stack, not a table — the same licence `live-hub.ts` and
 * `rate-limit.ts` take: pinned to `globalThis`, lost on restart, and that is
 * fine for a mis-tap. A writer that can be undone records an *inverse* here
 * beside its own write; `undoLast` runs the newest one that has not expired
 * and tells the table. Ten deep, five minutes each, one stack per campaign.
 *
 * An inverse restores what was there — the hit points before, the square
 * the token stood on, the keys the row carried — never re-applies a delta,
 * so undoing a −12 after somebody else healed 5 puts the number back to
 * what it was and does not invent a 17.
 *
 * Undo never touches rolls. A roll happened.
 */

export interface UndoEntry {
  id: string;
  label: string;
  inverse: () => Promise<void>;
  recordedAt: number;
  expiresAt: number;
}

const DEPTH = 10;
const TTL_MS = 5 * 60_000;

type Stacks = Map<string, UndoEntry[]>;
const g = globalThis as unknown as { __heroNexusUndo?: Stacks };
const stacks: Stacks = g.__heroNexusUndo ?? (g.__heroNexusUndo = new Map());

function stackFor(campaignId: string): UndoEntry[] {
  let s = stacks.get(campaignId);
  if (!s) {
    s = [];
    stacks.set(campaignId, s);
  }
  // Expired entries fall off the bottom whenever the stack is touched.
  const now = Date.now();
  while (s.length > 0 && s[0].expiresAt <= now) s.shift();
  return s;
}

/** Remember how to put something back. Called by the writer, after its write. */
export function recordUndo(
  campaignId: string,
  entry: { label: string; inverse: () => Promise<void> }
): void {
  const s = stackFor(campaignId);
  const now = Date.now();
  s.push({
    id: randomUUID(),
    label: entry.label.slice(0, 120),
    inverse: entry.inverse,
    recordedAt: now,
    expiresAt: now + TTL_MS,
  });
  while (s.length > DEPTH) s.shift();
}

/** What the ribbon shows: the newest label, or null. No role check: a label is not a secret from staff, and only staff are shown it. */
export function peekUndo(
  campaignId: string
): { label: string; recordedAt: string } | null {
  const s = stackFor(campaignId);
  const top = s[s.length - 1];
  return top
    ? { label: top.label, recordedAt: new Date(top.recordedAt).toISOString() }
    : null;
}

/**
 * Put the last thing back. Staff only. Returns the label undone, or null
 * when there was nothing to undo — and publishes an `undo` event so the
 * table knows the 12 came back.
 */
export async function undoLast(campaignId: string): Promise<string | null> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const s = stackFor(campaignId);
  const top = s.pop();
  if (!top) return null;
  await top.inverse();
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'undo',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    label: top.label,
  });
  return top.label;
}
