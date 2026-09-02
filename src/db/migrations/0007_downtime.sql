-- 0007: between-session downtime.
--   downtime_periods — a window the DM opens for downtime actions.
--   downtime_actions — one action a player submitted against a period, plus the
--                      DM's resolution. Modelled on homebrew_approvals: submit →
--                      review → respond → resubmit. A rejection needs a reason
--                      (enforced in the server module, like DENY_NEEDS_NOTE).
--
-- character_id is ON DELETE SET NULL, matching campaign_members: deleting a
-- character unlinks its downtime log rather than cascading them away.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "downtime_periods" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "label"       TEXT NOT NULL DEFAULT '',
  "opens_at"    TEXT,
  "closes_at"   TEXT,
  "status"      TEXT NOT NULL DEFAULT 'open',        -- open | closed
  "created_by"  TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "downtime_periods_campaign_idx"
  ON "downtime_periods" ("campaign_id");

CREATE TABLE "downtime_actions" (
  "id"                  TEXT PRIMARY KEY NOT NULL,
  "period_id"           TEXT NOT NULL REFERENCES "downtime_periods"("id") ON DELETE CASCADE,
  "character_id"        TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "actor_user_id"       TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind"                TEXT NOT NULL DEFAULT 'other',   -- shopping | crafting | research | training | carousing | letter | other
  "body"                TEXT NOT NULL DEFAULT '',
  "dm_response"         TEXT,
  "status"              TEXT NOT NULL DEFAULT 'submitted', -- submitted | resolved | rejected
  "resolved_by_user_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "resolved_at"         TEXT,
  "created_at"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "downtime_actions_period_idx"
  ON "downtime_actions" ("period_id");
CREATE INDEX "downtime_actions_character_idx"
  ON "downtime_actions" ("character_id");
