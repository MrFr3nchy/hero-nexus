import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { requestIp, tooManyRequests } from '@/server/http';
import { clearRateLimit, LIMITS, rateLimit } from '@/server/rate-limit';
import { consumeToken } from '@/server/tokens';

export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email().max(200),
  token: z.string().min(1).max(200),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200),
});

/**
 * Finish a password reset: consume the token, write the new hash.
 *
 * JWT sessions can't be revoked server-side (see
 * `docs/ops/security-decisions.md`), so any session already issued to this
 * account stays valid until it expires. Token lifetimes are kept short for
 * this reason.
 */
export async function POST(request: Request) {
  const ip = requestIp(request);
  const limited = rateLimit(`reset:${ip}`, ...LIMITS.tokenSubmit);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const ok = await consumeToken('reset', email, parsed.data.token);
  if (!ok) {
    return NextResponse.json(
      { error: 'This reset link is invalid or has expired.' },
      { status: 400 }
    );
  }

  const passwordHash = await hash(parsed.data.password);
  await db
    .update(users)
    .set({
      passwordHash,
      // Receiving the reset email proves the address; clear any doubt.
      emailVerified: new Date(),
    })
    .where(eq(users.email, email));

  // Clear the failed-login lockout. Someone who guessed their own password ten
  // times and then reset it should not be locked out of the new one.
  clearRateLimit(`login:${email}`);

  return NextResponse.json({ ok: true });
}
