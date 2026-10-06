-- NPCs that can act, and faction standing.
--
--   canon_entries.attitude    — the 2024 rules' three attitudes toward the
--                               party: friendly, indifferent, hostile. A column,
--                               not a `fields` key, because `fields` goes to
--                               players unfiltered and this is DM-private;
--                               `listCanon` nulls it for non-staff.
--   canon_entries.stat_source / stat_key
--                             — a stat block by `ContentRef` (type implied:
--                               creature, asserted on write), never copied
--                               stats. content-model rules 1 and 2.
--   faction_standing          — every change to the party's standing with a
--                               faction, with why. Current standing is the sum;
--                               what the party sees is the sum of the changes
--                               it has been shown. The record of a table that
--                               was played, so never carried in a package —
--                               even though the faction itself is.
--
-- Canon is carried, so the package copies attitude and stat_* explicitly.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

ALTER TABLE "canon_entries" ADD COLUMN "attitude" TEXT
  CHECK ("attitude" IN ('friendly','indifferent','hostile'));
ALTER TABLE "canon_entries" ADD COLUMN "stat_source" TEXT
  CHECK ("stat_source" IN ('srd','homebrew'));
ALTER TABLE "canon_entries" ADD COLUMN "stat_key" TEXT;

CREATE TABLE "faction_standing" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "canon_entry_id" TEXT NOT NULL REFERENCES "canon_entries"("id") ON DELETE CASCADE,
  "delta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "shown" INTEGER NOT NULL DEFAULT 0,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "faction_standing_entry_idx" ON "faction_standing" ("canon_entry_id");
