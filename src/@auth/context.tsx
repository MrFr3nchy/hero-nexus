'use client';

import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  clearOfflineData,
  forgetUser,
  lastUser,
  rememberUser,
} from '@/@shared/offline/client';

import {
  updateEmailAction,
  updatePasswordAction,
  updateProfileAction,
} from './actions';
import { AuthContextType, AuthError, SessionUser } from './types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function toAuthError(
  err: unknown,
  fallback = 'Something went wrong.'
): AuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    return err as AuthError;
  }
  return { message: fallback };
}

const InnerAuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { data: session, status, update } = useSession();

  /*
   * Offline, the session read fails, and `useSession` cannot tell a failed
   * read from "signed out" — both arrive as `unauthenticated`, and
   * `ProtectedRoute` would bounce a player mid-session to /login. So when it
   * says signed out and this device remembers somebody, ask once more: a
   * read that *throws* means no network, and the remembered user stands
   * until the network is back; a read that answers "nobody" means signed
   * out, and the memory goes.
   */
  const [offlineUser, setOfflineUser] = useState<SessionUser | null>(null);
  /** The probe below has answered for this signed-out spell. */
  const [settled, setSettled] = useState(false);
  /** Bumped when the network returns, to ask again. */
  const [probe, setProbe] = useState(0);

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      rememberUser({
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      });
      setOfflineUser(null);
      setSettled(false);
      return;
    }
    if (status !== 'unauthenticated') return;
    const remembered = lastUser();
    if (!remembered) return;
    let cancelled = false;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(r => r.json())
      .then((j: { user?: unknown } | null) => {
        if (cancelled) return;
        if (j?.user) void update();
        else forgetUser();
        setOfflineUser(null);
      })
      .catch(() => {
        if (!cancelled) setOfflineUser(remembered);
      })
      .finally(() => {
        if (!cancelled) setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [status, session, update, probe]);

  // Back online: read the session again rather than trusting the memory.
  useEffect(() => {
    const online = () => {
      setOfflineUser(null);
      setSettled(false);
      setProbe(n => n + 1);
      void update();
    };
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [update]);

  const value = useMemo<AuthContextType>(() => {
    const currentUser: SessionUser | null = session?.user
      ? {
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
        }
      : offlineUser;

    return {
      currentUser,
      // Decided during render, not in the effect: `ProtectedRoute` is a
      // child, so its redirect effect runs before this provider's would.
      loading:
        status === 'loading' ||
        (status === 'unauthenticated' && !settled && lastUser() !== null),

      async login(email, password) {
        const res = await signIn('credentials', {
          email,
          password,
          redirect: false,
        });
        if (!res || res.error) {
          // `signIn` callback returns false for unverified accounts, which
          // Auth.js reports as 'AccessDenied' (distinct from bad credentials).
          if (res?.error === 'AccessDenied') {
            throw {
              code: 'email-not-verified',
              message:
                'Please verify your email address first — check your inbox for the link.',
            } satisfies AuthError;
          }
          throw {
            code: 'invalid-credentials',
            message: 'Incorrect email or password.',
          } satisfies AuthError;
        }
        await update();
      },

      async register(email, password, displayName) {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw {
            code: res.status === 409 ? 'email-in-use' : 'unknown',
            message: data.error ?? 'Failed to create account.',
          } satisfies AuthError;
        }
        // No auto sign-in: the account can't sign in until the email is
        // verified. The form shows a "check your inbox" panel instead.
      },

      async logout() {
        // What this device cached was filtered for whoever fetched it.
        await clearOfflineData();
        await signOut({ redirect: false });
      },

      async updateProfile(data) {
        try {
          await updateProfileAction(data);
          await update();
        } catch (err) {
          throw toAuthError(err, 'Failed to update profile.');
        }
      },

      async updateEmail(email, currentPassword) {
        try {
          await updateEmailAction(email, currentPassword);
          // The change isn't live yet — it's pending a click on the link sent
          // to the new address — so there's nothing to refresh here.
        } catch (err) {
          throw toAuthError(err, 'Failed to update email.');
        }
      },

      async updatePassword(currentPassword, newPassword) {
        try {
          await updatePasswordAction(currentPassword, newPassword);
        } catch (err) {
          throw toAuthError(err, 'Failed to update password.');
        }
      },
    };
  }, [session, status, update, offlineUser, settled]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <SessionProvider>
    <InnerAuthProvider>{children}</InnerAuthProvider>
  </SessionProvider>
);
