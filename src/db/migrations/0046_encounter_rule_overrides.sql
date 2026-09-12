-- Per-fight rule overrides (improvements 01, table rules).
--
-- The campaign's table rules live in `campaigns.settings.table`; a fight may
-- differ from them — this one has no flanking, this one enforces — and the
-- difference is stored here as a partial of the same shape. Read through
-- `effectiveRules` in `src/server/table-rules.ts`, which lays it over the
-- campaign's block; nothing else reads the column.

ALTER TABLE "initiative_encounters" ADD COLUMN "rule_overrides" TEXT NOT NULL DEFAULT '{}';
