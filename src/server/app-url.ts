/**
 * Canonical public origin for building links that leave the app (emails).
 *
 * Never derive this from a request header — a spoofed `Host` on a password
 * reset request would send the victim a link to an attacker's domain. `APP_URL`
 * is set once, in the environment, from the operator's known domain.
 */
export function appUrl(path = '/'): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    ''
  );
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
