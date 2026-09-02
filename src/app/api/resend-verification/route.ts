import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';
import { requestIp, tooManyRequests } from '@/server/http';
import { sendMail } from '@/server/mail';
import { verificationEmail } from '@/server/mail-templates';
import { LIMITS, rateLimit } from '@/server/rate-limit';
import { issueToken } from '@/server/tokens';

export const runtime = 'nodejs';

const schema = z.object({ email: z.string().email().max(200) });

/**
 * Re-send a verification link. Always answers `{ ok: true }` — it must not
 * reveal whether an address has an account or whether it is already verified.
 */
export async function POST(request: Request) {
  const ip = requestIp(request);
  const byIp = rateLimit(`resend:ip:${ip}`, ...LIMITS.mailByIp);
  if (!byIp.ok) return tooManyRequests(byIp.retryAfter);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const byTarget = rateLimit(`resend:to:${email}`, ...LIMITS.mailByTarget);
  if (!byTarget.ok) return tooManyRequests(byTarget.retryAfter);

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (user && !user.emailVerified) {
    try {
      const token = await issueToken('verify', email);
      await sendMail(verificationEmail(email, token));
    } catch (err) {
      console.error('[resend-verification] mail failed:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
