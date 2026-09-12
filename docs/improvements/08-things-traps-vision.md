# 08 — Things that do something, traps, and what a token can see

Covers from `improvements.txt`: _interactive levers and buttons that change the
terrain_, _traps_, _a pressure plate for the party only_, _light and vision_.

Depends on 02 (multi-select for authoring tile sets), 04 (a trap's condition
with a duration), 06 (a trap's damage through `applyHp` / resistances), 07
(`areaTiles` for a trap that fills a corridor). Board-side only; no rules
toggles beyond `mode`.

## Today

- `battle_map_tokens` can be a **thing**: `state` open/closed/locked/broken,
  `lockDc`, `hpCurrent/hpMax`. `operateThing`, `pickLock` and `damageThing`
  (`battlemap.ts`) enforce reach, publish a `thing` event, and an open/broken
  thing stops blocking its tile.
- Terrain is a whole document (`TerrainDoc`: `material[]`, `elevation[]`,
  `walls[]`, `props[]`, `lights[]`), saved whole by `saveTerrain`.
- Fog: `revealTiles`, `resetFog`, `revealFromParty` — the last uses
  `visibleFrom(doc, tile, radiusFeet)` with one radius for everybody.
  `lights[]` exist for rendering only.
- `creatureData` has `darkvision / blindsight / tremorsense / truesight` in
  feet. The hero sheet has no vision field; darkvision lives in species prose.

## Design

### An effect on a thing

Add one JSON column; the shape is a list of changes and a trigger:

```sql
-- 0054_thing_effects.sql
ALTER TABLE battle_map_tokens ADD COLUMN effect TEXT;   -- JSON, NULL for a thing that only opens
```

```ts
// @shared/battlemap/types.ts
export interface ThingEffect {
  trigger: 'operate' | 'enter' | 'damage' | 'destroy';
  /** Fires once and is then spent, or toggles each time. */
  repeat: 'once' | 'toggle' | 'always';
  spent?: boolean;
  /** Who sets it off when the trigger is `enter`. */
  triggers: 'anyone' | 'party' | 'foe';
  /** Hidden until found: a passive Perception / Search DC. NULL = visible. */
  findDc?: number;
  changes: Array<
    | { kind: 'material'; tiles: number[]; to: number } // MATERIALS index
    | { kind: 'elevation'; tiles: number[]; to: number }
    | { kind: 'wall'; edge: string; to: WallKind | 'none'; open?: boolean } // edgeKey
    | { kind: 'thing'; tokenId: string; to: ItemState } // a door elsewhere
    | { kind: 'reveal'; tiles: number[] }
    | {
        kind: 'damage';
        area: number[];
        dice: string;
        type: DamageType;
        save?: { ability: AbilityKey; dc: number; effect: 'half' | 'negates' };
      }
    | {
        kind: 'condition';
        area: number[];
        condition: ConditionKey;
        rounds: number | null;
        save?: { ability: AbilityKey; dc: number };
      }
    | { kind: 'sound'; text: string } // a line in the feed
  >;
}
```

`toggle` remembers the previous values of each change so the second pull puts
them back; store them on the effect as `undo` when it fires.

### Firing

`fireThing(tokenId, cause: { by: userId, entryId?: string })` in `battlemap.ts`:

1. Read the effect; refuse `SPENT` when `repeat === 'once'` and spent.
2. Apply `changes` to a copy of `normalizeTerrain(map.terrain)` and write it
   through the same path `saveTerrain` uses (one write, one `bumpVersion`).
3. `thing` changes call `setThingState` directly (no reach check — the lever is
   the reach).
4. `damage` / `condition` changes resolve the tiles to tokens standing on them
   (footprint overlap), then reuse 06's damage application and 04's
   `applyEffect`; saves for seated heroes go through the Asking, foes' are rolled
   on the server. `triggers` filters by the entry's `side`.
5. Publish a `thing` event with `what: 'fired'` and the `sound` line if any;
   for a `findDc` trap that fires, the token flips to `visibility: 'shared'`
   first — everybody has seen it now.

Triggers:

- **operate** — `operateThing` calls `fireThing` after the state change (a
  lever's `state` is open/closed like a door; the labels in the UI say
  pulled/reset).
- **enter** — `moveToken` computes the path with `reachable`'s predecessor map
  (add it: the function returns costs today; return `cameFrom` too) and, for
  each tile the mover's footprint crosses, checks hidden and visible `enter`
  things. Fires the first; the move stops on that tile (the pit opened under
  you) unless the effect says otherwise. Under `advise`, still fires — a trap
  is not a rule the DM is loosening.
- **damage** / **destroy** — `damageThing` fires on any damage / on reaching 0
  (a cracked dam, a collapsing pillar).

### Finding a trap

A hidden thing (`findDc`) is `visibility: 'dm'` and never reaches a player's
`LiveState`. **Search** (05's action) on a tile within 5 ft — or passive
Perception every time a party token ends its move adjacent, under an `advise`
nudge to staff rather than an automatic reveal — compares `passivePerception`
(derived already) / an Asked Perception check against `findDc`, and on a pass
sets the thing `shared` with the `thing` event "Ilse spots a pressure plate".

### Authoring

In the Things mode of `BattleBoard`, a thing's inspector gains **"When it is
used…"**: pick the trigger, then add changes by tapping tiles (uses 02's
multi-select as the tile set), an edge, or another thing on the board. Each
change previews on the canvas in the arcane hue while the inspector is open.
Presets fill the common ones in one tap: _spike pit_ (enter · once · damage
2d10 piercing · DEX 15 half · material → rubble), _portcullis lever_ (operate ·
toggle · wall → none), _collapsing floor_ (destroy · once · elevation −10 ·
reveal).

### Light and vision

Two numbers per token, both optional, both staff-editable in the inspector:

```sql
-- 0055_token_vision.sql
ALTER TABLE battle_map_tokens ADD COLUMN vision_feet INTEGER;    -- NULL = normal sight
ALTER TABLE battle_map_tokens ADD COLUMN light_feet INTEGER;     -- a torch carried: bright radius, NULL = none
```

Defaults on placement: a foe's `vision_feet` from its creature `darkvision`; a
hero's from a small map of SRD species keys with darkvision (dwarf, elf, gnome,
orc, tiefling, drow… — `lib/vision.ts`, the same shape as `FOOTPRINT_BY_SIZE`),
overridable on the sheet with a new optional `senses.darkvision` field so a feat
or a homebrew species can set it.

