# 11 — Running the other side: groups, legendary things, recharge, undo

Covers from `improvements.txt`: _group initiative_, _legendary / lair actions_,
_legendary resistance_, _recharge abilities_, _undo for staff_, _keyboard for
the DM_.

Depends on 04 (the tick), 05 (action slots), 06 (`attack`).

## Today

- One `initiative_entries` row per body; `numberDuplicates` names them
  "Goblin 1, 2, 3". `orderEntries` sorts by initiative then `sort`;
  `advanceTurn` walks that order and publishes `turn`.
- `creatureData.legendary_actions` is a list of features with prose; there is
  no counter. Recharge is a parenthetical in an action's name.
- Every write is final. A mis-tapped −12 is fixed by +12 and a log that says
  both.
- `StatBlockPanel` rolls a creature's actions for staff.

## Design

### Group initiative

```sql
-- 0059_entry_groups.sql
ALTER TABLE initiative_entries ADD COLUMN group_id TEXT;   -- NULL = acts alone
```

`addCreaturesToEncounter` sets one `group_id` per creature kind when the DM's
"roll initiative as a group" toggle is on (default on for six of a thing, off
for one). `rollInitiative` rolls once per group and writes the same value and
`sort` to each member. `advanceTurn` treats consecutive entries sharing a
`group_id` as **one turn**: `turnIndex` still indexes the displayed order, but
the step skips to the next entry with a different `group_id`, and the `turn`
event's label reads "The goblins". 05's turn strip shows one set of pips per
body inside the group's card, since each still gets its own action. Ungroup /
group from the card's menu.

### Legendary creatures

```sql
ALTER TABLE initiative_entries ADD COLUMN legendary TEXT;   -- JSON, NULL for the ordinary
```

`{ actions: { max: 3, used: 0 }, resistances: { max: 3, used: 0 }, lair: boolean }`,
filled on deal-in from the creature's `legendary_actions` (count the features
that name a cost — "(Costs 2 Actions)" — and read the "can take 3 legendary
actions" line; the SRD blocks are regular) and from a trait named "Legendary
Resistance (3/Day)". Staff-editable in the card.

- **Legendary actions**: the stat block panel lists them with their cost; using
  one spends `used` (refuse `NO_LEGENDARY_LEFT` under Enforce), does **not**
  spend 05's action slot, and may be taken at the end of another creature's
  turn — so `advanceTurn` publishes a staff-only nudge "Ancient red dragon: 2
  legendary actions left" after every turn that is not the dragon's. Reset to
  0 used at the start of the dragon's own turn (in `beginTurn`'s server side).
- **Legendary resistance**: when a foe with `resistances.used < max` **fails**
  a save (04's server-side foe save, 07's spell saves), the result is presented
  to staff as "failed — **use a Legendary Resistance?**" rather than applied;
  pressing it spends one and flips the outcome. The counter shows on the card
  as three pips.
- **Lair actions**: when `lair` is true, `rollInitiative` inserts a synthetic
  entry "Lair" at initiative 20 (`side: 'other'`, `creatureRef` null, tagged
  in `legendary.lair`), losing ties. Its card shows the creature's lair-action
  text if a trait carries it; otherwise a note field. Removed with the creature.

### Recharge

Parse `\(Recharge (\d)(?:[–-](\d))?\)` from each action's name at deal-in into
`turn.recharge: { [featureName]: { min, ready: true } }` (05's JSON column,
no new migration). At the start of the entry's turn, `beginTurn`'s server side
rolls a d6 for each `ready: false` feature, sets `ready` on `≥ min`, and shows
staff the tray with the verdicts ("Fire Breath recharged"). Using the feature
from the stat block panel sets `ready: false`; under Enforce a not-ready feature
refuses `NOT_RECHARGED`. Short and long rests set everything ready.

### Undo for staff

An in-process stack, not a table — the same licence as `live-hub.ts` and
`rate-limit.ts` (pinned to `globalThis`, lost on restart, and that is fine for
a mis-tap):

```ts
// src/server/undo.ts
recordUndo(campaignId, { label: 'Damage Goblin 2 −12', inverse: () => Promise<void>, expiresAt })
undoLast(campaignId): Promise<string | null>   // staff; returns the label undone
```

Writers that record an inverse: `applyHp` / `applyPlayPatch` for HP deltas
(inverse: the opposite delta, **capped so it cannot exceed the max or drop
below 0 differently** — record the before/after values and restore them, not a
delta); `moveToken` (restore x, y, altitude); `applyEffect` / condition writes
(restore the previous keys and delete the rows created); `advanceTurn`
(restore round and turnIndex — but not the effects it expired; that is a second
undo, and the label says "Turn back; effects stayed"). Ten deep, five minutes
each, one stack per campaign. The DM screen's ribbon shows the last label with
an **Undo** glyph; `Ctrl/Cmd+Z` on the DM screen when no field is focused.
Every undo publishes a `undo` event so the table knows the 12 came back.

Undo never touches rolls — a roll happened.

### Keyboard for the DM

A single `useDmShortcuts` hook on `DmScreen`, active for staff only, ignored
while any input, textarea or contenteditable has focus, and listed in a `?`
overlay:

| Key                      | Does                                                   |
| ------------------------ | ------------------------------------------------------ |
| `N` / `P`                | next / previous turn                                   |
| `D` then digits, `Enter` | damage the highlighted combatant                       |
| `H` then digits, `Enter` | heal                                                   |
| `C`                      | open the condition picker for the highlighted          |
| `1`–`6`                  | board mode (Select, Floor, Height, Build, Things, Fog) |
| `F`                      | toggle the fog reveal tool                             |
| `Space`                  | toggle the shelf                                       |
| `Ctrl/Cmd+Z`             | undo                                                   |
| `?`                      | this list                                              |

"Highlighted" is the tracker's selected row (already tracked for the stat block
panel through `useSelectedToken`), defaulting to whose turn it is. A digit
sequence shows in the ribbon while it is being typed so nothing is applied
blind.

## Verification

- Pure: the group-aware step in `advanceTurn` (extract `nextTurn(ordered,
turnIndex, direction)`); the legendary parse over the SRD's dragons and the
  lich; the recharge regex over every SRD action name.
- Running app: roll initiative with a six-goblin group → six rows, one value;
  advance from the goblins → one `turn` event, not six; fail a save with a
  legendary resistance left → nothing applied until the staff action; `applyHp
−12` then `undoLast` → HP byte-equal to before and an `undo` event in the
  stream.
- Browser: pips for legendary counters, the `?` overlay, both palettes.

## Out of scope

Mythic actions, monster morale, automatic monster tactics.
