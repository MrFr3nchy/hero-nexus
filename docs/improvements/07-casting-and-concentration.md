# 07 — Casting a spell, holding it, and asking the room to save

Covers from `improvements.txt`: _concentration checks_, _spell DCs (Polymorph)_,
_consent for spells on another player_, _cast spells outside combat_, _AoE
templates_, _ritual casting_, _monster spell DCs_, _Polymorph / Wild Shape /
summons_.

Depends on 01, 03, 04 (effects table, repeated saves), 05 (spends the Magic
action), 06 (`attack` for spell attacks, damage application).

## Today

- `spellData` already carries more than the list assumed: `level`,
  `casting_time`, `range_text`, `duration`, `concentration`, `ritual`,
  `target_type`, `saving_throw_ability`, `attack_roll`, `damage_roll`,
  `damage_types`, `higher_level`. What it lacks: healing dice, half-on-save,
  a structured area, a structured duration, and the effect it applies.
- `spellSaveDC(sheet)` and `spellAttackBonus(sheet)` are derived; PlayCard shows
  them. Slots are toggled by hand (`applyPlayPatch({ slot })`), prepared spells
  by `applyLoadoutPatch`.
- `initiative_entries.concentrating` is a boolean the DM toggles; nothing reads
  it.
- The Asking (`checks.ts`) can request a save at any DC from any set of users,
  hides the DC when told to, and can be declined. `requestCheck` is staff-only.

## Design

### Spell data that can be acted on

Add optional, `.catch()`-guarded fields to `spellData` (content-model rule 4):

```ts
healing_roll: text(60),                     // "2d4+2"; scales with higher_level text
save_effect: z.enum(['none','half','negates']).default('none').catch('none'),
area: z.object({
  shape: z.enum(['sphere','cube','cone','line','cylinder','emanation']),
  size: count(1000),                        // radius / side / length, feet
  width: count(1000),                       // line only
}).nullable().default(null).catch(null),
duration_rounds: count(10_000),             // 0 = instantaneous / not in rounds
applies_condition: z.enum(CONDITION_KEYS).nullable().default(null).catch(null),
```

`sync-reference.ts` fills them for SRD spells where the prose is regular
("20-foot-radius sphere", "1 minute" → 10 rounds, "half as much damage on a
successful save", "regains hit points equal to 1d8"); the rest stay empty and
the Cast flow asks. The homebrew spell form gets the five fields.

### Cast

```ts
// src/server/casting.ts
export async function castSpell(campaignId, input: {
  casterEntryId?: string;          // in a fight
  characterId: string;             // or at the desk — no entry
  spellKey: string;                // refKey
  slotLevel: number | null;        // null = cantrip / ritual
  ritual?: boolean;
  targets: { entryIds: string[] } | { area: { shape, origin: Tile, direction?: Tile, size } };
  faces?: {...};                   // 03
  ruling?: boolean;                // 01
})
```

1. **Authorise and pay** — owner or staff; spend the Magic action (05) when in
   a fight (bonus-action spells spend the bonus; a reaction spell the
   reaction); expend a slot at `slotLevel ≥ spell.level` through the play patch
   — `NO_SLOT` under Enforce, overridable. Ritual: no slot, and 10 gets a
   "+10 minutes" hook.
2. **Resolve targets** — explicit entries, or `areaTiles(doc, area)` (below) →
   every token whose footprint touches a lit tile. Foe tokens hidden from the
   caster (`visibility: 'dm'` on an unrevealed tile) are included and reported
   to staff only.
3. **Attack or save** — `attack_roll`: one `attack` (06) per target with
   `spellAttackBonus`. `saving_throw_ability`: for each seated hero target, one
   `requestCheck` kind `save` at the caster's DC **addressed by the caster** (a
   new `askedBy` role: a player may ask a save of a target they are casting on
   — see consent); for each foe, roll on the server off the creature's saves and
   show staff the tray. `save_effect` decides the damage each one takes.
4. **Damage / healing** — `damage_roll` or `healing_roll` once, scaled by
   `higher_level` where the text is regular, applied or proposed per 06's
   `playersApplyDamage`. Healing to a hero goes through `applyPlayPatch`.
5. **Effects** — `applies_condition` and `duration_rounds` become
   `encounter_effects` rows (04) on each affected target, `source_entry_id` the
   caster, `concentration` from the spell. Out of a fight, a condition writes to
   the sheet with no duration.
6. **Concentration** — if the spell needs it: end the caster's current
   concentration effect (and its child rows) and set `concentrating` on the
   entry with `concentration_spell` = the spell's key. Add the column:
   `0052_concentration_spell.sql` — `ALTER TABLE initiative_entries ADD COLUMN concentration_spell TEXT`.
7. **Log** — one `cast` event (`events.ts`): `{ casterLabel, spell, level,
targets: string[] }`, audience everyone (target names filtered like the
   board filters tokens). Rolls land as rows as usual.

