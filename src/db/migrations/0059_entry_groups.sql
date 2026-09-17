-- Running the other side (improvements 11).
--
-- `group_id`: rows sharing one act on one turn — six goblins rolled as a
-- group. NULL acts alone. `legendary`: a JSON `Legendary` from
-- `campaign/lib/monsters.ts` — how many legendary actions and resistances
-- are left, and whether the lair fights — NULL for the ordinary. Recharge
-- lives inside `turn` (0050), no column: it is turn state.

ALTER TABLE "initiative_entries" ADD COLUMN "group_id" TEXT;
ALTER TABLE "initiative_entries" ADD COLUMN "legendary" TEXT;
