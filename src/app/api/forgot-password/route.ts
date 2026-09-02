import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { requestIp, tooManyRequests } from '@/server/http';
import { sendMail } from '@/server/mail';
import { passwordResetEmail } from '@/server/mail-templates';
import { LIMITS, rateLimit } from '@/server/rate-limit';
import { issueToken } from '@/server/tokens';

export const runtime = 'nodejs';

const schema = z.object({ email: z.string().email().max(200) });

/**
 * Start a password reset. Always answers `{ ok: true }` regardless of whether
 * the address has an account, so it can't be used to enumerate users. Rate
 * limited by IP and by target address to keep it from becoming a spam relay.
 */
export async function POST(request: Request) {
  const ip = requestIp(request);
  const byIp = rateLimit(`forgot:ip:${ip}`, ...LIMITS.mailByIp);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfter);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const byTarget = rateLimit(`forgot:to:${email}`, ...LIMITS.mailByTarget);
  if (!byTarget.ok) return tooManyRequests(byTarget.retryAfter);

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (user?.passwordHash) {
    try {
      const token = await issueToken('reset', email);
      await sendMail(passwordResetEmail(email, token));
    } catch (err) {
      console.error('[forgot-password] mail failed:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
