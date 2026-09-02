-- Email verification (Branch 2) starts writing `user.emailVerified` from this
-- point on. Every account that already exists predates verification and has
-- `emailVerified = NULL`. Because the sign-in gate rejects unverified accounts,
-- shipping this without a backfill would lock every current user out of their
-- own data.
--
-- Trust existing accounts: stamp them verified as of now. Accounts created
-- after this migration keep `emailVerified = NULL` until they click the link in
-- their verification email.
--
-- No schema change — `user.emailVerified` (integer, timestamp_ms) already
-- exists from the Auth.js Drizzle adapter. This is a data-only migration.
UPDATE "user"
SET "emailVerified" = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE "emailVerified" IS NULL;
