-- A rest in progress (improvements 10).
--
-- Calling a rest used to be two instant buttons. Now it is a flow: staff
-- call it, each player answers from their own hero panel (how many hit dice,
-- and a confirm), staff confirm the lot and the sheets move. What was
-- answered has to survive a refresh and reach the DM's screen, so it is a
-- row and not component state. One open rest per campaign at a time, by the
-- partial index; a finished one is kept as a record of who rested.

CREATE TABLE "campaign_rests" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "campaign_id" TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('short', 'long')),
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'done', 'broken')),
  -- JSON { [characterId]: { hitDice: n, confirmed: bool } }
  "answers" TEXT NOT NULL DEFAULT '{}',
  "called_by" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "started_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "resolved_at" TEXT
);

CREATE INDEX "campaign_rests_campaign_idx" ON "campaign_rests" ("campaign_id");
CREATE UNIQUE INDEX "campaign_rests_one_open_idx"
  ON "campaign_rests" ("campaign_id")
  WHERE "status" = 'open';
