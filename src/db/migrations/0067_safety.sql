-- Session zero and safety tools.
--
--   campaign_safety — the table's lines and veils. Readable by every member;
--                     staff add and delete; players add anonymously. There is
--                     deliberately no user id on this table, not even a
--                     nullable one: `source` says only whether staff or a
--                     player wrote it. Anonymity enforced by storage cannot be
--                     undone by a UI bug. The consequence, accepted: a player
--                     cannot edit or take back their own line. Never carried
--                     in a campaign package — a table's boundaries are its own.
--   campaign_timers.paused_at — set when an X-card tap stops the table's
--                     running countdowns. Resuming pushes `ends_at` on by the
--                     time spent paused and clears this.
--
-- The X-card itself writes nothing: a tap is a moment published to staff,
-- with no `by`, and kept nowhere.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "campaign_safety" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('line','veil')),
  "text" TEXT NOT NULL,
  "source" TEXT NOT NULL CHECK ("source" IN ('staff','player')),
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "campaign_safety_campaign_idx" ON "campaign_safety" ("campaign_id");

ALTER TABLE "campaign_timers" ADD COLUMN "paused_at" TEXT;
