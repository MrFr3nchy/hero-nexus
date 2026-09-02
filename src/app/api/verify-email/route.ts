import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { appUrl } from '@/server/app-url';
import { db } from '@/db';
import { users } from '@/db/schema';
import { consumeToken } from '@/server/tokens';

export const runtime = 'nodejs';

/**
 * Email verification landing. The link in the verification email points here.
 * Consumes the token, stamps `user.emailVerified`, and bounces to the login
 * page with a flash flag the form reads.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get('email') ?? '').toLowerCase();
  const token = url.searchParams.get('token') ?? '';

  const fail = () =>
    NextResponse.redirect(appUrl('/login?verify_error=1'), { status: 303 });

  if (!email || !token) return fail();

  const ok = await consumeToken('verify', email, token);
  if (!ok) return fail();

  await db
    .update(users)
    .set({ emailVerified: new Date() })
    .where(eq(users.email, email));

  return NextResponse.redirect(appUrl('/login?verified=1'), { status: 303 });
}
