'use server';

import {
  adminOverview,
  isSuperAdmin,
  listUsers,
  setUserDisabled,
  setUserSuperAdmin,
  verifyUserEmail,
  type AdminOverview,
  type AdminUserRow,
} from '@/server/admin';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    FORBIDDEN: 'You do not run this box.',
    NOT_YOURSELF: 'Not to your own account. Ask another admin.',
  };
  if (!messages[code]) console.error('[admin-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/** Whether this reader runs the box, for the nav to know. */
export async function isSuperAdminAction(): Promise<boolean> {
  return isSuperAdmin();
}

export async function adminOverviewAction(): Promise<AdminOverview | null> {
  try {
    return await adminOverview();
  } catch {
    return null;
  }
}

export async function listUsersAction(query = ''): Promise<AdminUserRow[]> {
  try {
    return await listUsers(query);
  } catch {
    return [];
  }
}

export async function setUserDisabledAction(
  userId: string,
  disabled: boolean
): Promise<Result> {
  try {
    await setUserDisabled(userId, disabled);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change that account.');
  }
}

export async function setUserSuperAdminAction(
  userId: string,
  isAdmin: boolean
): Promise<Result> {
  try {
    await setUserSuperAdmin(userId, isAdmin);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change that account.');
  }
}

export async function verifyUserEmailAction(userId: string): Promise<Result> {
  try {
    await verifyUserEmail(userId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not verify that address.');
  }
}
