-- Another shape (improvements 07).
--
-- Polymorph, Wild Shape, a summoner's beast: a combatant temporarily wearing
-- another creature's block. JSON, NULL when the combatant is itself:
-- `{ creatureRef, label, hpCurrent, hpMax, armorClass, revertsOnZero,
--    carryExcess, effectId }`. While set, the tracker, the stat block and
-- `attack` read the form's block and damage lands on `hpCurrent` here first;
-- at 0 the entry reverts and — per 2024 Polymorph — the excess is dropped,
-- unless `carryExcess` (Wild Shape) says it carries. Tied to an
-- `encounter_effects` row so the duration or the concentration ends it.

ALTER TABLE "initiative_entries" ADD COLUMN "form" TEXT;
