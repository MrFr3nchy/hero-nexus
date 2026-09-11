# Hero Nexus content model — "one vocabulary, two sources"

This is the contract every piece of game content is built against. If the code and this
doc disagree, the code is wrong. Agents working on this repo follow it without being
reminded.

The app has two sources of content and, before `src/@shared/content/`, two unrelated
shapes for it: `reference_data` held raw Open5e JSON that `srd/parse.ts` turned into
typed defs, and `homebrew.data` held `{}` and was never read. One renderer, one picker
and one validator cannot serve two vocabularies. So both sources adapt into
`ContentEntry`, and nothing downstream knows or cares which it is looking at.

The eight types are **class, subclass, species, background, feat, spell, item,
creature**.

---

## The rules

Eight, each phrased so a reviewer can point at a diff and say it is violated. Each one
carries its _why_, because the why is what stops someone simplifying it back out.

### 1. A sheet references content; it never copies stats

`ContentRef` is a pointer. Nothing that resolves through it may be written onto the
sheet as data.

A copy is a fork. The DM's correction to a homebrew item never reaches the character
carrying it, and the same item on two sheets drifts apart until they are different
items with one name. The denormalised `ref.name` and `inventory[].name` are the single
exception, and they exist so a deleted or unapproved ref still renders as a word rather
than a blank row — never as a source of stats.

- **Do** — `inventory[].ref = { source, type, key }`, stats resolved at read time by
  `resolveContentRefs`.
- **Don't** — an `inventory[].armorClass` copied off the item at the moment it was
  picked up.

### 2. A `ContentRef` is `(source, type, key)` — all three

`reference_data` is keyed `(category, slug)`, so a slug is unique only _within_ a
category. The SRD ships `srd-2024_shield` as both a piece of armour and a 1st-level
spell. A ref carrying only the slug resolved one to the other, and an equipped Shield
silently cost its character 2 AC. `refKey()` includes the type for the same reason;
matching on `source:key` is the bug, spelled differently.

### 3. Identity types mirror the parsed shape; spell and item mirror the raw one

Homebrew `data` for **class, subclass, species, background, feat** matches the _parsed_
interfaces in `@/@creator/character/lib/srd/types.ts`. `srd/parse.ts` exists only to dig
mechanics out of Open5e's prose — a form has no prose to parse, so a homebrew author
fills the parsed fields directly and no parser sits in the middle.

Homebrew `data` for **spell, item and creature** mirrors the _raw_ Open5e field names
(`casting_time`, `damage_types`, `requires_attunement`, `ac_base`, `armor_class`,
`hit_points`, `challenge_rating`). Those rows were never parsed; the compendium and
`ReferenceBrowser` have always read them raw. Renaming them here would fork the one
shape the app already displays.

The payoff is that `from-content.ts` is a re-labelling — it fills in the `key`, `name`
and `source` that live on the entry rather than in its `data` — and the wizard consumes
SRD and homebrew through one type.

### 4. Every leaf in a content schema carries `.catch()`

An object-level failure silently returned an all-defaults Wizard — hit die 8, caster
type NONE, no features — which looks like real data and is not. Degrade one field at a
time: a malformed `damage_roll` costs you the damage roll, not the spell.

The same reason `listOf` drops a bad element instead of the array, and why a half-filled
row is a normal state. A player sketches a spell, names it, and comes back for the
damage later; validation rejects a malformed draft, never an incomplete one.

- **Do** — `damage_roll: text(60)`, which is `.default('').catch('')`.
- **Don't** — a bare `z.string()` anywhere inside `src/@shared/content/schemas.ts`.

### 5. One renderer

Anything that displays content displays it through
[`@/@shared/components/StatBlock`](../src/@shared/components/StatBlock.tsx) — the
compendium, the Forge's live preview, the DM's approval queue, the character sheet, the
guide.

A second local mini-renderer is how two surfaces start disagreeing about what a spell
is. The chips under a name come from `CONTENT_REGISTRY`, not from the component that
happens to be drawing them.

### 6. A campaign's library is the answer to "may this be used here?"

`campaign_homebrew` — via `listCampaignContent` / `listCampaignContentIds` — is what the
builder offers and what the rules check enforces. Not `homebrew_approvals`.

