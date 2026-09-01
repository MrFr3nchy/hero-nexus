import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { users } from '@/db/schema';

export const runtime = 'nodejs';

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address.').max(200),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export async function POST(request: Request) {
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
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
