# Improvements — the specs

`improvements.txt` is the list: what was asked for, what already exists, and
what was added in review. The twelve documents beside it are that list grouped
by the code it touches, each with enough implementation detail to start a
branch from. Read the list first; a spec assumes you have.

These are plans, not law. `docs/design-language.md`, `docs/content-model.md`,
`docs/sharing-model.md` and `src/db/README.md` remain binding; where a spec
here would bend one of them, the spec says so and the doc is updated in the
same change or the spec loses.

## The specs, in build order

| #   | Spec                                                                            | One line                                                                                                          | Depends on     |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| 01  | [Table rules](01-table-rules.md)                                                | Advise / Enforce, the DM's optional-rule toggles, per-fight overrides, Rules at hand, house rules as content      | —              |
| 02  | [Board authoring and the shelf](02-board-authoring-and-shelf.md)                | Brushes, rectangle, fill, ruler, placing combatants, multi-select, plan placements, shelf polish, phone landscape | —              |
| 03  | [Dice and rolls](03-dice-and-rolls.md)                                          | Every roll animates; physical dice with server-side maths                                                         | 01             |
| 04  | [Conditions, durations, countdowns](04-conditions-durations-countdowns.md)      | `encounter_effects`; conditions feed rolls and speed; round counters; rests clear what ends                       | 01             |
| 05  | [Action economy](05-action-economy.md)                                          | Action / bonus / reaction / movement per turn; Dash, Dodge, Ready…; opportunity attacks; the movement fence       | 01 04          |
| 06  | [Attacks, damage, cover](06-attacks-damage-cover.md)                            | Hit vs AC, apply or propose damage, crits, resistances, cover, flanking, ammunition, improvised                   | 01 03 04 05    |
| 07  | [Casting and concentration](07-casting-and-concentration.md)                    | Cast flow, saves through the Asking, consent between players, AoE templates, concentration breaks, Polymorph      | 01 03 04 05 06 |
| 08  | [Things, traps, vision](08-things-traps-vision.md)                              | Levers that change terrain, traps that fire on entry, per-token vision and light                                  | 02 04 06 07    |
| 09  | [Inventory, weight, consumables, shop](09-inventory-weight-consumables-shop.md) | Encumbrance, Use on a potion, jump and hero footprint, throwing, a merchant                                       | 01 (05 06)     |
| 10  | [Time, calendar, rests, progression](10-time-calendar-rests-progression.md)     | A DM-owned calendar, survival, rests as a flow, level-up prompts, Heroic Inspiration                              | 01 04          |
| 11  | [Monsters and DM tools](11-monsters-and-dm-tools.md)                            | Group initiative, legendary/lair/recharge, undo, keyboard                                                         | 04 05 06       |
| 12  | [Screen polish](12-screen-polish.md)                                            | Control heights, tab/notification reach, ambient sound                                                            | —              |

01, 02 and 12 have no dependencies and can start today. 03 and 04 are the
next two, and everything in the fight (05–08, 11) stands on 04.

## What every spec assumes

- **Schema and migration in the same change.** Migration numbers are
  reserved in the specs (0046–0060) so two branches do not collide; if the
  order of landing changes, renumber the file, not the spec.
- **Pure first.** Every rule goes in a module with no React, no db, no
  `server-only` (`lib/battlemap.ts`, `lib/conditions.ts`, `dying.ts` are the
  models) and is asserted apart from the app. The server calls it; the client
  calls it for advice; neither re-implements it.
- **The server rolls, computes and decides.** The browser sends intent — an
  action key, a target id, a face it saw on a real die — never a modifier, a
  total or a verdict.
- **Fences honour 01.** Anything that refuses does so only under `enforce`,
  throws a bare code, and is overridable by staff with `ruling: true`, which the
  log records.
- **Writes bump; moments publish.** `bumpVersion` after every write a live view
  reads, in the server module; a new `TableEvent` kind for anything the table
  should look up for, with its audience decided in the hub.
- **Verified against the running app**, per CLAUDE.md: real accounts, real
  cookie jars, real server-action POSTs, the payload asserted on; rendered
  surfaces looked at in both palettes.

## New event kinds, gathered

So `events.ts` grows once per spec and the names do not drift:
`rules` (01), `effect` (04), `action`, `opportunity` (05), `cast` (07), `time`,
`levelup` (10), `undo` (11), `ambience` (12). `thing` (existing) gains
`what: 'fired'` (08). Roll events gain `physical` (03) and `outcome` (06).

## New `SCREEN_PANELS`

`rules` (01), `shop` (09). Everything else lands inside a panel that exists.