`homebrew_approvals` records a _decision_; the library records the _consequence_.
Approving puts content in play, denying takes it out, and a DM's own content has no
decision behind it at all — it is simply there. Reading the approvals table to answer
"is this allowed?" gets the DM's own work wrong and gets a mind changed after the fact
wrong too.

This is also why an auto-approval — a table with `requireHomebrewApproval` off — still
writes to the library. An approval that reaches nothing changes nothing.

### 7. Every change to a character is server-diffed into `character_history`

`diffSheets` runs on the server, against the row as it was. The client is never asked
what changed.

`character_audit_log` on the sheet is a client-supplied mirror for the player's own
benefit, and a player can edit it away. The DM's log must be the one the player cannot
write.

### 8. Adding a content type is one entry in `CONTENT_REGISTRY`, one schema, one form

If a new type needs a `switch` anywhere else — a picker, a renderer, a chip builder, a
label map — the registry is being bypassed and the next type will need that switch
edited too. `ReferenceBrowser` used to carry a hardcoded two-branch `metaChips` with no
extension point; that is the shape to watch for.

---

## Where it lives

| Module                               | Holds                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `@/@shared/content/types.ts`         | `ContentRef`, `ContentEntry`, `CONTENT_TYPES`, `refKey`. No React, no db. |
| `@/@shared/content/schemas.ts`       | The seven stat shapes. Every leaf defaulted and `.catch()`ed.             |
| `@/@shared/content/adapt.ts`         | `fromReference` / `fromHomebrew` — the two sources becoming one.          |
| `@/@shared/content/registry.ts`      | Label, plural, glyph, description, chips. One row per type.               |
| `@/server/content.ts`                | `listPickableContent`, `resolveContentRefs` — SRD + own + campaign.       |
| `@/server/campaign-content.ts`       | The library: what is in play at a table.                                  |
| `@/@shared/components/StatBlock.tsx` | The renderer (rule 5).                                                    |

## The seven field contracts

`data` is validated against its type's schema on every write, so a malformed blob never
reaches a stat block. What each type's `data` must contain:

| Type           | Shape mirrors   | Fields                                                                                                                                                                                                                                                                                                |
| -------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **class**      | `ClassDef`      | `hitDie`, `casterType` (NONE/FULL/HALF/THIRD/PACT), `coreTraits` (primary abilities, saves, skill choice, weapons, armour, tools, equipment packages), `features[]`, `subclassLevel`, `asiLevels[]`, `spellSlots`, `blurb`                                                                            |
| **subclass**   | `SubclassDef`   | `parentClass` (a homebrew id or an SRD slug), `features[]`, `blurb`                                                                                                                                                                                                                                   |
| **species**    | `SpeciesDef`    | `sizes[]`, `speed`, `traits[]` (each with `options[]` when its prose offers a pick), `grantsSkillChoice`, `blurb`                                                                                                                                                                                     |
| **background** | `BackgroundDef` | `abilityOptions[]` (the three the increase spreads across), `skills[]`, `tool`, `feat`, `equipment[]`                                                                                                                                                                                                 |
| **feat**       | `FeatDef`       | `category` (Origin / General / Fighting Style / Epic Boon), `prerequisite`, `benefits[]` — one line per benefit, as Open5e files them                                                                                                                                                                 |
| **spell**      | Open5e raw      | `level` (0 = cantrip), `school`, `casting_time`, `range_text`, `duration`, `concentration`, `ritual`, `verbal`/`somatic`/`material` (+ `material_specified`, `material_consumed`), `target_type`, `saving_throw_ability`, `attack_roll`, `damage_roll`, `damage_types[]`, `higher_level`, `classes[]` |
| **item**       | Open5e raw      | `kind` (wondrous/weapon/armor/gear/consumable), `rarity`, `requires_attunement` (+ `attunement_detail`), `weight`, `cost`, plus `weapon` or `armor` stats when the kind calls for them                                                                                                                |

A class feature is `{ key, name, desc, levels[], detailByLevel }` — `levels` is the
character levels it is gained at, so one feature that arrives three times is one entry,
not three.

## Checking the work

Against the running app, with real sessions, asserting on the payload. The two checks
that catch the most are "every SRD row adapts and none collapses to an empty stat block"
(rule 4) and "both `srd-2024_shield` rows resolve distinctly" (rule 2).
