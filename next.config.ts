import type { NextConfig } from 'next';

// Applied to every response by the Next server. TLS is terminated at the
// reverse proxy (see `deploy/Caddyfile`), so HSTS only takes effect once
// traffic is actually HTTPS — harmless before then.
//
// No Content-Security-Policy yet: a correct one has to account for Next's
// inline runtime and styled-jsx, and a wrong one silently breaks the app.
// `frame-ancestors 'none'` below is the safe subset; a full CSP is tracked in
// docs/ops/security-decisions.md.
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
];

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
