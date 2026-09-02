'use client';

import { SessionProvider, signIn, signOut, useSession } from 'next-auth/react';
import React, { createContext, useContext, useMemo } from 'react';

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

  const value = useMemo<AuthContextType>(() => {
    const currentUser: SessionUser | null = session?.user
      ? {
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
        }
      : null;

    return {
      currentUser,
      loading: status === 'loading',

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

      async register(email, password, displayName, inviteCode) {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName, inviteCode }),
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
  }, [session, status, update]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <SessionProvider>
    <InnerAuthProvider>{children}</InnerAuthProvider>
  </SessionProvider>
);
