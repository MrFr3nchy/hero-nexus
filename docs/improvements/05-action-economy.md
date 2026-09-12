# 05 — The turn: action, bonus action, reaction, movement

Covers from `improvements.txt`: _Dash and Jump are missing_, _action economy_,
_opportunity attacks_, _the movement fence_, _weapon swaps as an action_ (the
economy half), _the stat block's actions spend the creature's action_.

Depends on 01 (Advise/Enforce, `movementFence`) and 04 (`canAct`, effects).

## Today

There is no notion of an action anywhere. A combatant's turn is a highlight in
the InitiativeTracker and a `turn` event; the board lights `speedFor` feet of
reach as advice; `moveToken` deliberately does not enforce distance (its
comment defers the fence to "once movement speed is on the sheet" — it is).
`StatBlockPanel` rolls a creature's action without recording that it acted.

## Design

### Data

Per-entry turn state, reset when the entry's turn begins. A JSON column keeps
the migration to one line and the shape free to grow:

```sql
-- 0050_entry_turn.sql
ALTER TABLE initiative_entries ADD COLUMN turn TEXT NOT NULL DEFAULT '{}';
```

```ts
// lib/turn.ts (pure)
export interface TurnState {
  action: boolean; // spent
  bonus: boolean;
  reaction: boolean; // spent since the start of *this* creature's last turn
  movedFeet: number;
  dashed: boolean; // extra speed granted this turn
  disengaged: boolean;
  dodging: boolean; // until the start of its next turn
  freeInteraction: boolean; // the one object interaction (a weapon draw/stow)
  ready?: { trigger: string; action: string };
  hidden?: boolean; // took Hide and passed (a flag, not stealth maths)
}
export const FRESH_TURN: TurnState;
export function beginTurn(prev: TurnState): TurnState; // resets everything except `reaction` which resets here too (2024: reaction returns at the start of your turn)
export function spend(
  turn: TurnState,
  what: 'action' | 'bonus' | 'reaction' | 'interaction'
): TurnState | null; // null = already spent
export function movementBudget(turn: TurnState, speed: number): number; // speed × (dashed ? 2 : 1) − movedFeet
```

### The actions

A fixed vocabulary in `lib/turn.ts`, `ACTIONS`: Attack, Magic, Dash, Disengage,
Dodge, Help, Hide, Influence, Ready, Search, Study, Utilize, plus **Jump** as a
movement-side entry (it is not an action in 2024, it is movement — see 09 for
the distance). Each has `cost: 'action' | 'bonus' | 'movement'`, a one-line
rule, and what it flips on `TurnState`.

`takeAction(entryId, key, note?)` in `session.ts`:

- authorises like `moveToken` — a player for their own seated character, staff
  for anyone;
- refuses `ALREADY_ACTED` when the slot is spent **and** `mode === 'enforce'`;
  in `advise` it records anyway and marks the line "again";
- refuses `INCAPACITATED` when `canAct` (04) says no — same override rule;
- writes `turn`, publishes an `action` event (`events.ts`): `{ actorLabel, action,
note }`, audience everyone (a hidden foe's actions go to staff only, using the
  token's visibility).

Dash doubles `movementBudget`; the board's lit reach reads it. Disengage sets
the flag opportunity attacks read. Dodge sets `dodging`, which 06's `attackedWith`
reads (disadvantage on attacks against) and 04's `rollModeFor` reads for DEX
saves (advantage); it drops when `canAct` fails or speed is 0.

**Ready** stores the trigger; when any other entry's turn begins,
`advanceTurn` publishes a staff-only nudge "Ilse is holding: 'if the door
opens' → 'cast Shield'". Resolving it spends the reaction.

**The stat block** (`StatBlockPanel`) calls `takeAction(entryId, 'attack')` (or
`'magic'`, or bonus for a bonus action) before rolling, so a monster that has
attacked shows it. Legendary actions bypass the slot (11).

**Weapon swap**: `applyLoadoutPatch` with `equip` during the entry's own turn
spends `freeInteraction` on the first swap and, under Enforce, the Utilize action
on the second — 2024 also lets you equip/unequip one weapon as part of an
attack, so an `equip` bundled with 06's attack call is free. Outside a fight
nothing is spent.

### Movement

`moveToken` gains the fence, under two flags: `movementFence` **and**
`mode === 'enforce'`. It prices the move with `reachable` (the cheapest path
cost to the destination, not the straight-line distance) against
`movementBudget`, adds `movedFeet` on success, and refuses `TOO_FAR` otherwise
— overridable (01). In `advise` it still adds `movedFeet` so the strip is right,
and the status line says "35 of 30 ft" in warning tone. Standing from prone costs
half speed (04's `speedFor` handles the crawl rate; `takeAction('stand')` spends
the half).

### Opportunity attacks

Position is known, so the app can offer the reaction. After a successful
`moveToken`, compute for each hostile token with an unspent reaction whether the
mover **left its reach** (was within 5 ft — 10 for a reach weapon, read from the
creature's actions text `reach 10 ft.` or the hero's equipped weapon — and is no
longer). If so and the mover did not Disengage, publish an `opportunity` event
to the hostile's owner (a player) or to staff (a foe): "Goblin 2 can take an
opportunity attack on Ilse". One tap opens the attack row (06) with the
reaction pre-spent. It is an offer — nothing fires by itself.

### The turn strip

On the acting entry's card in the InitiativeTracker and in **Your hero** during
the viewer's own turn: four pips — Action, Bonus, Reaction, Move (`movedFeet /
budget`) — filled as spent, greyed when `canAct` says no, with a compact action
menu (the twelve, grouped by cost). Staff see it for every card; a player for
their own. Pips are also drawn under the token on the board when it is selected,
same data.

`advanceTurn` calls `beginTurn` for the entry whose turn begins; end-of-turn
flags (`dodging` lasts until the _start_ of its next turn) are handled by that
reset order.

## Verification

- Pure: `spend` twice; `movementBudget` after Dash; `beginTurn` clears
  `dodging` and restores `reaction`.
- Running app: as a player POST `takeAction` for another player's character →
  `FORBIDDEN`; move 35 ft on an Enforce table with the fence → `TOO_FAR`; same
  with `ruling: true` as a player → still refused; as staff → passes with the
  ruling in the event.
- Browser: pips on the card and under the token in both palettes; the action
  menu on a phone.

## Out of scope

Rolling the attack (06), casting (07), mounted/flying movement rules.
