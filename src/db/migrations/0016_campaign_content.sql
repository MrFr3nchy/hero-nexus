-- 0016: the campaign content library — homebrew that is actually in play.
--
--   campaign_homebrew — one row per piece of homebrew available at a table.
--
-- Until now `homebrew_approvals.status` was written and never read: nothing in
-- the app ever asked "what homebrew is approved for this campaign", so an
-- approved item became no more usable than a denied one, and a denied one kept
-- working. This table is that missing answer, and it is a table rather than a
-- query over approvals because the two ways content reaches a table are not
-- the same event:
--
--   'approved-submission' — a player submitted it and a DM said yes. The
--                           approval row remains the record of that decision;
--                           this row is the consequence.
--   'gm-authored'         — a DM put it on the table directly. There is no
--                           submission and no decision to record, so deriving
--                           this from `homebrew_approvals` would mean writing
--                           a fake self-approval to explain it.
--
-- Removing content from a table is a delete here and leaves the approval row
-- standing, because "the DM took the sunblade out of play" and "the DM never
-- approved the sunblade" are different facts and a player deserves to see
-- which one happened.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_homebrew" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "homebrew_id" TEXT NOT NULL REFERENCES "homebrew"("id") ON DELETE CASCADE,
  "added_by"    TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "source"      TEXT NOT NULL DEFAULT 'gm-authored'
                CHECK ("source" IN ('gm-authored', 'approved-submission')),
  "note"        TEXT NOT NULL DEFAULT '',   -- the DM's line about it, party-visible
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One shelf slot per piece of content: adding the same homebrew twice is the
-- same fact, not two.
CREATE UNIQUE INDEX "campaign_homebrew_campaign_entry_idx"
  ON "campaign_homebrew" ("campaign_id", "homebrew_id");

-- Read path: "everything on this table's shelf", every time the tab opens.
CREATE INDEX "campaign_homebrew_campaign_idx"
  ON "campaign_homebrew" ("campaign_id");

-- Reverse lookup: "which tables is this content in play at", used when a sheet
-- is checked against the tables it is linked to.
CREATE INDEX "campaign_homebrew_homebrew_idx"
  ON "campaign_homebrew" ("homebrew_id");
