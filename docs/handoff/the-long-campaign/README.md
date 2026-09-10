# Handoff — the long campaign

Branch: `feat/campaign-longevity`.

This directory is the state of play for one piece of work: making Hero Nexus hold a
campaign that runs for a year, from both chairs. The build order is in
[phases.md](phases.md). Read this file first — several of those tasks are only correct
in the light of a decision recorded here.

Every "today" below was read out of the code at the branch point, `d1edb23`, and is
kept in the present tense as the record of what was found. **Phases 1, 2, 3 and 7 are
built, along with phase 4's conditions half and all of phase 6 but its last item**; what
each proved is under "What has been verified" at the foot of this file, and
[phases.md](phases.md) carries the box-by-box state. Phase 5 is untouched, and feats are
still prose.

---

## The finding that reframes the rest

The brief that opened this work listed seven things as missing. Four of them are
already built and cannot be reached from where a player stands.

Inventory is a real typed section with a compendium picker, equip and attune toggles,
and an attunement cap — it is on the **Story** tab of the manual sheet editor, behind
`/creator/character?id=`, below the backstory box. Spell slots are a real play-mode
control with per-slot pips — they are on the **campaign** screen, so a hero with no
table has no way to spend one. Prepared spells are a checkbox per spell — same editor,
**Magic** tab. Levelling walks the class table level by level, recording hit points,
subclass and every ASI into the DM's log — it is a step inside the guided **wizard**,
reachable only by re-entering the builder, and the word "level up" appears nowhere in
the repo.

So the dominant failure is not absence. It is that **the sheet has no play surface**.
There is a builder (edit the character) and a viewer (read the character), and nothing
that is "run the character" — the thing a player actually sits in front of for three
hours a week. Features got built into whichever of the two surfaces was open at the
time, and a player has to know which one to guess.

This distinction decides the plan. Building a second inventory editor would be the
wrong fix and would fork the first. What is missing is one surface that the existing
pieces are mounted on.

---

## What is genuinely absent

Six things have no implementation anywhere, and these are the ones that need building
rather than moving.

### 1. A character has no portrait _(built — phase 7)_

There is no image field on the sheet, in `characters`, or in `CharacterRow`. `HeroCard`
takes a `portrait` node and every caller passes initials.

The plumbing exists but is aimed elsewhere: `campaign_images` stores uploads on disk
under `UPLOADS_DIR` and serves them through a route that asks "are you at this table".
A character is **not** campaign-scoped — it exists before it joins one, survives
leaving, and may sit at none — so a portrait cannot live in `campaign_images` without
inheriting an access rule that is wrong for it. The sharing model's note that there is
no user-level image store is the same gap seen from the other side.

This needs its own table. See [phases.md](phases.md) Phase 7 for the shape and why it
is not a column on `characters`.

### 2. Nothing derives an attack _(built — phase 2)_

`derive.ts` computes saves, skills, initiative, passive perception, spell save DC,
spell attack bonus, and armour class from worn armour. It computes **no weapon attack
and no damage**, and `CharacterSheetView` has no Attacks section. A player reads their
longsword off the inventory list and does the arithmetic in their head.

Everything needed is already on the item: `weaponStats` carries `damage_dice`,
`damage_type`, `range`, `long_range`, `is_simple` and a free-text `properties` list.
What is missing is the function and the surface.

The blocker is one type. **Weapon proficiency is prose** — `proficiencies.weapons` is
`z.string().max(300)`, and a class's `coreTraits.weapons` is `text(1000)`. "Simple
weapons, martial weapons" cannot be matched against a weapon's `is_simple` flag, so
nothing can decide whether the proficiency bonus applies. This is the root cause of the
brief's last item, and it is a schema problem wearing a UI problem's clothes.

2024 weapon **mastery** — Cleave, Graze, Push, Sap, Slow, Topple, Vex — is the other
half. Masteries are the signature martial mechanic of the edition and are exactly the
"special actions from weapon proficiency" the brief asks for. Today they can only be
free text inside `properties`, indistinguishable from "Heavy" or "Two-Handed".

### 3. Feats are prose, not references

Spells are refs. Inventory rows are refs. **Feats are a composed string** —
`compose.ts:featText` concatenates the background's feat and each ASI's `featName` into
`details.feats`.

This is a straight violation of content-model rule 1 read in spirit: a feat's benefits
cannot be resolved, cannot be rendered by `StatBlock`, and cannot be checked against a
table's library, so a homebrew feat approved at a table is a sentence on a sheet with
no stats behind it. The build already carries `asi.featKey` and `asi.featSource`, so
the pointer exists — it just never reaches the sheet.

### 4. Conditions do not survive the fight _(built — phase 4)_

