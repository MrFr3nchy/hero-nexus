-- A token stands up with a picture.
--
-- The-sand-table's phase 6, monster half. Heroes stand as their portraits;
-- a monster has no portrait row, and the SRD ships no art, so a token may
-- point at one of the campaign's own uploaded images and stand up as that.
-- A reference into campaign_images, never a copy of the file (content-model
-- rule 1), nulled when the image is deleted: the token keeps standing, as
-- initials on a card, rather than falling over with its picture.

ALTER TABLE "battle_map_tokens" ADD COLUMN "image_id" TEXT
  REFERENCES "campaign_images"("id") ON DELETE SET NULL;
