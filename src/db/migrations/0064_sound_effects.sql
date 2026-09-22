-- A soundboard beside the music (improvements 12, again).
--
-- `campaign_audio` held one kind of sound: a loop for the room. A DM also
-- wants the other kind — a door, a horn, a scream — played once, over
-- whatever is already going, and not looped. That is a different thing with
-- a different control, so the row says which it is rather than the DM
-- remembering not to press Loop.
--
-- Every track uploaded before this is `ambience`, because ambience is all
-- there was.

ALTER TABLE "campaign_audio" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ambience';
