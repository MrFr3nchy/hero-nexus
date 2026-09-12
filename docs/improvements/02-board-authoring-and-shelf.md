# 02 — Painting the board, placing the fight, arranging the shelf

**Status: built** (`feat/improvements-02-board-and-shelf`, on top of 01). Two
departures from the plan: the rectangle tool's height variant raises or lowers
the box by 5 ft, the way the Height row does, rather than setting an absolute
height; and "place on a board" from a plan is a popover with a small map of the
chosen board beside each line (`PlanSpots`), not a mode on the big board — the
planner and the board live on different tabs. `distanceFeet` took the diagonal
rule as a third argument, as asked.

Covers from `improvements.txt`: _brush sizes_, _the Shelf_, _placing
combatants_, _a ruler_, _bulk conditions_ (the selection half), _the sand table
on a phone in landscape_.

Pure UX on top of what the sand table already has. No new rules, one small
migration. Good second task: it is what a DM feels on the first night.

## Today

- `BattleBoard.tsx` — six modes (`MODES`): Select, Floor, Height, Build, Things,
  Fog. The `brush` state (1/2/3 → 1×1/3×3/5×5) drives `brushAt` and is only
  wired into the Fog tool's reveal stroke. Floor and Height call `applyTool`
  per tile.
- Terrain writes are debounced whole-document saves (`scheduleSave` → `saveTerrain`).
- `dealEncounterIn` walks the board top-left for the party and bottom-right for
  foes; `placeToken` accepts an `entryId` but no control offers it.
- `BattleArrangement.tsx` — shelf per viewer, stored in
  `campaign_screen_layouts.layout.battle`; fold state is component state;
  reorder is ↑/↓; the desk/table screens drag (`DmScreen.tsx` `movePanel`).
- Selection is one token (`@shared/battlemap/selection.ts`).

## Design

### Brushes, rectangle, fill

Lift `brush` out of the fog block into the tool rail for Floor, Height and Fog.
Add two tool kinds to the `Tool` union:

```ts
| { kind: 'rect'; apply: 'material' | 'elevation' | 'reveal'; value: number }
| { kind: 'fill'; material: number }
```

- **Rectangle**: pointer-down anchors, pointer-move draws a dashed marquee on the
  canvas overlay, pointer-up applies to every tile in the box, one
  `scheduleSave`. Same stroke-once discipline the reveal brush established.
- **Flood fill**: pure `floodFill(doc, x, y, material): number[]` in
  `lib/battlemap.ts` — 4-connected, same-material, bounded by walls that
  block movement (a door frame is a boundary, a rail is not). Test it apart.
- **New board** dialog (`createBattleMap` already takes w/h): add a starting
  material select; `emptyTerrain` takes a fill argument.

### Placing combatants

- In Select mode, the initiative shelf panel gets a "place" affordance on any
  entry with no token on the active board: tap it, the board's status line says
  "Tap where Goblin 3 stands", the next tap calls `placeToken(mapId, { entryId,
x, y })` with footprint from the creature's size (reuse the resolution in
  `dealEncounterIn` — extract `footprintForEntry`). Escape cancels.
- **Deal them in** keeps its two lines but skips tiles the party can currently
  see for `foe` tokens (`visibleFrom` over party tokens), so an ambush is dealt
  into the dark.
- **Multi-select**: shift-tap (long-press on touch) adds to the selection;
  `selection.ts` becomes a `Set`. Moving a multi-selection moves each by the
  same delta through `moveToken`, refusing individually. Bulk conditions and
  AoE (04, 07) read the same set.
- **Placements on a plan**: migration `0047_plan_line_spots.sql` adds
  `spots TEXT NOT NULL DEFAULT '[]'` to `encounter_plan_lines` — an array of
  `{ mapId, x, y }` up to `count`. `EncounterPlanner` gets a "place on a board"
  step that opens the board in a placement mode; `startPlannedEncounter`
  (`encounter-plans.ts`) deals onto the named board at the saved spots and falls
  back to the line-walk for anything unplaced.

### A ruler

Tool `{ kind: 'ruler' }` available to everyone (not staff-only): first tap sets
the origin, hover shows `distanceFeet` and the tile count on the overlay, second
tap pins it, third clears. Honours `diagonals` from 01 — add
`distanceFeet(a, b, rule)` with the 5-10-5 variant rather than a second function.

### The shelf

- **Persist folds**: `BattleLayout` gains `folded: ScreenPanelKey[]`;
  `normalizeLayouts` cleans it; saved through the existing `saveScreen`.
- **Drag to reorder**: reuse the drag handlers from `DmScreen` (extract to a
  `useColumnDrag` hook shared by both arrangements). Keep the arrows for
  keyboard and touch.
- **Defaults**: `defaultBattleLayout` shrinks to three panels each; the strip's
  badges pull people into the rest. Existing stored layouts are untouched.
- **Two shelves** on `xl`: `BattleLayout.shelfSide: 'right' | 'both'`; when
  `both`, odd panels go left. The board region keeps its square.

### Phone in landscape

`BattleArrangement` uses `lg:flex-row` today. Add an `(orientation: landscape)
and (max-height: 500px)` variant: board fills the viewport, shelf becomes a
bottom sheet (HeroUI Drawer) opened from the strip. Check on a real phone.

## Verification

- Pure: `floodFill` on a room with a door and a rail; `distanceFeet` under both
  diagonal rules; `normalizeLayouts` with `folded` garbage.
- Running app: `placeToken` with an `entryId` from another encounter →
  `NOT_IN_THIS_FIGHT`; `dealEncounterIn` on a board with a lit corridor leaves
  foes outside it.
- Browser, both palettes: marquee, ruler overlay, drag-reorder, landscape sheet.

## Out of scope

Anything that changes what a tile _means_ (08 covers effects and traps).
