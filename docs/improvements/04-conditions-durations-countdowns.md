# 04 — Conditions that do something, effects that end, and counting in rounds

Covers from `improvements.txt`: _long rest does not fix conditions_, _poisoned
should cause disadvantage_, _something happening in N turns_, _condition
trackers (rage)_, _exhaustion changes nothing_, _bulk conditions_ (the apply
half), _incapacitated greys the action strip_ (the data half; the strip is 05).

This is the spine of the fight. 05, 06 and 07 all hang effects off it.

## Today

- `CONDITIONS` (`lib/conditions.ts`) is a fixed vocabulary with a hint line and
  a tone. Stored comma-separated in `initiative_entries.condition_keys` and on
  the sheet in `combat.conditions`; `writeConditions` (`play.ts`) writes both.
- Exhaustion is `combat.exhaustion` 0–6, editable on the PlayCard, −1 on a long
  rest. Nothing reads it for rolls or speed.
- `restParty` clears nothing condition-wise (correct as far as it goes).
- Nothing has a duration. `campaign_timers` are wall-clock instants;
  `campaign_clocks` are progress segments.
- `advanceTurn` (`session.ts`) is the one place a round ticks; it publishes the
  `turn` event.
- Roll mode (flat / advantage / disadvantage) is chosen by hand in RollPanel,
  AttacksPanel and ChecksPanel; `withAdvantage` rewrites the notation.
- `speedOf` in `BattleBoard.tsx` reads `combat.speed` and nothing else.

## Design

### Data: one table for everything that ends

```sql
-- 0049_encounter_effects.sql
CREATE TABLE encounter_effects (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL REFERENCES initiative_encounters(id) ON DELETE CASCADE,
  -- who it is on; NULL for a countdown that belongs to the room
  entry_id TEXT REFERENCES initiative_entries(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('condition','effect','countdown')),
  -- 'poisoned' for a condition; free label otherwise ("Rage", "Bless", "Ceiling falls")
  condition_key TEXT,
  label TEXT NOT NULL DEFAULT '',
  -- when it ends. NULL rounds_left = until removed.
  rounds_left INTEGER,
  -- whose turn it counts down on: 'start' | 'end', measured on anchor_entry_id (NULL = the affected entry; for a room countdown, the top of the round)
  ends_on TEXT NOT NULL DEFAULT 'end' CHECK (ends_on IN ('start','end')),
  anchor_entry_id TEXT REFERENCES initiative_entries(id) ON DELETE SET NULL,
  -- a repeated save: ability + dc; NULL = none
  save_ability TEXT,
  save_dc INTEGER,
  -- what put it there, for the log and for concentration (07)
  source_entry_id TEXT REFERENCES initiative_entries(id) ON DELETE SET NULL,
  source_label TEXT NOT NULL DEFAULT '',
  concentration INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('dm','shared')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX encounter_effects_encounter_idx ON encounter_effects(encounter_id);
```

`schema.ts` gets the matching `encounterEffects` table in the same change.

A **condition** effect writes its key onto the entry (and the sheet, via
`writeConditions`) when created and removes it when it expires — so every
surface that reads `conditionKeys` today keeps working and gains an expiry.
An **effect** is a named buff/debuff with no vocabulary key (Rage, Bless, Hunter's
Mark). A **countdown** with `entry_id = NULL` is the room's clock in rounds.

Conditions set outside a fight (`setOwnConditions`) stay as they are: on the
sheet, no row, no duration — until 10 gives the world a calendar to hang "8
hours" on.

### The tick

`advanceTurn` becomes the one clock. After computing the new `(round, turn)`:

1. For the entry whose turn **ended**: every effect anchored to it with
   `ends_on = 'end'` decrements; at 0 it expires. Effects with a save re-prompt
   first (below) and expire on a pass.
2. For the entry whose turn **begins**: same for `ends_on = 'start'`.
3. At the top of a new round: room countdowns decrement; at 0 they announce.

Each expiry publishes a new `effect` event (`events.ts`): `{ entryLabel, label,
what: 'ended' | 'saved' | 'fired' }`, audience by `visibility`. A rules module
`lib/effects.ts` holds the pure `tick(effects, { endedEntryId, beganEntryId,
newRound }) → { remaining, expired, prompts }` so it is tested apart from the db.

**Repeated saves** (Hold Person, a monster's poison): a prompt for a seated hero
goes through the Asking (`requestCheck` kind `save`, the effect id in the prompt
so `answerCheck` can close it); a foe's is rolled on the server off its
`saving_throws` / `ability_scores` and shown to staff with the tray (03).

### Conditions feed the rules

A pure `lib/condition-effects.ts` answers questions; nothing else hardcodes a
condition:

```ts
rollModeFor(conditions, exhaustion, what: 'attack' | 'check' | 'save', ability?) → 'flat' | 'disadvantage'
d20PenaltyFor(exhaustion) → -2 * level                     // 2024: every d20 test
speedFor(baseSpeed, conditions, exhaustion) → number        // grappled/restrained 0; prone: crawl (half); -5 ft per exhaustion level
canAct(conditions) → { action, bonus, reaction, move }      // incapacitated & friends: none
attackedWith(conditions of the target, melee: boolean) → 'advantage' | 'disadvantage' | 'flat'
```

Consumers:

- **RollPanel / AttacksPanel / ChecksPanel** default the mode from `rollModeFor`
  and show why ("Poisoned · disadvantage") beside the mode picker. The player
  can flip it back — the mode is a default, never a lock, whatever `mode` says
  in 01; only 06's Hit/Miss comparison becomes a refusal under Enforce.
- **Board reach** — `speedOf` becomes `speedFor(...)`; grappled shows no lit
  tiles and says so in the status line.
- **PlayState** gains `d20Penalty` and `effectiveSpeed` so PlayCard and the
  party panel show the exhaustion arithmetic instead of a number in red.
- **05's action strip** reads `canAct`.

### Applying in bulk

`applyEffect(encounterId, entryIds[], input)` — one server call, one row per
entry, one event ("The DM has put 3 goblins to sleep"). The InitiativeTracker's
condition picker and the board's multi-selection (02) both call it.

### Rests

`restParty('long')` deletes every `encounter_effects` row for seated characters
whose `rounds_left` is not null (anything measured in rounds is over after
eight hours) and leaves `until removed` rows alone — a curse is not a nap away.
Announce what cleared.

### UI

- **Initiative card**: chips grow a count — "Poisoned · 3" — and a tooltip with
  the source and the save. A room countdown renders as its own row at the top
  of the order, gold, with the label and rounds left; hidden ones only for staff.
- **Add an effect** on any card: kind, label / condition, rounds, ends on
  start/end, optional save. The existing `ConditionPicker` becomes the first tab
  of this.
- **PlayCard / Your hero**: the same chips, so a player sees their own clock.

## Verification

- Pure: `tick` across a full round with start- and end-anchored effects,
  an effect anchored to an entry that was removed, a countdown reaching 0;
  `speedFor` and `rollModeFor` for every condition in `CONDITIONS`.
- Running app: create a 2-round condition as staff, advance twice via the
  action id, assert the entry's `condition_keys` and the sheet's
  `combat.conditions` both drop it and the player's stream got the event.
- Browser: chips with counts in both palettes; the grappled board says why.

## Out of scope

Concentration's break-on-damage (07), the action strip (05), a calendar for
out-of-fight durations (10).
