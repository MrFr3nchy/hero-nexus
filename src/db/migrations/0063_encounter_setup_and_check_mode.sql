-- Staging a fight, and asking for a roll with advantage.
--
-- Two unrelated columns, one migration, because both are one `ALTER TABLE`
-- and both landed in the same change.
--
-- `initiative_encounters.phase` splits what `is_active` used to conflate.
-- `is_active` means "this is the fight on the table"; it did not say whether
-- anybody had rolled yet, so a DM could not put six ghouls on the board,
-- look at them, and then start the fight. `setup` is that state: the order
-- exists, tokens can be placed and shown, nothing advances, no player is
-- told it is their turn. `fighting` is a fight under way. Every row written
-- before this is `fighting`, because every row before this was one.
--
-- `campaign_checks.mode` is what the DM asked for — advantage, disadvantage
-- or a straight roll — and `campaign_check_targets.rolled_mode` is what the
-- answer was actually rolled with. Two columns rather than one because a
-- player may overrule the DM's flag (they know about the grease, the DM does
-- not), and the log has to be able to say that they did.

ALTER TABLE "initiative_encounters" ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'fighting';

ALTER TABLE "campaign_checks" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'straight';

ALTER TABLE "campaign_check_targets" ADD COLUMN "rolled_mode" TEXT;
