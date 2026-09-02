/**
 * Single-use, expiring tokens for the email flows (verify address, reset
 * password, confirm email change).
 *
 * Storage reuses the adapter-managed `verificationToken` table rather than
 * adding new tables. The `identifier` column is namespaced per flow so the
 * three cannot collide:
 *
 *   verify:<email>
 *   reset:<email>
 *   email-change:<userId>:<newEmail>
 *
 * A token is consumed on first use (deleted) regardless of whether it had
 * expired, so a leaked link cannot be replayed.
 */
import 'server-only';

import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { verificationTokens } from '@/db/schema';

export type TokenKind = 'verify' | 'reset' | 'email-change';

const TTL_MS: Record<TokenKind, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
  'email-change': 60 * 60 * 1000,
};

function identifierFor(kind: TokenKind, subject: string): string {
  return `${kind}:${subject}`;
}

/**
 * Issue a token for `subject`, replacing any token already outstanding for the
 * same (kind, subject) so a user only ever has one live link per flow.
 */
export async function issueToken(
  kind: TokenKind,
  subject: string
): Promise<string> {
  const identifier = identifierFor(kind, subject);
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + TTL_MS[kind]);

  await db
    .delete(verificationTokens)
    .where(eq(verificationTokens.identifier, identifier));
  await db.insert(verificationTokens).values({ identifier, token, expires });

  return token;
}

/**
 * Validate and consume a token. Returns `true` only if it existed and had not
 * expired. The row is deleted either way.
 */
export async function consumeToken(
  kind: TokenKind,
  subject: string,
  token: string
): Promise<boolean> {
  const identifier = identifierFor(kind, subject);

  const row = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.identifier, identifier),
      eq(verificationTokens.token, token)
    ),
  });

  if (!row) return false;

  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, token)
      )
    );

  return row.expires.getTime() > Date.now();
}
