-- An initiative entry remembers which creature it was dealt from.
--
-- addCreaturesToEncounter reads a stat block, copies its name, hit points and
-- armour class onto the entry, and forgets where they came from. So a DM
-- clicking Aboleth 3 on the board got a name and a number and not what an
-- aboleth does. This is a ContentRef, JSON, nullable: set by the bestiary
-- path, null for a combatant typed in by hand. A reference, never a copy of
-- the block - content-model rule 1 - so a homebrew monster corrected in the
-- library is corrected in every fight it is standing in.

ALTER TABLE "initiative_entries" ADD COLUMN "creature_ref" TEXT;
