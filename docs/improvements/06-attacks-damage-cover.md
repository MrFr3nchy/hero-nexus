# 06 — Attacks that land: AC, damage, crits, cover, ammunition, improvised

Covers from `improvements.txt`: _when attacking, specify who and take damage
automatically_, _natural 20 doubles dice_, _resistances_, _ammunition_,
_improvised weapons_, _cover_, and `playersApplyDamage` / `showHitMiss` /
`crits` from 01.

Depends on 01, 03 (faces), 04 (`attackedWith`), 05 (spends the action).

## Today

- `weaponAttacks(sheet, resolved)` (`character/lib/derive.ts`) prices every
  equipped weapon: `attackBonus`, `damage`, `versatileDamage`, `range`,
  `longRange`, `properties`. Thrown weapons keep their melee ability.
- `AttacksPanel` aims at the selected token, labels the roll "Longsword · to hit
  vs Goblin 2 · 30 ft", says reach / range / long / out in words, and rolls
  through `rollForCampaign`. It compares nothing and applies nothing.
- `StatBlockPanel` rolls a creature's action the same way for staff.
- `applyHp(entryId, delta)` handles temp HP, the floor at 0, the ceiling, and
  routes a seated hero through `applyPlayPatch` so going down announces and
  death saves start.
- AC is knowable for every target: a seated hero's via `armorClass(sheet)`, a
  bestiary foe's via `creatureData.armor_class`, a hand-typed foe's via
  `initiative_entries.armor_class`.
- `creatureData` carries `damage_resistances / immunities / vulnerabilities`;
  the hero sheet has no such fields.
- `critToneOf` knows a natural 20 for the tray's tone.

## Design

### One server function for an attack

```ts
// src/server/fight.ts
export async function attack(
  campaignId,
  input: {
    attackerEntryId: string;
    weapon:
      | { kind: 'item'; itemId: string; twoHanded?: boolean }
      | { kind: 'creature-action'; name: string } // off the stat block
      | { kind: 'improvised'; label: string; thrown: boolean };
    targetEntryId: string | null;
    mode: 'flat' | 'advantage' | 'disadvantage';
    faces?: { hit?: number[]; damage?: number[] }; // 03
    ruling?: boolean; // 01
  }
): Promise<AttackOutcome>;
```

It does, in order:

1. **Authorise** — the attacker's owner or staff; spend the action via 05
   (`ALREADY_ACTED` under Enforce).
2. **Roll to hit** — `1d20 + bonus`, mode defaulted by 04's `rollModeFor` and
   the target's `attackedWith` (a prone target in melee gives advantage; a
   dodging one disadvantage; both cancel to flat per the rules). Cover (below)
   adds to the target's AC, not to the roll.
3. **Compare** — read the target's AC as above. Natural 20 always hits; natural
   1 always misses. `hit: boolean | null` (null when the target has no AC the
   app knows).
4. **Roll damage** — the weapon dice; on a crit, `crits` from 01: `double-dice`
   rolls the dice twice (2024 — modifiers once) or `max-plus-roll`. Damage type
   from `weaponStats.damage_type`; a creature action's from its text
   (`(\d+d\d+(?:\s*\+\s*\d+)?) (\w+) damage` — the same parse the stat block
   panel already does to roll it).
5. **Adjust** — if the target's creature data lists the type under resistances
   (halve, round down), immunities (0) or vulnerabilities (double), apply and
   say so. Heroes: add `combat.damageResistances / immunities / vulnerabilities:
string[]` to the sheet schema (species like dwarf and tiefling need them;
   the builder writes them from species/feat data where it can, the player can
   edit).
6. **Record** — two `campaign_rolls` rows (hit, damage) as today, plus an
   `outcome` on the hit row:

   ```sql
   -- 0051_roll_outcome.sql
   ALTER TABLE campaign_rolls ADD COLUMN outcome TEXT;   -- JSON, NULL for a plain roll
   ```

   `{ targetEntryId, targetLabel, ac, hit, damage: { amount, type, adjusted, from }, applied: null | { by, at } }`.
   `RollRow` and the `roll` event carry `outcome` filtered by role: a player
   sees `hit` only if `showHitMiss === 'everyone'`, never `ac`.

