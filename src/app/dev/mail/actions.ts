'use server';

import { revalidatePath } from 'next/cache';

import { clearOutbox } from '@/server/mail-outbox';

/** Empty the local mail sink. Development only — see `mailTransport`. */
export async function clearOutboxAction(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The mail outbox does not exist in production.');
  }
  await clearOutbox();
  revalidatePath('/dev/mail');
}
