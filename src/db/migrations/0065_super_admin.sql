-- The person who runs the box (improvements: super admin).
--
-- Hero Nexus is self-hosted, so somebody owns the machine, and until now the
-- app had no way to say so: there was no way to see how much of the disk the
-- uploads had taken, who had signed up and never verified, or which account
-- was forging a hundred classes a night. Everything an operator could do,
-- they did in SQLite by hand.
--
-- `is_super_admin` is that person. It is deliberately not a role on a
-- campaign — campaigns have `gm` / `co-gm` / `player` and this is orthogonal
-- to all three — and deliberately not inferred from "the first account",
-- because a first account that was a test account is a footgun. It is set by
-- `ADMIN_EMAILS` in the environment on sign-in, or by an existing super
-- admin.
--
-- `disabled_at` is the other half: an account that may not sign in any more.
-- Not a delete — their characters, their campaigns and the sessions they
-- played are other people's history too — and reversible by design.

ALTER TABLE "user" ADD COLUMN "is_super_admin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user" ADD COLUMN "disabled_at" TEXT;
