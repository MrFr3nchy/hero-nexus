-- What a roll decided (improvements 06).
--
-- An attack is two rolls in the log, as it always was; the to-hit row now
-- also carries what the server compared it against and what came of it —
-- the target, its AC, hit or miss, the damage after resistances, and whether
-- and by whom that damage was applied. JSON, because the shape belongs to
-- `campaign/lib/attack.ts` (`RollOutcome`) and a plain roll has none. NULL
-- for every roll that is not an attack.
--
-- `LiveState` filters it by role before it leaves: a player never sees the
-- AC, and sees hit / miss only where the table shows it (`showHitMiss`).

ALTER TABLE "campaign_rolls" ADD COLUMN "outcome" TEXT;
