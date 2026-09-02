import { hash } from '@node-rs/argon2';
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

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(200),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
  inviteCode: z.string().trim().max(200).optional(),
});

/**
 * Invite codes for public sign-up. When `REGISTRATION_INVITE_CODES` is set
 * (comma-separated), a matching `inviteCode` is required to register; when it
 * is empty or unset, registration is open. Launch posture is invite-only — see
 * `docs/ops/security-decisions.md`.
 */
function inviteCodeAccepted(code: string | undefined): boolean {
  const configured = (process.env.REGISTRATION_INVITE_CODES ?? '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  if (configured.length === 0) return true;
  return code !== undefined && configured.includes(code);
}

export async function POST(request: Request) {
  const ip = requestIp(request);
  const limited = rateLimit(`register:${ip}`, ...LIMITS.register);
  if (!limited.ok) return tooManyRequests(limited.retryAfter);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 }
    );
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 }
    );
  }

  if (!inviteCodeAccepted(parsed.data.inviteCode)) {
    return NextResponse.json(
      { error: 'That invite code is not valid.' },
      { status: 403 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists.' },
      { status: 409 }
    );
  }

  const passwordHash = await hash(parsed.data.password);
  await db.insert(users).values({
    email,
    name: parsed.data.displayName ?? email.split('@')[0],
    passwordHash,
    // emailVerified stays NULL until the link below is clicked.
  });

  try {
    const token = await issueToken('verify', email);
    await sendMail(verificationEmail(email, token));
  } catch (err) {
    // The account exists; a transient mail failure shouldn't 500 the sign-up.
    // The user can request a fresh link from the login screen.
    console.error('[register] verification email failed:', err);
  }

  return NextResponse.json(
    { ok: true, needsVerification: true },
    { status: 201 }
  );
}
