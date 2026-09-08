/**
 * Local mail sink.
 *
 * Development has no provider wired up and no reason to want one — nobody
 * needs a verification link actually delivered to a real inbox to test that
 * verification works. Instead every message `sendMail` produces is written
 * here as a file, and `/dev/mail` renders the pile as an inbox with the links
 * clickable.
 *
 * Files, not memory: `next dev` recompiles and restarts the server module
 * graph constantly, and an in-memory list would vanish somewhere between
 * requesting a password reset and going to look for the email.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MailMessage } from './mail';

export const OUTBOX_DIR =
  process.env.HERO_NEXUS_OUTBOX_DIR ?? join(process.cwd(), 'data', 'outbox');

export interface OutboxMessage extends MailMessage {
  /** The filename, minus `.json`. Sorts chronologically. */
  id: string;
  sentAt: string;
}

/** Where the inbox lives, so the console log can point at it. */
export const OUTBOX_URL = '/dev/mail';

export async function appendToOutbox(message: MailMessage): Promise<void> {
  const sentAt = new Date().toISOString();
  // Timestamp first so a plain lexicographic sort is chronological; the suffix
  // keeps two messages sent in the same millisecond from colliding.
  const id = `${sentAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const entry: OutboxMessage = { ...message, id, sentAt };

  await mkdir(OUTBOX_DIR, { recursive: true });
  await writeFile(
    join(OUTBOX_DIR, `${id}.json`),
    JSON.stringify(entry, null, 2),
    'utf8'
  );
}

/** Everything in the outbox, newest first. */
export async function listOutbox(): Promise<OutboxMessage[]> {
  let names: string[];
  try {
    names = await readdir(OUTBOX_DIR);
  } catch {
    return []; // Nothing sent yet, so the directory does not exist.
  }

  const messages = await Promise.all(
    names
      .filter(name => name.endsWith('.json'))
      .sort()
      .reverse()
      .map(async name => {
        try {
          const raw = await readFile(join(OUTBOX_DIR, name), 'utf8');
          return JSON.parse(raw) as OutboxMessage;
        } catch {
          return null; // Half-written or hand-edited — skip it, don't 500.
        }
      })
  );

  return messages.filter((m): m is OutboxMessage => m !== null);
}

export async function clearOutbox(): Promise<void> {
  await rm(OUTBOX_DIR, { recursive: true, force: true });
}
