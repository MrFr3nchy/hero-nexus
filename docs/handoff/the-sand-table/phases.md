# The sand table — phases

Build order. Each phase leaves the app usable, and each was reviewed in its own commit
on `feat/the-sand-table` before the branch fast-forwarded into `main`. `[x]` means
landed **and verified**, not merely written. Nothing is left open.

The model is in [README.md](README.md). Read it first — its six decisions are why
phases 1 and 4 have the shape they do, and its "What has been verified" sections carry
the runs that proved each phase.

**Every phase that touches the database edits `src/db/schema.ts` and a new
`src/db/migrations/NNNN_*.sql` in the same change.** There is no drizzle-kit generate
step. The sand table took `0041`; the next free number is `0042`.

---

## Phase 1 — The model and the 2D board `[built]`

_No Three.js. No `three` in `package.json`. A usable 2D battle map on its own._

- [x] `0041_battle_maps.sql` + `schema.ts`: `battle_maps` with the terrain as one JSON
      document, `revealed` as a JSON array of tile indices, `is_active` with a partial
      unique index so at most one board is on the table; `battle_map_tokens` with a
      nullable `entry_id` cascading from `initiative_entries` and a partial unique index
      so one combatant is on a board once. **Not** `campaign_maps` — that is the region
      map, and the README says why twice.
- [x] `src/@shared/battlemap/types.ts`: `TerrainDoc`, walls on edges with `edgeKey`
      folding the two names of one edge, `MATERIALS` append-only with the reason in a
      comment above it, `emptyTerrain`, `normalizeTerrain`.
- [x] `src/@creator/campaign/lib/battlemap.ts`, pure: Chebyshev distance with the 2024
      rule in a comment; `stepCost` (difficult doubles, climb adds, more than 5 feet up
      refused, walls on the shared edge and on both edges a diagonal cuts); `reachable`;
      `footprintTiles` / `canStand`; `canSee` with wall height against the sight line;
      `visibleFrom`; `fogged` building a **new** document. 59 assertions, headless.
- [x] `src/server/battlemap.ts`, shaped after `maps.ts`: `getBattleMapState` fogging a
      player's document and dropping tokens on unrevealed tiles; `saveTerrain` whole;
      `placeToken` / `moveToken` refusing bounds, void, impassable, blocking props and
      occupancy; `dealEncounterIn`; `revealTiles` / `revealFromParty` / `resetFog`.
- [x] `battlemap-actions.ts`, zod at the edge, reasons named in `fail`.
- [x] The board rides `LiveState.battlemap` — one read, one nudge, one filter — rather
      than a poller of its own. The README's own recommendation.
- [x] `BattleBoard.tsx`: canvas, not SVG. Paint material, raise/lower, walls and doors on
      edges (a door opens by clicking its edge), props, lights, scenery, reveal; tap a
      token then tap a tile to move it; reach drawn as inset outlines; the HP ring by the
      `HeroCard` ratio rule; the active-turn ring dashed gold. On the Session tab and as
      a `board` screen panel.
- [x] A **Board** tab of its own on `/campaigns/[id]` — the board with the initiative
      order under it and nothing else to scroll past. The Session tab keeps its copy.
- [x] **Speed off the sheet.** A seated character's reach is priced from
      `PlayState.speed`; a monster from the bestiary gets the 30-foot default. Still
      advice rather than a fence: `moveToken` does not enforce distance, because "you
      can't get there this turn" is a thing a DM says, and a fence would put the app
      between them. That half is a decision, and it is recorded as one.
- [x] **Passing through allies.** `reachable` takes `blocked` (hostile — neither end
      nor pass) and `passable` (ally — pass, never end), per 2024's "Moving Around Other
      Creatures". `reachFor` builds both from sides off the entries, and is the one
      helper both boards call so they cannot disagree. Verified in a corridor: the
      ally's tile passed through and not ended on, the foe's neither.

## Phase 2 — The renderer `[built]`

- [x] `npm i three @types/three`. Nothing else; no `@react-three/fiber`.
- [x] `BattleMap3DLazy` — `next/dynamic` with `ssr: false`. Verified by bundle
      inspection: `three` in two chunks of its own (~564 KB), referenced by id and not
      included by the layout chunk or the campaign page chunk.
- [x] Scene from the document, rebuilt whole on terrain change: one `InstancedMesh` per
      material scaled in Y to elevation; one per wall kind on edges, an open door a
      one-foot stub; plain solids for props; a warm `PointLight` per brazier.