`combat.exhaustion` is on the sheet, correctly, with the comment explaining why it is a
number and not a chip. **The other fourteen conditions live only on
`initiative_entries`** — a row inside an encounter. When the encounter ends the row goes
and the condition with it.

A character poisoned by a trap on Tuesday and cured on Thursday has nowhere to record
it for the two days in between. For a one-shot this is invisible; over a year it is the
difference between a sheet that is true and a sheet that is a snapshot of the last
fight.

### 5. Nothing sums weight or money over time

Items carry `weight` and `cost`. Nothing adds them up: no carried weight, no carrying
capacity, no encumbrance. `currency` is five integers a player overwrites, so there is
no record of what was spent — a party cannot answer "where did the 400gp go" three
sessions later.

This is the lowest-value item on the list and is scoped accordingly in Phase 5.

### 6. The roster cannot say a hero is at a table _(built — phase 6)_

`CharacterRow` has no campaign field. `/characters` renders the party from it, so no
card can carry the table it belongs to, and `/characters/[id]` computes `tableContext`
but spends it only on notes and secrets — the header never mentions the campaign.

The link itself is unambiguous and already there: `campaign_members.characterId`, with
a unique index on `(campaignId, userId)`. That index is worth reading carefully, because
it encodes a product decision nothing states out loud: **one character per player per
campaign.** Any "switch my active hero" feature has to either respect that or change it.

---

## What exists and is unreachable

These need routing and mounting, not building. Listed with where the working code is,
so nobody rebuilds one.

| Capability             | Built, in                                               | Reachable only from                                   |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Inventory management   | `sections/InventorySection.tsx`                         | `/creator/character?id=` → Story tab                  |
| Spell slot expenditure | `PlayCard.tsx` `SlotRow` + `PlayPatch.slot`             | `/campaigns/[id]` → Session/Party — **campaign only** |
| Prepared spells        | `sections/SpellListSection.tsx`                         | `/creator/character?id=` → Magic tab                  |
| Levelling              | `wizard/steps/AdvancementStep.tsx`                      | re-entering the guided wizard                         |
| HP / hit dice / rests  | `play.ts` `applyPlayPatch`, `spendHitDice`, `restParty` | campaign screen only                                  |
| Death saves            | `PlayPatch`, `PlayCard`                                 | campaign screen only                                  |

`applyPlayPatch` authorises **the character's owner unconditionally** —
`play.ts:authorize` returns `canEdit: true` for the owner before it ever looks at a
campaign. The server is already willing to let a player move their own numbers with no
table involved. Only the UI insists on one.

That is the single most useful fact in this document: the player play surface is a
routing and composition job over an authorisation model that already permits it.

---

## The two model decisions

Everything in [phases.md](phases.md) follows from these. They are recorded here because
each is a fork the code could reasonably take the other way, and re-litigating them
mid-build is how the work stalls.

### The sheet gets a third surface, not a third copy

Today: `/creator/character` builds, `/characters/[id]` reads. Neither runs a character.

The third surface is **play** — HP, hit dice, slots, conditions, prepared spells,
attacks, and the inventory's equip/attune toggles — and it is built by _mounting the
existing components_, not by writing new ones. `InventorySection` and `SpellListSection`
already take a react-hook-form `control`; the play surface supplies one bound to the
same sheet. `PlayCard`'s slot pips already take a patch callback; the play surface
supplies one that posts to `applyPlayPatch` with a null campaign.

**Why not a fourth tab in the builder.** The builder is a form with a save button. A
player at a table is not editing a document, they are spending a resource — the write
has to land immediately and be visible to the DM without a save. That is what
`applyPlayPatch` already is, and it is why play cannot simply be a tab.

**Why not "make the read-only view editable".** `CharacterSheetView` is a server-rendered
plain render with no client state, deliberately (its doc comment says so). Making it
editable makes it a client component and drags the whole sheet into the browser on a
page whose job is reading. Play is a sibling route, not a mode flag.

### A campaign-linked hero and a free hero are the same surface

The play surface must work with `campaignId = null`. The temptation is to build it only
inside the campaign, because that is where `PlayCard` lives and where the live-update
hook (`useCampaignLive`) already runs.

That would make a solo character second-class, and it would fork the code the moment
someone wants play controls on the roster. `applyPlayPatch` already takes
`campaignId: string | null` and already handles the null path. The surface passes
whatever the character has; live updates degrade to none when there is no table, which
is correct — there is nobody to broadcast to.

---

## Design-language debt found on the way

Not part of the brief, cheap to fix while the same files are open, and each is a
`docs/design-language.md` rule a reviewer can point at.

