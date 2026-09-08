-- 0020: the screen each person built for themselves.
--
--   campaign_screen_layouts — which panels one person keeps on their screen at
--                             one table, in which rail, in which order.
--
-- Keyed on (campaign_id, user_id) rather than on the member row, for the same
-- reason as canon_reveals: the GM has no `campaign_members` row, and the GM is
-- the person this feature exists for.
--
-- The layout is one JSON blob rather than a row per panel. It is read whole,
-- written whole, and never queried by its contents — "which players have the
-- initiative panel up" is not a question anything asks. A row per panel would
-- buy joins nobody performs and turn saving a reorder into a diff.
--
-- An unknown panel key in a stored layout is dropped at read time rather than
-- migrated: a layout is a preference, and the cost of a panel this build no
-- longer has is that it stops appearing.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "campaign_screen_layouts" (
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "user_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  -- JSON: { "main": ["initiative", …], "rail": ["quests", …] }
  "layout"      TEXT NOT NULL DEFAULT '{}',
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY ("campaign_id", "user_id")
);
