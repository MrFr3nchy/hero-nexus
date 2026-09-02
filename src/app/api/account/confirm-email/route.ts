import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { appUrl } from '@/server/app-url';
import { db } from '@/db';
import { users } from '@/db/schema';
import { consumeToken } from '@/server/tokens';

export const runtime = 'nodejs';

/**
 * Confirm an email-address change. The link is sent to the *new* address by
 * `updateEmailAction`, so clicking it proves control of that address. The token
 * binds the change to a specific (userId, newEmail) pair.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid') ?? '';
  const email = (url.searchParams.get('email') ?? '').toLowerCase();
  const token = url.searchParams.get('token') ?? '';

  const back = (flag: string) =>
    NextResponse.redirect(appUrl(`/account/settings?${flag}`), {
      status: 303,
    });

  if (!uid || !email || !token) return back('email_error=1');

  const ok = await consumeToken('email-change', `${uid}:${email}`, token);
  if (!ok) return back('email_error=1');

  // Re-check the address is still free — someone else may have claimed it while
  // this link sat in an inbox.
  const clash = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (clash && clash.id !== uid) return back('email_taken=1');

  await db
    .update(users)
    .set({ email, emailVerified: new Date() })
    .where(eq(users.id, uid));

  return back('email_changed=1');
}
