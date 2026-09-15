-- The turn (improvements 05).
--
-- What one combatant has spent since their turn began — action, bonus
-- action, reaction, feet moved, and the flags Dash, Disengage, Dodge and
-- Ready leave behind — as one JSON blob per tracker row. `advanceTurn`
-- resets it when the turn comes round; `takeAction` and `moveToken` write
-- it; the strip on the card and the pips under the token read it. The
-- shape is `TurnState` in `campaign/lib/turn.ts`, and `'{}'` is a fresh
-- turn, so rows from before this column are unspent.

ALTER TABLE "initiative_entries" ADD COLUMN "turn" TEXT NOT NULL DEFAULT '{}';