7. **Apply, or propose** — `playersApplyDamage` from 01:
   - `never`: the DM's feed and the InitiativeTracker show **"Apply 12 to
     Goblin 2"** on the roll line; pressing calls `applyDamage(rollId)` which
     runs `applyHp` and stamps `outcome.applied`. Idempotent — a second press
     says "already applied".
   - `propose`: the same button, but the player sees it too and may press it;
     the log line reads "applied by Ilse". Hero targets always require the
     target's owner or staff.
   - `apply`: applied by the server as part of the call for foe targets.

`AttackOutcome` returns both `NotationRoll`s for the tray and the verdict for
the row.

### Cover

`coverBetween(doc, from: Tile, to: Tile, occupants): 'none' | 'half' | 'three-quarters' | 'total'`
in `lib/battlemap.ts`, next to `canSee`. Walk the sight segment: a sight-blocking
wall the segment cannot see over → `total`; a `window` → `three-quarters`; a
`rail` → `half`; a blocking prop on an intermediate tile → `half` (table,
barrel, statue) or `three-quarters` (pillar, tree); another creature on an
intermediate tile → `half`. Highest wins. +2 AC for half, +5 for
three-quarters, refuse (`NO_LINE`) for total — overridable, because a DM knows
the target is leaning out. The aim line shows "· half cover +2".

Under `flanking` (01): if an ally of the attacker stands on the opposite side of
the target (the tile mirrored through the target's centre, or any tile of the
footprint's far side), the hit roll gets advantage and the line says so.

### Ammunition

When the weapon has the `Ammunition` property, find the attacker's inventory
row whose item `kind === 'gear'` and name matches the weapon's ammunition type
(arrows for a bow, bolts for a crossbow, needles, sling bullets — a small map in
`derive.ts`), decrement `quantity` by one through the play patch, refuse
`NO_AMMUNITION` at zero under Enforce. The attacks row shows "23 arrows" beside
the bow. Recovering half after a fight is a one-tap "gather arrows" that adds
back `floor(spent / 2)` — the fight's spent count lives on `turn` (05) so it
survives a page load.

### Improvised weapons

A fixed last row in `AttacksPanel` and a DM option on any token: "Improvised".
`1d4 + STR` (or DEX if thrown), thrown range 20/60, no proficiency, type
bludgeoning by default with a picker. Optional pick of an inventory item or a
prop on the board for the label ("a chair"). Goes through `attack` with
`kind: 'improvised'`.

### UI

- `AttacksPanel` rows collapse to one **Attack** button per weapon (hit and
  damage together; a Miss skips the damage roll unless the player wants it for
  a half-damage effect). Keeps the two-handed toggle, adds the cover and
  flanking words on the aim line, an ammunition count, and the improvised row.
- The `roll` line in Dice and The evening reads "Longsword vs Goblin 2 — **hit**
  (17) · 9 slashing → 4 after resistance" with the Apply button where allowed.
- `StatBlockPanel` actions use the same `attack` call with the selected board
  token as the target.

## Verification

- Pure: `coverBetween` with each obstacle kind; `adjustDamage` for resist /
  immune / vulnerable and unknown type; crit doubling under both rules.
- Running app: as a player, `attack` a foe on a `never` table → the row's
  `outcome.hit` is set, `applied` null, and the player's `RollRow` has no `ac`;
  `applyDamage` as the player → `FORBIDDEN`; as staff → the entry's HP moved once
  and a second call says applied. A hero target at 3 HP taking 5 → the `vitals`
  event fires (through `applyPlayPatch`).
- Browser: the aim line and the Apply button in both palettes; the tray shows
  hit then damage.

## Out of scope

Spell attacks and saves (07); AoE (07); mounted and underwater modifiers.
