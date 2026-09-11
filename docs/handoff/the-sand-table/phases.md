# The sand table — phases

Build order. Each phase leaves the app usable, and each was reviewed in its own commit
on `feat/the-sand-table` before the branch fast-forwarded into `main`. `[x]` means
landed **and verified**, not merely written. Nothing is left open.

The model is in [README.md](README.md). Read it first — its six decisions are why
phases 1 and 4 have the shape they do, and its "What has been verified" sections carry
the runs that proved each phase.

**Every phase that touches the database edits `src/db/schema.ts` and a new
`src/db/migrations/NNNN_*.sql` in the same change.** There is no drizzle-kit generate
step. The sand table took `0041`; `0042` and `0043` went to the-three-tables; the
next free number is `0046` — `0044` and `0045` are phases 6 and 7.

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

## Phase 6 — Paper standees `[built]`

The renderer drew every combatant as a disc with a circle floating above it — a face
when the character had one, two letters when not — and the terrain as extruded boxes.
Coherent, and not a thing anybody would call epic. The way up is **not** models and
textures, which the README put out of scope on purpose; it is **2.5D**: an image that
stands upright on the board and turns to face the camera. A paper miniature in a
slotted base — the thing a table already knows, and the thing this app's parchment
already looks like.

Three halves, cheapest and most visible first:

- [x] **Heroes.** `standeeSprite` in `BattleMap3D.tsx`: the portrait (or the initials)
      on a parchment card with a torn top edge and a gold border, a tile and a quarter
      tall for a medium creature and growing with the footprint, **anchored at its
      foot** so it stands on the base rather than hanging over it. The base keeps the
      HP ring, the gold turn ring and the ink selection ring, so nothing about ornament
      encoding state changes. A portrait with a transparent background reads as a
      cut-out; one without reads as a card. A DM-only token's card is dimmed with its
      base. The same `Sprite` the circle was — camera-facing, one draw call, cached
      faces — so this is an evolution of the existing billboard, not a new technique.
      The deckle is seeded, so a card tears the same way on every rebuild: a torn edge
      that changed on every token move would be motion nobody asked for (rule 4).
- [x] **Monsters.** `0044_token_images.sql`: a nullable `image_id` on
      `battle_map_tokens`, a reference into `campaign_images` (content-model rule 1 —
      reference, never copy), nulled when the image goes so the token stands as
      initials rather than falling over. `updateToken` refuses an image from another
      campaign (`NO_SUCH_IMAGE`). The token row carries `imageUrl`, composed on the
      server so neither board learns the route. A _Give it a picture_ popover on the
      selected token, staff only, through `ImagePicker` — which grew a `library`
      strip of the campaign's pictures, because the same ogre stands up five times
      and uploading it five times is five copies of one file.
- [x] **Cut-outs stand as themselves.** `isCutout` samples a picture's four corners
      once and remembers the answer. A cut-out is drawn whole, feet on the base, no
      card, sized by its own proportions — a paper miniature is cut along its outline,
      and a card behind an ogre with a raised club was a card, not an ogre. Paintings
      and initials keep the parchment card.
- [x] **Trees, statues, doors.** An `image` prop kind in the `TerrainDoc` —
      `{ kind: 'image', imageId, height, blocks }` — additive and optional, so the
      document's version did not need to move; `normalizeTerrain` drops an image prop
      with no image and clamps the height to 1–100 ft. A _Picture_ tool beside the
      prop select: choose from the library or upload, feet tall, whether it blocks the
      tile, then tap a tile to stand it there and tap again to take it down. The 2D
      board draws the picture fitted inside the tile; the 3D view stands it up as the
      raw image, `height` feet tall, as wide as its proportions make it, billboarded.
      Fog already drops props on unlit tiles, so a tree in the dark stays dark.
- [x] **Found on the way: the DM could not see the party's faces.** `canViewCharacter`
      looked for the viewer's member row, and the GM has none — the trap every targets
      table in this schema records — so the DM's board drew initials where the players'
      drew portraits. The GM of the seat's campaign may look now. And a replaced
      portrait showed stale for five minutes behind the route's cache; the URL is
      versioned by the portrait row.

**Traps.** Textures are per image and cached by URL through the face cache the two
boards already share. Fog stays honest — it is a server-side filter on whether the
footprint is revealed, so a tall standee cannot peek out of the dark. Nothing here
animates and nothing is an emoji.

**Verified (monsters and props)** — six of the owner's pictures uploaded through the
real route into the probe campaign's library (a 6 MB tree tripped a limit on large
multipart posts through the middleware — "Response body object should not be disturbed
or locked" — went in at 1400 px for the first look, and then in full once the
middleware was told to leave the image routes alone, below). In
Chrome as the DM: the library strip in the token popover; the ogre picture chosen for
Ogre 1, which then stood as a cut-out on its red base with the HP ring, and wore the
picture in its circle on the 2D board; the _Picture_ tool with the tree at 20 ft and
the door at 10 ft tapped onto tiles, drawn fitted on the 2D board and standing in 3D;
the party's faces on the DM's board for the first time. Headless as the player: the
tree on a lit tile in the live state and the door on a dark one absent; the shared
ogre's `imageUrl` present; an image id from nowhere refused.

**Verified (heroes)** — in Chrome, from the player's seat, on the probe board with
two seeded portraits: Kessa as a cut-out figure on a parchment card, Rurik as a painted
portrait card, both standing on their bases with the turn and HP rings underneath; the
ogre and a scenery token as initials cards; a tap on a card selects (the sprite carries
the token id, as the circle did) and draws the ink ring; a drag from the card moves the
token, and a drop on a wall's edge snaps back. Both palettes — and the first cut took
the dark palette's surface for the card and read as a black slab, which is why the
parchment is fixed. Found on the way: on a theme toggle the scene read the old `--bg`,
because `resolvedTheme` flips a beat before the class lands; the ground is now chosen
by the flag.

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

