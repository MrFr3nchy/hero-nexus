-- What is being concentrated on (improvements 07).
--
-- `concentrating` was a flag the DM toggled and nothing read. Casting sets
-- it with the spell's key beside it, so a second concentration spell ends
-- the first, damage asks the right save ("Concentration · Bless"), and the
-- effect rows the spell put on the table (`encounter_effects.concentration`)
-- go when it breaks. NULL while not concentrating, or when the flag was set
-- by hand with nothing named.

ALTER TABLE "initiative_entries" ADD COLUMN "concentration_spell" TEXT;

-- The Asking learns two more things (07). Who asked, when a *player* did —
-- a caster asking a fellow hero's consent, or the save their spell calls
-- for — so the DM's staff-only gate can stand aside for exactly those. And
-- what the answer settles: a JSON `payload` the server wrote when it asked
-- (the spell, the target, the damage waiting on the save, the concentration
-- being held), read back by `answerCheck` and trusted because nobody else
-- can write it.
ALTER TABLE "campaign_checks" ADD COLUMN "asked_by_character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL;
ALTER TABLE "campaign_checks" ADD COLUMN "payload" TEXT;
