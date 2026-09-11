# Handoff — the sand table

A 3D battle map for running combat at the table: a DM builds terrain on a top-down grid,
the party sees it rendered in three dimensions, and tokens move on it in real time.

**The shape of the whole thing in one sentence: the map is authored in 2D and rendered
in 3D.** There is no 3D editor. A DM paints a tile grid — elevation per tile, walls on
tile edges, props at points — and the renderer extrudes that grid into geometry. This is
the decision everything else follows from, and section [Decisions](#decisions-already-made)
argues it properly.

"Done" for this handoff means five phases, five branches, five reviews. Phase 1 is
shippable on its own and produces a working 2D battle map with no Three.js anywhere in
the bundle. If the 3D work stalls, phase 1 still leaves the app better than it found it.

---

## Status

**Phase 6 — paper standees — is built**: heroes stand as their portraits, a token
can stand as any of the campaign's pictures, and a picture can stand on a tile.
**Phase 7 — things a table can do something to — is built**: a door that is open,
closed or locked, picked or broken, by the people beside it. **Phase 8 — looking the
part — is built**: drawn surfaces on both boards, miniatures instead of counters, a
table under the room, and tap-to-move in 3D. See [phases.md](phases.md).

**Branch: `feat/the-sand-table`, cut from `feat/the-same-room`.** Not from `main`: the
map needs the stream, and the stream is on that branch.

[phases.md](phases.md) carries the item-by-item state. **Phase 1 is built and verified** — the model, the rules, the fog filter and the 2D
board. **Phase 2 is built and seen** — the renderer, behind a `Stand it up` toggle, verified
for geometry, bundle split, and in a browser in both palettes. **Phase 3 is built and seen** —
drag a token in the 3D view, ghost its reach, drop and send. **Phase 4 is built and seen** — a
reveal brush that writes once per stroke. **Phase 5 is built** — portraits, interpolated
movement, the turn ring, HP rings, elevation, candlelight, and rolling from the board.
What each run proved is at the foot of this file.

**Amended by the-three-tables' second pass** (`docs/handoff/the-three-tables/phases.md`):
a board now follows the fight — `bindBoardToFight` clears the previous fight's tokens
when a new one starts — and the 3D view fills its region, frames the camera to the
board, and publishes a tap to the shelf's selection.

Everything below was read out of `main` on 2026-09-10, before `feat/the-same-room`
landed. Specific line references are deliberately avoided in favour of symbol names,
because you can grep and I could not guarantee the line numbers would survive.

**The transport question this section originally raised is settled.** The author of
this document could not see an unpushed branch and warned the next reader to look for
one. It exists: [the-same-room](../the-same-room/README.md) built Server-Sent Events
over a process-local hub — exactly the shape recommended below, for the reasons given
below — and it is verified. What that means for the map, concretely:

- **Do not build a transport.** `src/server/live-hub.ts` has `bumpVersion(campaignId)`
  and `publish(campaignId, event, audience)`. A token move is a bump; a fight starting
  is already an event.
- **`useCampaignLive` no longer polls at 3s.** It joins one stream per browser through
  `src/@shared/table/connection.ts` and re-reads `getLiveState` on a nudge, with a 30s
  floor. `useBattleMapLive` should be built the same way, or — simpler — the battle map
  state should ride `LiveState` as `checks`, `party` and `spotlight` already do, so
  there is one read and one nudge rather than two of each.
- **The state channel carries no payload, on purpose.** Model decision 3 there: the
  server sends a version number and the browser re-reads through the role-filtered
  path. Fog of war is that same rule applied to terrain, and `getBattleMapState` is the
  filter. Nothing about the board is ever composed into a broadcast.

**Migration numbering has moved on.** `0037`–`0040` are taken by the-same-room. **Your
first file is `0041_battle_maps.sql`.**

**`campaign_maps` gained a `spotlighted` flag in `0040`** — a region map lit on every
screen at once. That is the region map doing the "look at this" half of what a table
uses a map for, and it is not a battle map. The naming-collision warning below stands.

### What already exists, and is the reason this is a 6/10 and not a 9/10

The combat model is **already built and already server-authoritative**. This is the part
people assume they have to write and this repo does not.

| Piece                                       | Where                                            | State                                                                 |
| ------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| Encounters, rounds, turn index              | `src/server/session.ts` — `initiativeEncounters` | Built. `advanceTurn(encounterId, ±1)` wraps the round.                |
| Combatants with HP / AC / conditions / side | `initiativeEntries`, `EntryRow`                  | Built. `party` \| `foe` \| `other`.                                   |
| Server-rolled initiative                    | `addPartyToEncounter`, `addCreaturesToEncounter` | Built. Reads Dex off the sheet; foes roll from `initiative_bonus`.    |
| Damage/heal with temp-HP rules              | `applyHp(entryId, delta)`                        | Built.                                                                |
| Role-filtered live state                    | `getLiveState(campaignId)`                       | Built. Strips foe HP/AC for players; strips `visibility: 'dm'` rolls. |
| Encounter prep → live fight                 | `src/server/encounter-plans.ts` — `runPlan`      | Built.                                                                |
| Player portraits                            | `src/server/character-portraits.ts`              | Built. **This is your token art. Use it.**                            |
| Countdown timers, shared or secret          | `campaignTimers`, `startTimer`                   | Built.                                                                |
| Dice thrown across the window               | `DiceTray`, `useDiceTray()`                      | Built.                                                                |

So a token is **not a new object**. A token is a position for an `initiative_entries`
row that already knows its own name, HP, AC, conditions, side, and turn order. The whole
feature is: _give the existing combatants coordinates, and draw them._

### What does not exist

- Any geometry, canvas, or WebGL. `package.json` has no `three`.
- Any concept of position, distance, or line of sight.
- Any realtime transport (see the unverified note above).

### A naming collision that will bite you

**`campaign_maps` already exists and is not this.** `src/server/maps.ts` is a _region
map_: an uploaded image with pins on it, pins carrying DM notes and links to canon
entries. It is lore furniture. Migration `0028_maps_and_pins.sql`.

It exports `MapRow`, `MapPinRow`, `MapInput`, `PinInput`, `listMaps`, `createMap`,
`addPin`. An agent grepping for "map" in this repo will find that file first and will be
tempted to extend it. **Do not.** Different lifetime, different scale, different
permissions, different everything.

Name the new module and everything in it `battlemap` / `BattleMap`:
`src/server/battlemap.ts`, `src/@creator/campaign/battlemap-actions.ts`, tables
`battle_maps` / `battle_map_tokens`, types `BattleMapRow` / `BattleTokenRow`.

---

## Context the receiver needs

### Constraints that are not obvious from the code

**1. `CLAUDE.md` states the app makes no outbound calls at runtime, and Pusher would
break that.** The literal line is that this is a self-hosted tool with "no external
services, no outbound calls at runtime", and `docs/design-language.md` rule 8 leans on
the same premise to ban CDN icons ("Hero Nexus is self-hosted and makes no outbound
calls; a CDN icon is blank on a box without internet").

The owner has since decided to run this as a **hosted** app on a DigitalOcean droplet
rather than per-user self-hosting, which arguably retires that rule — but the rule is
still written down and `CLAUDE.md` says its documents are binding. **I am not going to
silently break an invariant the repo states in its first paragraph.**

Recommendation, and it is only that: **ship Server-Sent Events, not Pusher, not raw
WebSockets.** Reasons, in order of weight:

- `src/db/README.md` already specifies SSE as the intended upgrade path, including the
  route shape (`/api/campaigns/[id]/live`) and the promise that hook consumers do not
  change. Someone already thought about this.
- Zero dependencies, zero outbound calls, no second process, no auth bridging. The Auth.js
  session cookie is already on the request; a route handler calls
  `requireCampaignRole` exactly like every other server module.
- Caddy already fronts the droplet and proxies SSE fine.
- The map is a **low-frequency** channel (see [Transport](#transport-what-the-map-needs-from-the-wire)) — this is not a
  multiplayer shooter, and SSE's one-way limitation costs nothing when every write is
  already a server action.

If the owner has already landed WebSockets, fine — the map does not care, provided the
hook boundary in `useCampaignLive.ts` holds. Pusher is the one I would push back on:
it is a paid third party in the path of a table's combat, an outbound dependency for a
feature that works offline today, and it buys nothing SSE does not already give you at
this scale.

**2. Migrations are hand-written and paired with `schema.ts` in the same commit.** From
`CLAUDE.md`: _"`src/db/schema.ts` and `src/db/migrations/_.sql` are hand-written and
edited together, in the same change. There is no drizzle-kit generate step here, and
reaching for one produces SQL nothing applies and a schema nothing matches. This is the
rule that gets broken most."\*

Latest migration on `feat/the-same-room` is `0040_map_spotlight.sql`. **Your next file
is `0041_battle_maps.sql`.** The numbering has gaps (0018, 0023, 0024, 0027 are absent)
— that is normal, files apply in lexical order, do not try to fill them.

**3. `npm run check` does not typecheck.** `npm run build` is the only typecheck.

**4. `.check-parse.ts` at the repo root carries six pre-existing prettier errors.** They
are not yours. A `npm run check` run reporting exactly those six and nothing else is a
clean run. Do not fix them; do not panic.

**5. `docs/design-language.md` is binding, and two of its rules constrain this feature
hard.** Section [Design](#design-the-sauce-and-where-the-rules-put-it) deals with it.

### What the voidshell `cartograph` module can and cannot give you

The owner has a working 3D terrain module in `MrFr3nchy/voidshell` at
`packages/ui/src/modules/cartograph/` (~230 KB of TypeScript, Three.js, PR #50). The
instinct is to port it. **Mostly don't.**

I read `cartograph/types.ts`. Its `DEFAULT_PARAMS` are `extentKm: 240`, `reliefM: 3800`,
with thermal erosion passes, rainfall-driven droplet erosion, and dendritic river
networks. It generates **continents**. A combat encounter is thirty feet across with a
table and a door in it. Every generator in that module is solving a problem this feature
does not have, at a scale three orders of magnitude off.

What is worth stealing, and it is worth stealing:

- **The `QUALITY` tier pattern** (`low` / `balanced` / `high`, each bundling mesh
  resolution, texture size, shadow map size, shadows on/off, instance cap). One knob,
  because the things it scales have to move together. Copy this idea; the numbers are
  wrong for you.
- **"Store intent, not geometry."** `cartograph`'s `CityDoc` comment puts it well: a
  hundred thousand buildings is eight megabytes of coordinates and about two kilobytes of
  _decisions_, and only the decisions are worth keeping in a file that syncs on every
  save. That is exactly the argument for the tile-grid document below.
- Possibly the scene/camera scaffolding, as a reference for how the owner likes Three.js
  set up. Read it, don't import it.

Nothing else. Do not port a river simulator into a D&D app.

---

## Decisions already made

### 1. 2D authoring, 3D rendering — and the reason

A 3D map editor is a 3D modelling program. It is a year of work, it is the part users are
worst at, and it is the reason every VTT that tried this is either dead or is a game
engine with a subscription.

A tile grid is a **spreadsheet with a nice hat**. A DM who has used Dungeondraft or drawn
on graph paper already knows how to use it: click a tile, set its height, drag an edge to
put a wall there. The 3D is then a pure function of that grid, which means it is a _view_
— and views are cheap, replaceable, and cannot corrupt your data.

This also means the 2D view is not a fallback you build later out of pity. It is the
authoring surface, it always exists, and it is what renders on a phone, on a laptop with
a dead GPU, and in the DM's prep session at 1am.

### 2. Walls live on tile _edges_, not on tiles

The tempting model is "a tile is floor or wall". It is wrong, and it is wrong in a way
that is expensive to fix later.

A wall that occupies a tile eats a 5-foot square of the battlefield. A door that occupies
a tile means a character standing _in_ a doorway is standing inside a wall. And a
tile-based wall gives you no surface to compute line of sight against — you end up
raycasting through a voxel field.

An edge-based wall is a segment between two adjacent tile centres. It costs nothing,
doors and windows are properties of an edge, and line of sight is a 2D segment
intersection test you can write in thirty lines and verify headlessly. Every serious
grid-based tactics implementation does it this way.

### 3. A token is a position for an existing `initiative_entries` row

Do not build a parallel combatant model. `initiative_entries` already carries label, HP,
temp HP, AC, conditions, concentration, side, and initiative, and `getLiveState` already
filters it correctly by role. A second source of truth for "who is in this fight" is how
you end up with a token showing 12 HP while the tracker shows 4.

`battle_map_tokens.entry_id` is a nullable FK to `initiative_entries.id`. Nullable
because a barrel, a brazier, and a locked chest are things on the map that are not in the
initiative order.

### 4. The terrain document is a JSON blob in a text column

Precedent exists: `characters.sheet` stores a whole `CharacterSheet` as JSON and the app
reads it with `sheet as CharacterSheet`. Terrain is the same shape of problem — a
document read whole, written whole, never queried by its interior.

Do not normalise tiles into rows. A 40×40 map is 1,600 tiles; as rows that is 1,600
inserts on every "fill this region with grass", and SQLite will do it, and it will still
be the wrong design.

### 5. Positions are authoritative on the server, movement is optimistic on the client

Same argument the repo already makes twice, in `session.ts` and again in the-last-breath:
_a total the browser produced is a claim about a roll, not a record of one._ A position
the browser produced is a claim about where a token is.

But a token that waits 80ms for a round trip before it visibly moves feels broken, so:
move it locally on drop, fire the server action, reconcile on the next state push. If the
server refuses (out of bounds, not your token, wall in the way if you enforce that), it
snaps back.

### 6. Fog of war is a server-side filter, or it is not fog of war

Non-negotiable and the single easiest thing to get wrong. If the server sends the whole
terrain document and the renderer hides the unrevealed parts, a player opens devtools and
reads the dungeon.

The repo already has the pattern, twice, in code you should read before writing this:

- `getLiveState` strips `hpCurrent` / `hpMax` / `armorClass` from every entry whose `side`
  is not `'party'`, **on the server**, with a comment saying exactly why.
- `listMaps` in `maps.ts` runs _two_ filters — a shared map can carry pins the party has
  not been shown — and nulls `dmNote` for non-staff rather than trusting the client.

`getBattleMapState` must do the same: build a per-viewer terrain document containing only
revealed tiles, only tokens on revealed tiles, and no `dmNote` on anything. A player's
payload should not contain the room they have not opened.

---

## The work

**Five phases, five branches, five PRs.** They are genuinely independent after phase 1.
Do not deliver this as one change; a reviewer cannot review a 4,000-line diff that
contains both a migration and a renderer.

### Phase 1 — the model and the 2D board

_No Three.js. No `three` in `package.json`. This phase ships a usable 2D battle map._

**Schema.** New migration `src/db/migrations/0041_battle_maps.sql` plus matching Drizzle
definitions in `src/db/schema.ts`, **in the same commit**. Read an existing table in
`schema.ts` first and copy its id/timestamp/FK helper conventions rather than inventing
them — I did not read `schema.ts` in full and will not guess at its column helpers.

```sql
-- battle_maps: one authored battlefield. Terrain is a document, not rows.
CREATE TABLE battle_maps (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  encounter_id  TEXT REFERENCES initiative_encounters(id) ON DELETE SET NULL,
  name          TEXT NOT NULL DEFAULT '',
  -- TerrainDoc, JSON. See src/@shared/battlemap/types.ts
  terrain       TEXT NOT NULL,
  -- Revealed tiles, JSON array of tile indices. Empty = nothing revealed.
  revealed      TEXT NOT NULL DEFAULT '[]',
  visibility    TEXT NOT NULL DEFAULT 'dm',   -- 'dm' | 'shared'
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- battle_map_tokens: where a combatant (or a barrel) is standing.
CREATE TABLE battle_map_tokens (
  id         TEXT PRIMARY KEY,
  map_id     TEXT NOT NULL REFERENCES battle_maps(id) ON DELETE CASCADE,
  -- Null for scenery: a brazier is on the map and not in the turn order.
  entry_id   TEXT REFERENCES initiative_entries(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT '',
  x          INTEGER NOT NULL,
  y          INTEGER NOT NULL,
  -- Feet above the tile's own elevation. A flying creature, a token on a table.
  altitude   INTEGER NOT NULL DEFAULT 0,
  -- 1 = medium, 2 = large, 3 = huge. Tiles occupied, per side.
  footprint  INTEGER NOT NULL DEFAULT 1,
  tint       TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'shared',  -- 'dm' | 'shared'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX battle_maps_campaign ON battle_maps(campaign_id);
CREATE INDEX battle_map_tokens_map ON battle_map_tokens(map_id);
CREATE UNIQUE INDEX battle_map_tokens_entry ON battle_map_tokens(map_id, entry_id)
  WHERE entry_id IS NOT NULL;
```

That last partial index is the thing that stops one combatant existing twice on one
board. SQLite supports partial indexes; confirm the version bundled with
`better-sqlite3@12` does before relying on it — **I did not run this SQL.**

**The document type.** New file `src/@shared/battlemap/types.ts` — `@shared` because both
the server module and the client renderer need it.

```ts
/** One authored battlefield. Row-major throughout: index = y * w + x. */
export interface TerrainDoc {
  format: 'hero-nexus.battlemap';
  version: 1;
  w: number;
  h: number;
  /** Feet above the datum, per tile. Integers, D&D thinks in 5s but 1s are legal. */
  elevation: number[];
  /** Index into MATERIALS, per tile. 0 is void — no floor, nothing to stand on. */
  material: number[];
  /** Walls sit on the edge between two tiles, never on a tile. */
  walls: Wall[];
  props: Prop[];
  /** Warm points. The palette is candlelight; lean into it. */
  lights: Light[];
}

export interface Wall {
  /** The tile the edge belongs to. */
  x: number;
  y: number;
  /** Which of its four edges. */
  side: 'n' | 'e' | 's' | 'w';
  kind: 'solid' | 'door' | 'window' | 'rail';
  /** Feet. A rail is 3, a wall is 10, a cliff face is whatever the drop is. */
  height: number;
  /** Doors only. A closed door blocks sight and movement; an open one blocks neither. */
  open?: boolean;
}
```

`MATERIALS` is a flat const array — stone, dirt, grass, wood, water, lava, void — each
with a display name, a 2D swatch colour, a 3D colour, and a `difficult: boolean`. Index
0 is void. Adding a material appends; **never reorder it**, because every saved map holds
indices into it. Say so in a comment above the array or someone will alphabetise it.

**The pure rules module.** `src/@creator/campaign/lib/battlemap.ts`. No React import, no
`three` import, no `server-only`. This is where distance, movement cost, occupancy, line
of sight, and fog reveal live.

This is not a stylistic preference — it is how `the-last-breath` verified 25 death-save
rules against `dying.ts` directly, apart from the app, and it is the only way any of this
gets tested, because you cannot headlessly test a WebGL canvas.

Rules to implement, all 2024:

- **Diagonals cost 5 feet**, same as orthogonal. 2024 dropped the 5-10-5 alternate rule.
  This makes distance Chebyshev: `max(|dx|, |dy|)` × 5. It is much simpler than 2014 and
  people will assume you got it wrong; put the rule in a comment.
- **Difficult terrain doubles** the cost of entering a tile.
- **Elevation change** — climbing costs 1 extra foot per foot climbed. Entering a tile
  more than 5 feet higher without a climb is not a move.
- **Occupancy** — a tile holds one creature of a given size; a `footprint: 2` token
  occupies a 2×2 block anchored at `x,y`.
- **Line of sight** — segment from centre to centre, tested against every wall segment
  whose `kind` blocks sight and whose `height` exceeds the sight line at the crossing.
  A `rail` and an `open` door do not block; a `window` blocks movement and not sight.

**The server module.** `src/server/battlemap.ts`, structured to match `maps.ts` — a
`staff()` helper wrapping `requireCampaignRole(campaignId, ['gm','co-gm'])`, a
`staffForMap(mapId)` that resolves the campaign first, `NOT_FOUND` thrown as a bare
`Error` with a code string. Read `maps.ts` and mirror it; the house style there is good
and consistent.

The read path is one function:

```ts
export async function getBattleMapState(
  campaignId: string
): Promise<BattleMapState>;
```

Role-filtered, exactly as `getLiveState` is. For a player it returns a `TerrainDoc` whose
unrevealed tiles have `material: 0` and `elevation: 0`, walls bounding only revealed
tiles, and tokens standing only on revealed tiles. **Build a new document; do not mutate
and return the stored one.**

**The 2D surface.** Route: a new tab on `/campaigns/[id]`, alongside the existing ones.
Canvas 2D, not SVG — a 60×60 grid is 3,600 nodes and the DOM will hate you. Tools: paint
material, raise/lower elevation, draw wall along an edge, place prop, place light, place
token. Existing tokens come from the active encounter's `initiative_entries` via a
"deal the party in" button mirroring `addPartyToEncounter`.

**Estimate: the biggest phase. Two to three weeks of real evenings.** It is also the one
that determines whether the rest is pleasant.

### Phase 2 — the renderer

`npm i three @types/three`. Nothing else. No `@react-three/fiber` unless you have a
reason you can write down — it is another abstraction over an API you are going to be
fighting anyway, and this scene is static enough not to need a reconciler.

**Critical: dynamic import with `ssr: false`.**

```ts
const BattleMap3D = dynamic(() => import('./BattleMap3D'), {
  ssr: false,
  loading: () => <DiceSpinner label="Setting the table…" />,
});
```

Three.js is roughly 600 KB minified. If it lands in the campaign page's initial bundle,
every DM who opens the quests tab pays for it. And it will crash on the server — there is
no WebGL in Node.

Build the scene from the `TerrainDoc`, once, into instanced meshes:

- **Floor**: one `InstancedMesh` of a unit box per material, scaled per instance in Y to
  the tile's elevation. One draw call per material, not per tile.
- **Walls**: one `InstancedMesh` per wall kind, positioned on edges — offset half a tile
  from the tile centre in the direction of `side`.
- **Props**: instanced per prop kind.
- **Tokens**: a cylinder base plus a billboarded plane above it. See phase 5.

Camera: `OrbitControls` with a constrained polar angle (roughly 15°–80°) so nobody ends
up underneath the floor, and a hotkey that lerps to straight-down. Straight-down is the
2D view rendered in 3D, and it is what people will actually fight in — make sure the
transition is smooth, because that continuity is most of what sells the feature.

Lighting: one warm directional as the key, one cool ambient as fill, and a small
`PointLight` per `Light` prop. **One shadow-casting light maximum.** The palette is
already parchment and candlelight (`--gold` `#b4894a`, `--bg` `#faf6ef`); pull the scene
colours from the CSS custom properties at mount so light and dark mode both work rather
than hardcoding hex.

Rebuild the whole scene on terrain change. Terrain changes during prep, not during a
fight, and incremental mesh updates are a class of bug you do not need.

**Estimate: one to two weeks.** Read-only camera, no interaction. This is the phase where
it starts looking like something.

### Phase 3 — interaction

Raycast from the pointer against the floor `InstancedMesh`; the hit gives you an
`instanceId`, which maps to a tile index, which is `(x, y)`. Do not raycast against
invisible planes per elevation level — you will fight it forever.

Drag a token: lift it slightly, ghost the reachable tiles using the movement-cost function
from phase 1, drop it on release, fire the server action, reconcile.

**Send position on drop, never during drag.** A 60fps drag over the wire is 60 writes a
second per player, and SQLite will start blocking and the tracker will stutter and you
will spend a day blaming the renderer.

**Estimate: one week.**

### Phase 4 — fog of war

The server filter from phase 1 is already written; this phase is the DM's reveal tools
and the boundary rendering. Reveal by painted region, and optionally auto-reveal what a
party token can see using the line-of-sight function.

Render unrevealed as **absent**, not as a dark overlay — the void material, nothing
there. A dark overlay is how you accidentally leak the shape of a room that the server
correctly declined to describe, because the overlay has to be drawn somewhere.

**Estimate: three to four days.**

### Phase 5 — the sauce

See below. **Estimate: a week, and it is the week that decides whether people love it.**

---

## Design — the sauce, and where the rules put it

`docs/design-language.md` is binding and two rules bear directly on this.

**Rule 1 — "the object is the hero."** You are safe. The battle map _is_ the artifact.
The page leads with the board; controls go in a rail.

**Rule 4 — "one toy per page, and it must demo the product."** This is the one that will
trip you. A 3D battle map is a giant animated thing. Read the rule carefully: the toy is
one _interactive or animated moment_, and the map is the product surface, not an
ornament. But it means **the map's one animated flourish is the active-turn marker, and
nothing else on that route animates.** No fade-in panels, no floating props, no bobbing
water, no animated fog. Everything else holds still.

The dice tray is the stated exception and does not count against the budget: _"Rolling
dice is the app's loudest verb, so it gets the loudest animation."_ Which is a gift —
your loudest moment on this page is already built and already gorgeous. Wire attacks and
saves rolled from the map through `useDiceTray()` and let it throw across the window.

Where the pizzazz actually comes from, cheapest first:

1. **Portraits on the board.** `character_portraits` exists. A billboarded portrait on a
   token base is the single highest ratio of impact to effort in this whole document.
   Players see _their character_ standing in the room. _Phase 5 cropped it to a circle
   floating above the base; phase 6 stood it up as a paper standee on the base — see
   [phases.md](phases.md)._
2. **Movement is interpolated, not teleported.** ~250ms ease-out on position change,
   including for other viewers. Costs eight lines. Feels like a different product.
   **Snap instantly under `prefers-reduced-motion`** — review checklist item 10.
3. **The active-turn ring.** A gold ring on the base of whoever's turn it is, driven by
   the `turnIndex` already in `EncounterRow`. This is your one toy. Rule 6 says ornament
   encodes state, and this one encodes the most important state at the table.
4. **HP on the base ring.** Same ratio→colour rule `HeroCard` already uses: `success`
   above 50%, `warning` above 25%, `danger` below. And — this matters — **for a `foe`
   the server has already nulled `hpCurrent` for players**, so the player's ring shows
   the word, not the number, exactly as the tracker does. Consistency here is free and
   its absence would be glaring.
5. **Elevation reads instantly.** The entire argument for 3D. A ledge, a pit, a staircase,
   a balcony the archer is standing on — a DM says "he's up on the gantry" and everyone
   already knows. Make sure elevation is visible from the default camera angle; if the
   default is too shallow, the feature is invisible and you built it for nothing.
6. **Candlelight.** The tokens are the only saturated things on the board; the terrain
   should be muted parchment and stone in the app's own tokens. A warm point light at
   each brazier, falling off fast. This is where the app's existing atmosphere earns its
   keep in 3D, and it is nearly free.

And rule 8: **no emoji, anywhere, ever.** Any marker the map needs — a door state, a
condition, a prop kind — is a `Glyph` added to the house set, drawn for 16px. This
includes any icon in the map's toolbar.

---

## Transport — what the map needs from the wire

The transport is settled — see [Status](#status). `useCampaignLive.ts` is still the
seam, and it now returns `{ state, error, refresh, connected }` off a stream. The
recommendation is to put the board on `LiveState` rather than beside it: one read, one
nudge, and the fog filter runs in the same place every other role filter does.

Rates, so nobody over-engineers this:

| Event          | Frequency                    | Payload                     |
| -------------- | ---------------------------- | --------------------------- |
| Token moved    | A few per minute, at most    | ~40 bytes                   |
| Turn advanced  | Once per combatant per round | Already in `LiveState`      |
| Terrain edited | Prep only. Never mid-fight.  | Whole doc, and that is fine |
| Fog revealed   | A few times per session      | Delta of tile indices       |

**Peak load is single-digit events per second for a table of six.** That number is the
reason SSE is enough and the reason Pusher is a solution to a problem this app does not
have. The hub coalesces bumps inside 40ms into one nudge, so a DM painting terrain in
prep does not make a storm of them.

---

## Verification

The house method is `docs/handoff/verifying-without-a-browser.md` — real accounts, real
cookie jars, real server-action POSTs against a production build. Follow it. A typecheck
cannot tell you that a player's payload contained the room they had not opened.

Must pass:

```bash
npm run check   # eslint + prettier — expect EXACTLY six pre-existing errors in .check-parse.ts
npm run build   # the only typecheck in this repo
```

**I did not run either of these** — I read this repo through the GitHub API and never had
a checkout. Run them before you trust anything in the code snippets above.

Rules verified headlessly against `lib/battlemap.ts` directly, the way `dying.ts` was:

- Chebyshev distance, orthogonal and diagonal, both giving 5 feet for one step
- Difficult terrain doubling, and doubling once rather than twice when combined with a climb
- A climb of 10 feet costing 10 extra
- A 15-foot step up being refused
- A `footprint: 2` token blocking all four of its tiles, and refusing to fit in a 1-wide corridor
- Line of sight: blocked by `solid`; blocked by a closed `door`; not blocked by an open one;
  not blocked by a `rail`; blocked by a `window` for movement and not for sight
- A wall whose `height` is below the sight line at the crossing not blocking a shot from
  higher ground

Verified through real server actions with real sessions:

- A player calling `getBattleMapState` on a map with one revealed room receives a document
  in which every unrevealed tile is material 0 — **assert on the serialised payload, not
  on the rendered output**
- A player receives no token standing on an unrevealed tile
- A player moving a token that is not theirs is refused, and the position is untouched
- A DM's `visibility: 'dm'` map does not appear in a player's list at all
- Two tokens cannot occupy one tile
- Deleting an encounter cascades its tokens and leaves the map standing

---

## Traps

**`campaign_maps` is not `battle_maps`.** Covered above; repeating it because it is the
mistake most likely to eat an afternoon.

**`schema.ts` and the migration, same commit, hand-written.** `CLAUDE.md` calls this "the
rule that gets broken most". Do not reach for drizzle-kit generate.

**Six prettier errors in `.check-parse.ts` are not yours.** A clean run reports exactly
those six.

**Three.js must be `ssr: false` and dynamically imported.** It will crash on the server
and bloat the shared bundle otherwise. Verify with a bundle inspection, not by eye.

**Never reorder `MATERIALS`.** Saved maps hold indices into it. Append only.

**Do not send position updates during a drag.** Drop only.

**Do not build fog of war in the renderer.** Server filter, or it is decoration.

**`InstancedMesh` instance count is fixed at construction.** You cannot push a new
instance onto an existing one. Allocate to a capacity from the `QUALITY` tier and use
`mesh.count` to control how many draw, or rebuild the mesh. This is the standard Three.js
trap and it fails silently — the extra instances simply do not render, with no error.

**Read the CSS custom properties at mount, do not hardcode colours.** The app has light
and dark palettes and the review checklist requires both to be verified. `getComputedStyle
(document.documentElement).getPropertyValue('--gold')` at scene build, and rebuild
materials on theme change.

**`getLiveState` prefers the _active_ encounter and falls back to the most recent one.**
Read it — the `??` chain means a campaign with no active fight still returns the last
encounter's entries. Your map's "deal the party in" needs to be explicit about which
encounter it is dealing into, or it will silently populate from a fight that ended in
March.

**`numberDuplicates` in `session.ts` renames entries.** Adding a second "Goblin" renames
the first to "Goblin 1". If a token caches its label rather than reading it off the entry,
your board will disagree with your tracker after the second goblin walks in. Read the
label live.

**2024 diagonals are 5 feet, not 5-10-5.** Someone will report it as a bug. It is not.
Comment it in the source so the next reader does not "fix" it.

**Test `prefers-reduced-motion` before opening the PR.** It is item 10 on the design
review checklist and it is the one people skip.

---

## Out of scope, deliberately

Say so in the PR description, because a diligent agent will helpfully do these and double
the size of the review.

- **Procedural terrain generation.** Whatever the temptation from `cartograph`. A DM wants
  the room they drew, not a room the computer invented.
- **Dynamic per-token line of sight and vision cones.** The LOS function exists after
  phase 1; wiring it to per-player rendered vision is a separate feature with its own
  performance profile and its own arguments about what a DM wants.
- **Importing 3D models.** glTF loading, an asset library, a marketplace. No.
- **Automated attacks, spell templates, area-of-effect shapes.** The dice tray and the
  tracker already handle combat resolution. Adding rules automation to the map is a
  different project wearing this one's coat.
- **Physics.** Nothing falls, nothing collides, nothing bounces.
- **Multi-level dungeons.** `elevation` handles a ledge and a pit. A second floor directly
  above a first floor is a different data model and it can wait until someone asks twice.

---

## What has been verified — phase 1

### The rules, apart from the app

59 assertions against `lib/battlemap.ts` directly, the way `dying.ts` was checked:

- One step is 5 feet orthogonal **and** diagonal; two diagonals are 10, not 15. 2024.
- Difficult terrain doubles the entry; a 5-foot climb adds 5; the two together are 15
  (doubled once, then the climb). A 10-foot step is refused as a climb.
- Void and lava refuse; water is difficult and not impassable.
- A solid wall stops the step from either side and stops a diagonal that would cut its
  corner. A closed door stops movement and sight; an open one neither. A window stops
  movement and not sight. A rail stops nothing.
- 30 feet reaches six tiles and not seven; an occupied tile cannot be entered.
- Two cannot share a tile; a large covers 2×2, falls off the board edge, and refuses a
  1-wide corridor. A blocking prop takes its tile; a non-blocking one does not.
- An archer on a 15-foot gantry sees over a 10-foot wall; from a 5-foot step the same
  wall blocks. Two people on 20-foot gantries see over a 10-foot ground wall, and not
  one standing on the gantry between them.
- `fogged` returns a **new document** and leaves the stored one untouched; the one
  revealed tile keeps its material and height; every other is void at 0; the wall
  touching the revealed tile survives and the far one does not; props and lights follow
  the same rule. `visibleFrom` respects both radius and walls.

### Fog, through real sessions

- With nothing revealed, a player's payload was void at elevation 0 with **no** walls,
  props, lights or tokens — not even the shape of the room.
- Revealing the west room: west stone, east void, the 10-foot ledge flattened to 0, the
  eight dividing walls present (they touch revealed tiles), the chest and west light
  present, and the word `pillar` **absent from their bytes**. The DM's read had all of it.
- A `dm`-visibility board came back as `null` for a player.

### Tokens

- Dealing a fight in placed the party from the top-left and foes from the bottom-right,
  foes hidden. A player saw only their own token; the DM saw seven.
- A player moved their own token; was refused a foe's ("not yours"), a pillar, an occupied
  tile and an off-board tile ("nothing can stand there"); a stranger was refused with
  "no longer exists". A DM moved a foe into the lit room and it stayed hidden until shown;
  once shown, the one on a lit tile appeared for the player and the one in the dark did
  not.
- "Look around" from a party token revealed the whole lit room through a closed door and
  nine more tiles once the door was opened.
- A second token for one combatant is refused by name. Removing a combatant took their
  token; deleting the fight left the board standing, unbound, with every combatant token
  gone.

### In a browser

- The canvas drew floor, the ledge as a shade with `+10` for staff, walls, the open door
  as a green dash, warm point lights, the chest and the pillar, tokens with the HP ring by
  the `HeroCard` rule (Kessa red at 4/38), and the dashed gold active-turn ring on A1.
- Selecting a token drew its reach as dashed outlines, through the open door and not
  through the wall. Tapping a lit tile moved it and the selection followed.
- Picking Water and dragging painted five tiles along the stroke, and they were in the
  database half a second later.

**One change it forced:** reach was first drawn as a gold fill, and so was the DM's
revealed-wash, and two washes on one tile were one wash. Reach is an inset outline now.

## Still to do in phase 1, deliberately

- **Movement is not fenced.** `moveToken` checks bounds, void and occupancy and not
  distance; the ghosted reach is advice. Fencing it needs speed on the sheet and a
  decision about what a DM does when the table agrees somebody can get there anyway.
- **Allies can be walked through in the rules, and not here.** `reachable` treats every
  occupied tile as impassable — the strict reading. Relaxing it wants sides wired to the
  board, which the token has via its entry but the reach computation does not read yet.
- **No tab of its own on `/campaigns/[id]`.** The board lives on the Session tab and as
  a screen panel. A tab may be wanted once it is the thing a fight is run from.

---

## What has been verified — phase 2 and the sauce

### The bundle

`three` lands in two chunks of its own (~564 KB) and in **neither** the layout chunk nor
the campaign page chunk, which reference it only by chunk id — a lazy import. Checked by
grepping the built chunks for `WebGLRenderer`, not by eye.

### The scene, apart from the DOM

22 assertions against `buildTerrain` and `buildTokens` directly, with a stub `document`
wide enough for the label canvas:

- One `InstancedMesh` per material — 14 stone, 1 water — with the void tile absent.
- A 10-foot ledge is 2 units tall plus the slab, top at 2; a flat tile is only the slab.
- The solid wall on the east edge of `(1,1)` sits at `x=2, z=1.5`, 2 units tall, thin in
  x and a tile long in z. The open door on the north edge of `(2,2)` is a 1-foot stub
  **standing on the higher of its two tiles**.
- The pillar is on its tile at 2 units; the brazier's light is gold and reaches 4 units.
- Kessa's ring is `danger` at 4/38; the foe whose HP the server nulled has no ring; the
  active-turn ring is gold and handed to the loop. A `dm` token is translucent.
- After the group refactor: one piece per token by id, children local to the group,
  Kessa's face drawn into her sprite and the portraitless foe's not.

### In a browser, light and dark

The render was looked at once the browser came back, and it earned three fixes on
sight — which is the argument for looking:

- **It crashed the page.** The 2D board's draw effect still ran while its canvas was
  hidden behind the 3D view; a zero-width wrapper made every token radius negative and
  `arc` threw. The effect now returns when the board is stood up, and radii are clamped.
- **Dark mode was too dark.** The sun sat low to the west and a ten-foot wall threw a
  shadow that swallowed the room beside it; the unlit floor was black. The sun is steeper
  now, and the dark palette gets a brighter fill than the numbers suggest, because the
  floor there starts nearly black.
- **Light mode walls were monoliths.** `--ink` as a two-unit slab on parchment is a black
  wall. Solid walls and props are now ink pulled halfway toward stone in both palettes.

After those: the floor extruded, the ledge as a raised block, the wall with the open door
as a gold stub at its foot, the chest, the pillar casting a short shadow, warm brazier
glow on the floor, Kessa's base with a red ring and her billboard, foes with green rings
and A1's gold turn ring. `T` lerped to straight down — the 2D board in 3D. Moving Kessa
from outside the browser put her in the east room in the 3D view with nothing pressed.

- **Not watched:** reduced motion in the renderer. The code snaps and never fills
  `moving`; it has not been seen doing so.

### Phase 3, in a browser

- Dragging Kessa from `(2,2)` to `(3,4)` in the straight-down view moved her there and
  the database agreed. The camera did not spin — orbit is suspended while something is
  in hand.
- Dragging her onto the pillar snapped her back and wrote nothing: `canStand` refused it
  locally before any request.
- A pointer-down that misses a token falls through to orbit, as it should.
- Not caught on camera: the reach ghost mid-drag. It is the same `reachable` the 2D
  board draws, as gold planes over the tiles, and it ran on both drags above.

### Phase 4, in a browser

- The reveal tool's first shape fired one server write per pointer event — the drag trap
  the handoff names for tokens, wearing a different hat. It is a brush now, 1×1 / 3×3 /
  5×5, gathering tiles during the stroke and drawing them as pending, sent **once on
  pointer-up**. A 3×3 sweep from `(0,1)` to `(3,2)` reached the server as one write of
  17 tiles, clipped at the board edge, and the DM's read said 17.
- Unrevealed renders as absent in both views, because `fogged` makes it void before
  either renderer sees it. There is no boundary treatment to add: nothing there is drawn.

### The rest of phase 5, and the three phase-1 decisions

- Allies can be passed through and not ended on, per 2024; foes neither. Verified in a
  1-wide corridor. One `reachFor` serves both boards.
- Reach is priced from the sheet's speed for a seated character. Movement is still not
  fenced server-side, and that is recorded as a decision: a DM saying "you can't get
  there this turn" is how the rule is applied at a table.
- A Board tab of its own: the board with the order under it.
- Rolling from the board goes through `rollAction` and the dice tray — seen tumbling
  over the board, and in the log as Kessa. Range reads at a hover.

Nothing planned is open. What remains is tuning on a real room, which is a different
kind of work from building.
