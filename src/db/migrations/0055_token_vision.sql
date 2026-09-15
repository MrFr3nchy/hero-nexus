-- Light and vision (improvements 08).
--
-- Two numbers per token, both optional. `vision_feet` is darkvision: how
-- far this creature sees with no light, NULL for normal sight — a foe's
-- from its block, a hero's from their species or the sheet's `senses`.
-- `light_feet` is a torch carried: the bright radius it throws, NULL for
-- none. "Reveal from the party" reads both with the board's ambient light
-- (`terrain.ambient`, in the document) to decide what the party can see.

ALTER TABLE "battle_map_tokens" ADD COLUMN "vision_feet" INTEGER;
ALTER TABLE "battle_map_tokens" ADD COLUMN "light_feet" INTEGER;