- [x] **Large uploads.** A multipart post above roughly 3 MB died inside Next's
      middleware body handling before the route ran. The campaign image routes check
      the campaign role themselves on every request, so the middleware matcher now
      leaves `/api/campaigns/*/images` alone, and the upload route answers a
      signed-out post with 401 rather than a crash. The 6 MB tree went through.
- [x] **Size on the board.** `dealEncounterIn` reads each dealt creature's size off
      the reference the entry remembers — one bestiary read per distinct creature —
      and deals it with the footprint to match: Large is two tiles a side, Huge three,
      Gargantuan capped at the token model's three. An ogre now stands on four tiles
      and its cut-out, scaled by footprint, towers over the party without anybody
      setting anything. A hand-typed combatant is medium.

**Verified (the rest)** — the 6 MB tree uploaded through the real route (201); a
signed-out GET of an image and a stranger's both 404; a signed-out POST 401. Two
ogres redealt at footprint 2, at (6,6) and (8,6), both standing on 2×2 bases in
3D and drawn at two tiles across on the 2D board, wearing the ogre picture.

## Phase 7 — Things a table can do something to `[built]`

A door that is open, closed or locked; a chest that can be picked; a window that
can be smashed. **A thing is a scenery token, not a mark in the terrain**, because a
player changes it — the terrain is the DM's to write, and "I open the door" is not an
edit to the map. `0045_interactive_tokens.sql` puts `state`, `lock_dc`, `hp_current`,
`hp_max` and `facing` on `battle_map_tokens`; a combatant carries none of them (its
hit points are on the sheet and in the order).

- [x] **What a thing is.** `state` is null for a boulder, else `open | closed | locked
    | broken`. Open and broken things do not block their tile — `blocksTile` in
      `@shared/battlemap/types.ts`, applied by the server when it checks a drop and by
      both boards when they light a reach, so the two cannot disagree. `lockDc` and
      the hit points are the DM's on the wire, the way a foe's numbers are: a player
      sees that a thing is locked and that it is `breakable`, not what it takes.
- [x] **Placing one.** The _Scenery_ tool became _Thing_, with a row: what it is,
      what it stands up as (the library), its state, a lock DC when locked, hit points
      (blank is unbreakable), which way it faces. The DM changes any of it later from
      _What it is_ on the selected thing.
- [x] **Doing something to it.** Anyone beside it — one tile from any tile of its
      footprint, by their own seated token; staff from anywhere — opens or closes it
      (`operateThing`). A locked thing refuses and says so. _Pick the lock_ rolls a
      Dexterity (Sleight of Hand) check on the server off the picker's own sheet
      against the DC, with advantage or disadvantage on offer; the roll lands in the
      shared log as `Pick the lock — the cellar door`, the DC does not, and the
      verdict says only whether it gave. No DC set means DC 10: a lock nobody can ever
      pick is a wall. Breaking one is the DM's, the way `applyHp` on a foe is: the
      player rolls at it through the attacks panel (a thing is a target like any
      token) and the DM applies what landed with −/+ on the status line. At 0 it is
      broken and no longer blocks; mended above 0 it is closed again — a repaired door
      is a door.
- [x] **Told to the table.** A `thing` event — opened, closed, unlocked, held (the
      lock did not give), broken — to everyone, in the gold tone, danger for broken,
      with the actor's character name.
- [x] **Drawn.** 2D: a padlock on a locked thing, a dashed green ring on an open one,
      a red cross through a broken one. 3D: a thing with a fixed facing that is open
      swings out of its frame (rotated, not animated — it is where it is); one facing
      the camera fades instead, having nothing to swing on; a broken one is nearly
      gone. A thing selected on the board lights no reach — it has no walking speed,
      and a thirty-foot glow around a door was a board full of noise.
- [x] **Fixed facing** (the item phase 6 wrote down). `facing` on scenery tokens and
      on image props: `camera`, or a compass side. A side stands the picture up as a
      plane that does not turn while the room is orbited — a signpost, a door, a wall
      panel. A tree keeps facing you.

**Verified** — headless, with a locked cellar door (DC 12, 20 hp, facing north)
placed by the DM: a player across the room told "It is locked" on open and "You are
not close enough" on pick; the player's live state carrying `state: locked` and
`breakable: true` with `lockDc` and the hit points null; Kessa stepped beside it,
rolled `1d20+4` (her Sleight of Hand off the sheet) to 20, the lock gave and she opened
it; a stranger refused; the player refused on damage; the DM broke it with 25, Kessa
walked onto its tile, the DM mended it to 5 and it read `closed`; the DM opening it
put `{"kind":"thing","what":"opened"}` on the player's stream. In Chrome as the DM:
the padlock on the 2D token, the _What it is_ popover reading the door back and
setting it locked, _Pick the lock_ from the status line giving, the door standing as a
north-facing plane in 3D and swung out of its frame once open, the _Thing_ row.

## Still to do

- **A thing's picture per state.** One picture serves open and closed; a door drawn
  ajar would want a second image. Nobody has asked.
- **Traps.** A thing that does something when stepped on is the same row with one
  more verb, and a different conversation about what the DM is told.

## Out of scope, deliberately

Unchanged from the README, and repeated so nobody helpfully doubles the review:
procedural terrain, per-token vision cones, glTF import, spell templates and rules
automation, physics, multi-level dungeons.
