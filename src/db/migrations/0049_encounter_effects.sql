-- Everything in a fight that ends (improvements 04).
--
-- One table for three things a table counts in rounds: a *condition* with a
-- duration ("Poisoned, 3 rounds"), a named *effect* that is not in the
-- vocabulary ("Rage", "Bless", "Hunter's Mark"), and a *countdown* that
-- belongs to the room rather than to anybody in it ("the ceiling comes down
-- in 3 rounds"). The clock is `advanceTurn`; `lib/effects.ts` holds the pure
-- tick and `server/effects.ts` applies it.
--
-- A condition row writes its key onto `initiative_entries.condition_keys`
-- (and the sheet, for a seated character) when it is created and takes it
-- off when it expires, so every surface that reads the keys today keeps
-- working and gains an expiry. A condition set with no duration still has
-- no row — "until removed" is the column's default meaning.

CREATE TABLE IF NOT EXISTS "encounter_effects" (
  "id"               TEXT PRIMARY KEY NOT NULL,
  "encounter_id"     TEXT NOT NULL REFERENCES "initiative_encounters"("id") ON DELETE CASCADE,
  -- Who it is on. NULL for a countdown that belongs to the room.
  "entry_id"         TEXT REFERENCES "initiative_entries"("id") ON DELETE CASCADE,
  "kind"             TEXT NOT NULL CHECK ("kind" IN ('condition', 'effect', 'countdown')),
  -- A key from lib/conditions.ts for a condition; NULL otherwise.
  "condition_key"    TEXT,
  -- Free label for an effect or a countdown; empty for a condition.
  "label"            TEXT NOT NULL DEFAULT '',
  -- Rounds left. NULL is "until removed" (or until saved, when a save is set).
  "rounds_left"      INTEGER,
  -- Whose turn it counts down on: the start or the end of the anchor's turn.
  "ends_on"          TEXT NOT NULL DEFAULT 'end' CHECK ("ends_on" IN ('start', 'end')),
  -- The turn it is measured on. NULL is the affected entry's own turn; for a
  -- room countdown, the top of the round. SET NULL on delete so an effect
  -- whose caster left the fight falls back to its own entry's turn.
  "anchor_entry_id"  TEXT REFERENCES "initiative_entries"("id") ON DELETE SET NULL,
  -- A repeated save that ends it: ability key + DC. NULL is none.
  "save_ability"     TEXT,
  "save_dc"          INTEGER,
  -- What put it there, for the log — and for concentration (07).
  "source_entry_id"  TEXT REFERENCES "initiative_entries"("id") ON DELETE SET NULL,
  "source_label"     TEXT NOT NULL DEFAULT '',
  "concentration"    INTEGER NOT NULL DEFAULT 0,
  "visibility"       TEXT NOT NULL DEFAULT 'shared' CHECK ("visibility" IN ('dm', 'shared')),
  "created_at"       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS "encounter_effects_encounter_idx"
  ON "encounter_effects" ("encounter_id");
CREATE INDEX IF NOT EXISTS "encounter_effects_entry_idx"
  ON "encounter_effects" ("entry_id");

-- The Asking closes an effect: a repeated save is put to a seated hero as an
-- ordinary check, and a pass on it ends the effect that asked. Nullable, SET
-- NULL on delete — a check outlives the fight that raised it.
ALTER TABLE "campaign_checks" ADD COLUMN "effect_id" TEXT REFERENCES "encounter_effects"("id") ON DELETE SET NULL;
