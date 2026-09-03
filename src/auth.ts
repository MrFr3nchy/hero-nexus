/**
 * Full Auth.js config: Drizzle adapter + email/password Credentials provider,
 * JWT sessions (required for the Credentials provider).
 *
 * Node-only (imports the SQLite `db`). Not for use in middleware — see
 * `src/auth.config.ts` for the edge-safe half.
 */
import { verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { z } from 'zod';

import { authConfig } from './auth.config';
import { db } from './db';
import { accounts, sessions, users, verificationTokens } from './db/schema';
import { isRateLimited, LIMITS, rateLimit } from './server/rate-limit';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT sessions cannot be revoked server-side. Keep the lifetime short so a
  // password change (or a leaked token) has a bounded blast radius. See
  // `docs/ops/security-decisions.md`.
  session: { strategy: 'jwt', maxAge: 3 * 24 * 60 * 60 },
  callbacks: {
    ...authConfig.callbacks,
    // JWTs outlive the rows they point at: a `db:reset`, a deleted account,
    // or a restored backup leaves a cookie naming a user that no longer exists.
    // Everything the app writes has a foreign key onto `user.id`, so such a
    // token used to fail every save with "FOREIGN KEY constraint failed".
    // Returning null drops the token, which sends the request to /login.
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        return token;
      }
      if (trigger === 'signUp') return token;
      if (!token.id) return null;
      const row = await db.query.users.findFirst({
        columns: { id: true },
        where: eq(users.id, token.id as string),
      });
      return row ? token : null;
    },
    async signIn({ user }) {
      // Credentials is the only provider. Block accounts that haven't confirmed
      // their email. Surfaces to the client as `error: 'AccessDenied'`, which
      // the login form turns into a "resend verification" prompt.
      if (!user?.id) return false;
      const row = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });
      return Boolean(row?.emailVerified);
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();

        // Throttle password guessing per account. Argon2 is a speed bump, not a
        // lockout policy.
        if (isRateLimited(`login:${email}`, ...LIMITS.login)) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        const ok =
          user?.passwordHash &&
          (await verify(user.passwordHash, parsed.data.password));

        if (!ok) {
          rateLimit(`login:${email}`, ...LIMITS.login);
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
});
