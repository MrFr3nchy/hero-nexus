# 09 — What a hero carries: weight, using things, jumping, buying

Covers from `improvements.txt`: _weight tracking and encumbrance_, _potions as
part of a turn_ (the "Use" half), _jump and size_, _throwing an item from the
inventory_, _a shop_, and `encumbrance` / `potionAction` / `healingPotions`
from 01.

Depends on 01. Touches 05 (Use spends an action) and 06 (throwing is an
improvised attack).

## Today

- `itemData.weight` (lb) and `cost` (gp) exist on every SRD item and in the
  homebrew form. The sheet sums neither.
- `inventory[]` rows have `quantity`, `equipped`, `attuned`, `notes`; no "use".
- `giveItem` and `giveCoin` (`play.ts`) move things between heroes with a
  `character_history` line each; `coinsLine` formats a purse.
- `combat.speed` and `identity.size` are on the sheet; the board footprint for
  heroes is always 1.
- Downtime has a `shopping` kind (`lib/downtime.ts`) with no mechanics.

## Design

### Weight

Pure, in `character/lib/derive.ts`:

```ts
carriedWeight(sheet, resolved): number     // Σ quantity × item weight; coins at 50/lb when the table says so
carryingCapacity(sheet): number            // STR × 15 (2024; Large ×2, Tiny ÷2)
encumbrance(sheet, resolved, rule): { carried, capacity, state: 'fine' | 'encumbered' | 'heavily' | 'over', speedPenalty, disadvantage: boolean }
```

- `basic` (2024): only `over` exists — carried > capacity → cannot move it;
  speed 0 and the sheet says so. (2024 dropped the variant; this is the book.)
- `variant` (2014 optional): > 5×STR → −10 ft; > 10×STR → −20 ft and
  disadvantage on attacks, checks and saves using STR/DEX/CON. Feeds 04's
  `speedFor` and `rollModeFor` as one more input.
- `off`: nothing computed, nothing shown.

`PlayState` carries `weight: { carried, capacity, state }`. The sheet's
inventory section and **Your hero** show "63 / 225 lb" with the state as a chip;
the builder's equipment step shows it live so a new character does not start
over the line.

### Using a thing

Extend `itemData` (content-model rule 4 — every leaf `.catch()`):

```ts
use: z.object({
  action: z.enum(['action','bonus','free','minute']).default('action').catch('action'),
  effect: z.enum(['heal','damage','temp-hp','restore-slot','condition','text']).default('text').catch('text'),
  dice: text(40),                 // "2d4+2"
  slot_level: count(9),           // restore-slot
  condition: z.enum(CONDITION_KEYS).nullable().default(null).catch(null),
  cure: listOf(z.enum(CONDITION_KEYS), 5),    // an antitoxin ends poisoned
  consumed: flag,                 // quantity −1 (a wand is not consumed; it has `charges`)
}).nullable().default(null).catch(null),
```

`sync-reference.ts` fills it for the SRD's consumables by key (potions of
healing at each rarity, antitoxin, the spell scrolls to `text`); the homebrew
form shows the block when `kind === 'consumable'` or `charges > 0`.

`useItem(characterId, campaignId, itemId, targetCharacterId?)` in `play.ts`:

1. Owner or staff; `targetCharacterId` defaults to self — administering to
   another is always an Action (2024) regardless of `potionAction`.
2. In a fight, spend per `potionAction` for potions (`use.action` for anything
   else) through 05; `NO_ACTION` under Enforce.
3. Roll `dice` on the server (`healingPotions === 'max'` takes the maximum),
   apply through `applyPlayPatch`; `restore-slot` un-expends one; `cure`
   removes the conditions (and their 04 rows); `condition` adds one.
4. `consumed` → quantity −1 (remove the row at 0 unless it came from a package
   — `grantedBy` — in which case it stays at 0 so the kit is remembered);
   `charges` → decrement, refuse `NO_CHARGES` at 0.
5. One `character_history` line, one roll row through the tray (03), a `gift`-
   style event when it was administered to somebody else.

**Your hero** gets a **Use** button on any row with a `use` block or charges;
during the viewer's turn it sits beside the action pips (05).

### Jump and size

- `jumpDistances(sheet): { long, longStanding, high, highStanding }` — long =
  STR **score** feet with a 10 ft run-up, half standing; high = 3 + STR mod,
  half standing; both capped by remaining movement (05). Shown on the sheet's
  combat block and in the board status line when a gap is selected: the board
  lights void/water/pit tiles the selected token could clear as a dashed
  outline, using `reachable` with a "jump" step that costs the gap's feet and
  requires the run-up tiles behind it.
- Heroes get a footprint from `identity.size` (`FOOTPRINT_BY_SIZE` moves to
  `@shared/battlemap/types.ts` so the sheet side can read it); `placeToken` and
  `dealEncounterIn` use it for party entries.

### Throwing what you carry

The improvised row (06) gains an item picker over the inventory: a light item
(≤ 5 lb by default; the DM can rule) is thrown 20/60 for 1d4 + STR; a weapon
without the Thrown property still uses this row. The item stays in the pack —
retrieving it is narration — unless the DM marks it "left on the board", which
drops a scenery token with the item's name where it landed (`placeToken`,
`label`) so it can be picked up again with 08's `operate`.

### A shop

```sql
-- 0056_shops.sql
CREATE TABLE campaign_shops (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  blurb TEXT NOT NULL DEFAULT '',
  markup_percent INTEGER NOT NULL DEFAULT 0,       -- applied to the item's `cost`
  buys_at_percent INTEGER NOT NULL DEFAULT 50,     -- what it pays for the party's junk
  visibility TEXT NOT NULL DEFAULT 'dm' CHECK (visibility IN ('dm','shared')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE campaign_shop_stock (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES campaign_shops(id) ON DELETE CASCADE,
  content_source TEXT NOT NULL, content_key TEXT NOT NULL,   -- a ContentRef of type item; stats resolved at read time
  name TEXT NOT NULL DEFAULT '',                              -- the denormalisation rule 1 allows
  price_cp INTEGER,                                           -- NULL = item cost × markup
  quantity INTEGER,                                           -- NULL = unlimited
  sort_order INTEGER NOT NULL DEFAULT 0
);
```

Stock refs honour the campaign library (content-model rule 6): a homebrew item
can be stocked only if it is in play. `buy(shopId, stockId, characterId, qty)`
is one transaction: `giveCoin` from the purse (refuse `CANNOT_AFFORD`), a new
inventory row or `quantity +=` on a matching ref, `quantity −=` on the stock,
one history line "bought 2 potions of healing from The Gilded Mortar for 100
gp". `sell` is the inverse at `buys_at_percent`. A **Shop** panel
(`SCREEN_PANELS`, `players: true`) lists shared shops; the DM's side has stock
editing with the compendium picker, "stock the basics" (the SRD adventuring
gear list) and a coin-purse line for the party.

Downtime `shopping` links to a shop so the period's summary can say what was
bought.

## Verification

- Pure: `encumbrance` across all three rules at the boundaries;
  `jumpDistances` for STR 8 / 20; `useItem`'s quantity and `grantedBy` rule.
- Running app: `useItem` on a potion as a player on an Enforce table with the
  action spent → `NO_ACTION`; as the same player after `ruling` → still refused;
  a `buy` that empties the purse by 1 cp too many → `CANNOT_AFFORD` and no
  rows changed.
- Browser: the weight chip in the builder, on the sheet and in Your hero; the
  shop on a phone; both palettes.

## Out of scope

Crafting, item identification, magic-item charge recharge at dawn (10's
calendar can fire it later), haggling rolls.