At the **desk** (no fight) the flow is the same minus actions, targets and
effects in rounds: a slot is spent, a heal is applied, a `cast` event tells the
table Detect Magic is up, and 10's calendar (when present) advances a ritual.

### Concentration breaks

In `applyHp` / `applyPlayPatch`, after a damaging delta to an entry with
`concentrating`:

- DC = `max(10, floor(damage / 2))`.
- Seated hero → `requestCheck` kind `save`, ability CON, DC shown, prompt
  "Concentration · Bless". `answerCheck` on a fail calls `breakConcentration`.
- Foe → server roll, staff tray; break on a fail.
- `breakConcentration(entryId)` clears the flag, deletes the effect rows with
  `concentration = 1` sourced from it, announces "Ilse loses Bless".
- Also called when the entry gains `incapacitated` / `unconscious` / `stunned` /
  `paralyzed` / `petrified` (04's apply path), at 0 HP, and when the entry casts
  a second concentration spell.

### Consent between players

Casting on another seated hero — buff or harm — routes through the Asking with a
new `kind: 'consent'`: the target sees "Ilse wants to cast Hold Person on you —
**Allow** / **Contest** (roll WIS save vs DC) / **Refuse**". Allow applies with
no roll; Contest is the ordinary save; Refuse tells the caster and spends
nothing (the slot is refunded — decided _before_ payment, so step 1 for hero
targets waits on the answer). Staff can `ruling` past a refusal. `requestCheck`
grows an `askedByCharacterId` and drops the staff-only gate for `consent` and
for saves whose DC is the asker's own derived spell DC — the server computes it,
so a player cannot invent one.

### Areas on the grid

`areaTiles(doc, area: { shape, origin, direction?, size, width? }): Set<number>`
in `lib/battlemap.ts`, using the DMG's "on a grid" method: a sphere/cylinder/
emanation is every tile whose centre is within `size` feet of the origin tile's
centre (Chebyshev, so it draws as the square people expect on a 5-5-5 board); a
cube is `size / 5` tiles a side from a corner; a cone is length `size` and width
`size` at its end along `direction`; a line is `size` long and `width` (default 5) wide. `canSee` from the origin prunes tiles behind total cover (the DM can
override per tile by tapping).

Board tool `{ kind: 'area' }` for everyone: pick a shape, drag from the origin,
the tiles light in the arcane hue, the status line lists who is inside, and
**Ask them all** opens the cast/save flow with those targets. Staff can use it
for a breath weapon without a spell (kind `creature-action`).

### Another shape

Polymorph, Wild Shape, summons: a token temporarily wearing another block.

```sql
-- 0053_entry_form.sql
ALTER TABLE initiative_entries ADD COLUMN form TEXT;   -- JSON, NULL when itself
```

`{ creatureRef, hpCurrent, hpMax, armorClass, label, revertsOnZero: true, effectId }`.
While `form` is set: the tracker, the stat block panel, the board footprint and
`attack` read the form's block; damage hits `form.hpCurrent` first; at 0 the
entry reverts (`revertsOnZero`) and excess damage is dropped (2024 Polymorph)
or carried (Wild Shape — a flag). Tied to an `encounter_effects` row so it ends
with the duration or the concentration. A **summon** is `addCreaturesToEncounter`
with `side` = the caster's and an effect row that removes it on expiry.

### Monsters' spell DCs

`creatureData` has no DC field; the text has "spell save DC 13". Parse once
into `spell_save_dc: count(40)` and `spell_attack_bonus: signedBonus` in
`sync-reference.ts` (and the homebrew form). The stat block panel's "cast" on
a spellcasting action uses them.

### UI

- **Your hero / PlayCard**: a **Cast** button beside each prepared spell (and
  in a spells tab of `AttacksPanel` during a fight): slot level picker, ritual
  toggle, target = the board selection / the area tool / a party member picker
  at the desk. One tap after that.
- **Initiative card**: the concentration glyph names the spell; a tap breaks it
  on purpose.
- **The Asking**: consent requests render with the three buttons; saves show
  the spell name.

## Verification

- Pure: `areaTiles` for each shape, including a cone along a diagonal and a
  sphere clipped by a wall; the DC formula; `breakConcentration` cascading
  effect rows.
- Running app: cast Bless as a player on three party members → three consent
  asks, one slot spent only after the first Allow; damage the caster 15 →
  a CON save at DC 10 lands in their stream; fail it → the three effect rows
  are gone and the DM's stream has the event. Polymorph a foe, reduce the form
  to 0 → the entry's own HP is unchanged.
- Browser: the area tool and the Cast sheet on a phone, both palettes.

## Out of scope

Spell preparation rules per class, material component tracking, counterspell
timing (a reaction prompt when a `cast` event fires is a natural follow-on
using 05's opportunity mechanism).
