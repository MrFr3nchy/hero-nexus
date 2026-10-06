-- Random tables roll on a chosen die.
--
-- A DM picks the die (d4, d6, d8, d10, d12, d20, d100) and each entry owns a
-- run of its faces, `{ "text", "from", "to" }`, written as printed tables
-- write them: 01–03, 04, 05–00. `die` 0 is a table from 0068, whose entries
-- are `{ "text", "weight" }`: it reads as contiguous runs from 1 on a die the
-- size of their total, and takes a real die the first time it is saved.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

ALTER TABLE "random_tables" ADD COLUMN "die" INTEGER NOT NULL DEFAULT 0;