- **`CharacterSheetView` marks all eight cards `framed`.** Rule 6: "If more than one
  framed card is on screen, none of them are." Eight stacked framed cards in one
  `space-y-5` column is also the literal cause of the brief's "very vertical, requires a
  lot of scrolling" — the vertical stack _is_ the layout. Fixing the archetype fixes
  both complaints at once.
- **`CharactersList` uses `@iconify/react` `Icon` for its edit and delete affordances.**
  Rule 8: every glyph comes from `Glyph`. Two icons, one import.
- **`SpellListSection` renders its remove button as `<Glyph name="question" rotate-45>`**
  — a question mark turned on its side to look like an ✕. Rule 8 says add a glyph to the
  set rather than reaching for a substitute; this is the same sin as an emoji, spelled
  differently. `Glyph` needs an `x` or `remove`.

---

## What has been verified

Phases 1 and 2 were checked against a production build with a real session, and then in
a browser in both themes. What was proven:

- **A hero with no campaign can be run.** A tableless character's play surface renders,
  and taking 9 damage through `applyPlayPatch(id, null, patch)` moved 28 to 19 and
  persisted. This was the load-bearing claim of the whole plan — that the play surface
  is a routing job over an authorisation model that already permits it — and it holds.
- **A hero at a table works the same way.** Spending a level-1 slot on a linked
  character persisted as `{"total":4,"expended":4}`.
- **Proficiency is read correctly from real data.** All 38 SRD weapons adapt. Fighter is
  proficient with 38, Wizard 14, Rogue 19 (the 14 simple ones plus hand crossbow,
  rapier, scimitar, shortsword and whip), Monk 17 — the printed list in each case. A
  Wizard holding a greatsword is not proficient; a Rogue holding a rapier is.
- **Attacks are right on screen.** A Dex-16 wizard's dagger reads +6 / 1d4+3 with its
  Nick mastery; the longsword beside it reads "Not proficient", +1 / 1d8+1, versatile
  1d10+1, mastery Sap.
- **Mastery survives adaptation.** 38/38 weapons carry one and 7 carry versatile dice.
  Both were being discarded on the way in before this work.
- **The sheet migration is safe.** Both stored characters pick up their real grant from
  prose, running it twice changes nothing, and an explicitly-empty grant is left alone.
- **The regression that motivated content-model rule 2 still holds.** An equipped shield
  resolves to the shield _item_: AC 14 for a Dex +2 character, not the spell.
- **Negative controls.** Nothing equipped, content unresolved, and `equipped: false`
  each yield zero attacks rather than an attack with zero stats.
- **The loadout toggles write through.** Attuning moved 0/3 to 1/3 and persisted;
  un-attuning came back to 2/3; the attune control appears on an already-attuned row
  that does not require attunement, so that state can be undone, and vanishes once it
  is not needed. Spells group by level with cantrips marked Always and excluded from
  the prepared count.
- **Armour class is recomputed from what is worn on every loadout change.** This
  immediately corrected a stale stored AC of 10 to the real 13 on the test character —
  a drift a typecheck cannot see, and the reason the recompute is on the server rather
  than in the control.

- **Levelling is reachable and correct.** 7,000 XP at level 5 reads "7,000 more for
  level 6"; 15,000 reads "enough for level 6"; the Level up link lands a guided build on
  the Levels step, and picking 6 recomposes the hero panel to level 6, 32 hit points,
  6d6.
- **A condition outlasts its fight.** Marking a tableless hero Poisoned persists as
  `["poisoned"]` on the sheet while `initiative_entries` holds no row for that character
  at all — which is the whole claim.
- **A player's own hero is on the table screen.** "Your hero" appears in Add a box and
  renders the same `LoadoutSection` the play surface mounts, with working toggles.
- **Permissions hold in both directions.** An outsider's `applyPlayPatchAction` and
  `applyLoadoutPatchAction` against another player's hero are refused with "That sheet
  is not yours to change"; the owner's identical call succeeds. On the portrait route,
  owner GET is 200 with the real bytes, outsider GET is 404 rather than 403 — a 403
  confirms the hero exists to somebody with no business knowing — and outsider POST and
  DELETE are refused at 403 with the portrait left intact.

## Still to verify

Follow [../verifying-without-a-browser.md](../verifying-without-a-browser.md). The
checks that matter most for the phases still to come:

1. **A condition set out of combat survives an encounter starting _and ending_.** Half
   proven: it is on the sheet with no encounter row in existence. The round trip —
   condition set out of combat, encounter started, encounter ended, condition still
   there — has not been run.
2. **Levelling writes the same `character_history` rows from either path.**
   Content-model rule 7: the server diffs, the client is never asked what changed. Two
   entrances to one sheet is how a second, client-trusted write path gets introduced by
   accident. The level-up entrance reuses the wizard's own step, so this is likely
   fine — but "likely" is what this file exists to replace.
