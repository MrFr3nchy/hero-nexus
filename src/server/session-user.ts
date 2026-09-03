import 'server-only';

import { eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/db';
import { users } from '@/db/schema';

/**
 * The signed-in user's id, guaranteed to still exist in the database.
 *
 * Sessions are JWTs, so a cookie stays valid for its full lifetime even if the
 * row it points at is gone (a `db:reset`, a deleted account). Every write in
 * this app has a foreign key onto `user.id`, so a stale token used to surface
 * as "FOREIGN KEY constraint failed" on save and as silently empty lists on
 * read. Check the row here instead, and let callers turn `SESSION_STALE` into
 * a "sign in again" prompt.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error('NOT_AUTHENTICATED');

  const row = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.id, id),
  });
  if (!row) throw new Error('SESSION_STALE');

  return id;
}
