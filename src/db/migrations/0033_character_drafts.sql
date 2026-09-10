-- 0033: a character you have not finished building yet.
--
-- The builder used to have exactly one way out: a "Create character" button
-- that stayed disabled until every decision was made. A half-built hero was
-- therefore not a thing that could exist — close the tab and the work was
-- gone — which is why the button sat there unclickable as the only hint that
-- anything was still owed.
--
-- `status` makes the half-built hero a real row. A draft is saved, listed and
-- reopened like any other character; what it may NOT do is sit at a table or
-- go on the Wandering Library's shelf, because both of those hand the sheet to
-- somebody else and an unfinished sheet is not somebody else's problem. Those
-- two refusals live in `setMemberCharacter` and `publishCharacter`, not only
-- in the UI.
--
-- Existing rows default to 'ready': they were all written through the old
-- gate, so every one of them was complete at the moment it was saved.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

ALTER TABLE "characters"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready';

CREATE INDEX "characters_owner_status_idx"
  ON "characters" ("owner_id", "status");
