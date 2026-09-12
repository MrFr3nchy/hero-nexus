-- Real dice (improvements 03).
--
-- A roll whose faces a player read off dice on the table rather than the
-- app rolling them. The modifier and the total are still the server's — the
-- browser sent faces, a claim about the die, and nothing else — and the row
-- says so, so the log and the tray can mark it.

ALTER TABLE "campaign_rolls" ADD COLUMN "physical" INTEGER NOT NULL DEFAULT 0;
