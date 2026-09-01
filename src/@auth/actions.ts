'use server';

import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { auth } from '@/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import type { AuthError } from './types';

function fail(code: string, message: string): never {
  const err: AuthError = { code, message };
  throw err;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) fail('not-authenticated', 'You are not signed in.');
  return session!.user!.id;
}

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  image: z.string().trim().url().max(500).optional().or(z.literal('')),
});

export async function updateProfileAction(input: {
  displayName?: string;
  image?: string;
}) {
  const userId = await requireUserId();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success)
    fail('invalid-input', 'Please check the form and try again.');

  await db
    .update(users)
    .set({
      ...(parsed.data.displayName !== undefined
        ? { name: parsed.data.displayName }
        : {}),
      ...(parsed.data.image !== undefined
        ? { image: parsed.data.image || null }
        : {}),
    })
    .where(eq(users.id, userId));
}

export async function updateEmailAction(email: string) {
  const userId = await requireUserId();
  const parsed = z.string().email().max(200).safeParse(email);
  if (!parsed.success)
    fail('invalid-email', 'Please enter a valid email address.');

  const next = parsed.data.toLowerCase();
  const clash = await db.query.users.findFirst({
    where: eq(users.email, next),
  });
  if (clash && clash.id !== userId) {
    fail('email-in-use', 'An account with this email already exists.');
  }
  await db.update(users).set({ email: next }).where(eq(users.id, userId));
}

export async function updatePasswordAction(
  currentPassword: string,
  newPassword: string
) {
  const userId = await requireUserId();
  if (newPassword.length < 8) {
    fail('weak-password', 'Password must be at least 8 characters.');
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.passwordHash) fail('unknown', 'Account has no password set.');

  const ok = await verify(user!.passwordHash!, currentPassword);
  if (!ok) fail('wrong-password', 'Your current password is incorrect.');

  const passwordHash = await hash(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}
