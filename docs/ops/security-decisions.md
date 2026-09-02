# Security & operational decisions

Recorded so they're deliberate choices, not surprises during an incident.

## Database: stay on SQLite

WAL is on, the write volume (a character save, an initiative advance) is
trivial, and Drizzle keeps a future port cheap. The cost of SQLite is
operational — one process, and backups are ours rather than a managed
provider's. Branch 1 (`busy_timeout`, Litestream, uploads mirror, a rehearsed
restore) pays that cost. Postgres is explicitly out of scope.

## One droplet, one process

`better-sqlite3` holds a local file. No horizontal scaling, and nothing in the
code may assume multiple instances. The in-memory rate limiter
(`src/server/rate-limit.ts`) depends on this.

Note the limiter keeps its state on `globalThis`, not in module scope. Next
bundles each route handler separately, so a module-level `Map` gives every route
its own copy — and then `/api/reset-password` cannot clear a lockout that the
sign-in callback in `src/auth.ts` recorded. This was caught in testing; don't
"simplify" it back to a module-level `Map`.

## Rate limits

| Surface                                            | Limit                                            |
| -------------------------------------------------- | ------------------------------------------------ |
| `POST /api/register`                               | 10 per IP per hour                               |
| `/api/forgot-password`, `/api/resend-verification` | 5 per IP per hour, 3 per target address per hour |
| `/api/reset-password`                              | 10 per IP per hour                               |
| Email change (server action)                       | 3 per user per hour                              |
| Failed credential logins                           | 10 per email address per 15 min                  |

The login limit counts **failures only** — a correct password never consumes
budget, and a successful password reset clears the account's lockout so someone
who guessed at their own password ten times isn't locked out of the new one.

Known tradeoff: because the login lockout is keyed by email address, anyone can
lock a known account for 15 minutes by failing ten sign-ins against it. That is
the standard cost of account-keyed throttling, and it's preferable to leaving
password guessing bounded only by argon2's cost. Revisit (key by email + IP,
with a looser global per-email cap) if it is actually abused.

## Registration is invite-only at launch

`REGISTRATION_INVITE_CODES` (comma-separated) gates `POST /api/register`. When
non-empty, a matching code is required; when empty, registration is open. We
launch invite-only and lift it later by clearing the variable. Codes are shared,
not single-use — good enough for a first cohort; a `signup_invites` table with
per-code audit is the upgrade if abuse appears.

## Unverified accounts cannot sign in

The `signIn` callback in `src/auth.ts` rejects any account with
`emailVerified IS NULL`. This is the single gate — there is no "verified users
only" logic scattered through the app. Migration `0008` backfills every account
that existed before verification as verified, so existing users are not locked
out.

## JWT sessions — accepted, not fixed

`session.strategy` is `'jwt'` (required by the Credentials provider as used
here). Consequences:

- There is **no server-side session revocation.** Changing a password does not
  sign other devices out. There is no "log out everywhere."
- A stolen JWT is valid until it expires.

Mitigation: `session.maxAge` is **3 days** (down from the 30-day default), so the
blast radius of a leaked token or a not-yet-expired session after a password
change is bounded. Moving to database sessions (the `session` table already
exists via the adapter) is the real fix and is deferred — revisit if we add
account-takeover recovery tooling.

## `updateEmailAction` requires re-authentication

Changing the account email requires the current password and does not take
effect immediately — it emails a confirmation link to the **new** address and
commits only when that link is clicked (`/api/account/confirm-email`). A stolen
session alone cannot change the email, and `emailVerified` is re-stamped to the
moment the new address is proven.

## Reverse proxy trust

The app trusts `X-Forwarded-For` (rate-limit keys) and `AUTH_TRUST_HOST=true`.
Both are only safe because Caddy terminates TLS and overwrites the forwarded
headers. Do not expose the Next process directly, and do not put a proxy in
front that forwards client-supplied `X-Forwarded-*` / `Host` unchecked.

## Content-Security-Policy — partial

`next.config.ts` sets HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, and `CSP: frame-ancestors 'none'`. A
full `script-src`/`style-src` CSP is **not** shipped yet — Next's inline runtime
and styled-jsx need `'unsafe-inline'` or a nonce pipeline, and a wrong policy
breaks the app silently. Tracked as follow-up work.

## Compendium is behind auth

`/spells`, `/classes`, `/marketplace` are absent from `PUBLIC_PATHS`, so a
session is required. This is unchanged by this work. If marketing copy promises
browsing without an account, either the copy or the allowlist must change —
open product decision.

## Retention promise

Not yet written. Branch 1 gets the recovery point to seconds and 7 days of
restore points, but the operator owes users a stated promise before they trust
the app with a long campaign. One sentence on the site.
