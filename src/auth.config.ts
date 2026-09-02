/**
 * Edge-safe Auth.js config. No database, no Node-only modules — this half is
 * imported by `middleware.ts`, which runs on the edge runtime.
 * The full config (adapter + Credentials provider) lives in `src/auth.ts`.
 */
import type { NextAuthConfig } from 'next-auth';

const PUBLIC_PATHS = [
  '/',
  '/about',
  '/faq',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
];

// Public API routes for the unauthenticated email flows. The token in the
// request is the authorization; there is no session yet.
const PUBLIC_API_PATHS = [
  '/api/register',
  '/api/forgot-password',
  '/api/reset-password',
  '/api/resend-verification',
  '/api/verify-email',
  '/api/account/confirm-email',
];

export const authConfig = {
  pages: { signIn: '/login' },
  providers: [], // real providers are added in src/auth.ts
  callbacks: {
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      const isPublic =
        PUBLIC_PATHS.includes(pathname) ||
        PUBLIC_API_PATHS.includes(pathname) ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/_next') ||
        pathname === '/favicon.ico';
      if (isPublic) return true;
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