`revealFromParty` becomes per token: a tile is revealed to the party if some
party token can `canSee` it **and** either the tile is lit (within a
`lights[]` radius or a token's `light_feet`, or the board's ambient light is on —
a `TerrainDoc.ambient: 'bright' | 'dim' | 'dark'` field, default bright so every
existing board keeps working) or it is within that token's `vision_feet`. Dim
light is treated as lit for reveal and noted in the status line; the
disadvantage on Perception it carries is 04's problem if anyone wants it.

The 2D board draws lit radii as a warm wash and, when ambient is dark, unlit
revealed tiles in a cool grey so the party can tell "we have seen this" from
"we can see this now". `BattleMap3D` already renders `lights`; it reads
`ambient` for the scene's base light.

## Verification

- Pure: apply/undo of every change kind on a `TerrainDoc`; `reachable`'s
  `cameFrom` path across a trap tile; the lit-or-in-vision predicate over a
  dark corridor with one torch.
- Running app: a player `moveToken` across a hidden `enter` trap → token stops
  on it, `damage` proposal appears for staff, thing becomes `shared`, and the
  player's stream gets the `thing` event but never saw the token in
  `LiveState` before it fired. A `toggle` lever pulled twice leaves the terrain
  document byte-equal to the start.
- Browser: presets, the change preview, the dark-board wash in both palettes.

## Out of scope

Line-of-sight fog per player (everybody at the table sees the party's union —
that is decided in `battlemap.ts`'s header and stays), weather, sound
propagation.