- [x] Tokens as groups keyed by id — cylinder base, HP ring, active-turn ring, a
      billboard above.
- [x] `OrbitControls` between 5° and 80°; `T` lerps to straight down, a cut under
      reduced motion.
- [x] One shadow-casting light. Colours off the CSS custom properties at build.
- [x] `QUALITY` as one knob (shadow map, antialias, pixel-ratio cap) — `cartograph`'s
      idea, this feature's numbers.
- [x] A `Stand it up` toggle on the board, off by default, remembered per device.
- [x] 22 geometry assertions, headless, and then seen in both palettes. Three things it
      earned on sight are in the README: the hidden-canvas crash, the dark room, the
      monolith walls.

## Phase 3 — Interaction `[built]`

- [x] Raycast against the floor instances; `instanceId` → tile via `userData.tiles`. No
      invisible planes per elevation level.
- [x] Pointer-down on a token you may move lifts it and lights its reach as gold planes
      over the tiles, by the same `reachable` the 2D board uses.
- [x] Orbit suspended while something is in hand.
- [x] **Position sent on drop, never during the drag.** A refused drop snaps back before
      any request; a refused server answer snaps back after.
- [x] A token in hand survives the rebuild a stream nudge causes.
- [x] Seen: a drag moved Kessa and the database agreed; a drop on the pillar wrote
      nothing; a miss fell through to orbit.

## Phase 4 — Fog of war `[built]`

- [x] The server filter is phase 1's. Unrevealed renders as **absent** in both views,
      because `fogged` makes it void before either renderer sees it — there is no
      boundary overlay to leak a room's shape.
- [x] A reveal brush, 1×1 / 3×3 / 5×5, gathering tiles during the stroke, drawing them
      as pending, sent **once on pointer-up**. Its first shape fired a write per pointer
      event; the README records the fix.
- [x] "Look around": reveal what every party token can see within forty feet, through
      open doors and not closed ones. "Fog it all" to start over.
- [x] Seen: a 3×3 sweep reached the server as one write of 17 tiles.

## Phase 5 — The sauce `[built]`

- [x] **Portraits on the board.** `LiveState.portraits` by character id, role-checked by
      `portraitsFor`; one image cache shared by both views; clipped to the base in 2D,
      drawn into the billboard in 3D; initials for anybody without one.
- [x] **Movement is interpolated, not teleported.** ~250 ms ease-out on the token
      group, for every viewer. Snaps under reduced motion.
- [x] **The active-turn ring.** The one animated thing on the route.
- [x] **HP on the base ring.** By the `HeroCard` rule, and absent for a foe whose HP the
      server nulled — as the tracker shows a word rather than a number.
- [x] **Elevation reads.** A shade and a `+10` in 2D; a raised block in 3D, visible from
      the default camera.
- [x] **Candlelight.** A warm point light per brazier, muted masonry, tokens the only
      saturated things. Set by eye in two passes on one board, in both palettes; a DM's
      first real room may still want a third, and that is tuning, not building.
- [x] **Rolled from the board, through the tray.** Select your token and the status row
      offers `dis · d20 · adv`. The roll goes through `rollAction` as that character —
      the server still checks whose it is — lands in the shared log, announces, and the
      tray draws the faces the server rolled. Seen: the tray tumbling over the board,
      the log reading `Kessa · From the board · d20 · 12`.
- [x] **Range at a hover.** With a token selected, the pointer over another reads
      "25 ft to Aboleth 2" — the same Chebyshev rule the reach uses, so nobody counts
      squares out loud.

---

## Verification, in one place

The rules were checked apart from the app, the server through real sessions, and the
render in a browser — all three, because each catches what the others cannot:

| Layer           | Method                                               | What it caught                                                  |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Rules           | 59 assertions against `lib/battlemap.ts`             | Nothing — and that is the point of writing them first           |
| Server          | Real cookie jars, real action POSTs, three accounts  | The shape of the fog payload; who may move what; the cascades   |
| Scene geometry  | 22 assertions against `buildTerrain` / `buildTokens` | Instance placement, wall edges, door stubs, ring tones          |
| **The browser** | Driving the app in Chrome, both palettes             | **A crash, a black room, black walls, a write-per-event brush** |

The last row is the argument for looking. Four real defects, none reachable by the
other three layers, all found in the first ten minutes of having a screen.

## Out of scope, deliberately

Unchanged from the README, and repeated so nobody helpfully doubles the review:
procedural terrain, per-token vision cones, glTF import, spell templates and rules
automation, physics, multi-level dungeons.
