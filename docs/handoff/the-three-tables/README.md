# Handoff — the three tables

Branch: phases 1 and 2 landed on `main` directly; phases 3 and 4 on
`feat/the-three-tables-3-4`. **All four phases are built**; [phases.md](phases.md)
carries the item-by-item state, and what each run proved is at the foot of this file.

A campaign is lived at three tables, and the app has been treating them as one:

| The table          | When                      | What it is for                                                     |
| ------------------ | ------------------------- | ------------------------------------------------------------------ |
| **The desk**       | Between sittings          | Recording. Notes, canon, downtime, the chronicle, prep.            |
| **The table**      | Sitting, no fight running | Playing. Talking, searching, trading, whispering, checks, puzzles. |
| **The sand table** | Sitting, a fight running  | Fighting. The board in front, everything else within reach.        |

Today the app is a very good desk with a good session tab bolted on, and a battle map
that lives on that tab. The brief for this work is to make each of the three a **place**
— the right things in front of the right people, the rest one gesture away — and to
let the app know which table it is at so it can set the room before anyone arrives.

**Function over form, and said so up front.** The design language's rules were written
for pages a reader looks at. Two of these tables are surfaces a person _operates_ for
four hours while five other people talk. Where a rule would cost a DM a click mid-round,
the click wins, and the [Conventions this breaks](#conventions-this-breaks-on-purpose)
section names each one so the next reader knows it was chosen rather than forgotten.

Every "today" below was read out of the code at `a9efa15`.

---

## The one decision everything follows from

**The table is derived, never stored.** Which of the three a campaign is at is already
knowable from two facts the app keeps:

| `campaign_sessions.status = 'live'` | `initiative_encounters.is_active` | Table          |
| ----------------------------------- | --------------------------------- | -------------- |
| no                                  | —                                 | the desk       |
| yes                                 | no                                | the table      |
| yes                                 | yes                               | the sand table |

So there is no `mode` column and no "switch to battle" button. The DM already has the
two verbs — _Take your seats_ and _Call for initiative_ — and the app changes the room
when they say them. Ending the fight puts the table back; rising puts the desk back.
That is the same reasoning `the-last-breath` used for dying (derived) versus stable
(stored): a state that can be computed from facts the app holds cannot drift from them.

The one thing stored is **a viewer's override**: a player who wants the board up while
the DM is between fights, or a DM who wants the desk open during a sitting to check a
note. Per viewer, in the same `campaign_screen_layouts` row that already holds their
panel arrangement — a preference, not a fact about the campaign.

---

## What exists, table by table

### The desk — essentially done

| Need              | Have                                                              | Gap |
| ----------------- | ----------------------------------------------------------------- | --- |
| Notes, reveals    | `NotebookPanel`, `RevealTimeline`, `campaign_reveals`             | —   |
| Canon, maps       | `CanonPanel`, `MapPanel` (region map, pins, spotlight)            | —   |
| Chronicle, recaps | `ChroniclePanel`, `campaign_sessions`, `recap.ts`                 | —   |
| Downtime          | `DowntimePanel`, `downtime.ts`                                    | —   |
| Quests, clocks    | `QuestPanel`, `ClocksPanel`                                       | —   |
| Journals          | `JournalPanel` (private to the player)                            | —   |
| Loot, treasury    | `LedgerPanel`, `partyLoot`, `partyTreasury`                       | —   |
| Prep for a fight  | `EncounterPlanner`, `encounter-plans.ts`, `BattleBoard` authoring | —   |
| Awards, levelling | `AwardsPanel`, the level-up ladder                                | —   |

The desk is the app as it stood before `the-same-room`. Nothing here needs building.
What it needs is to **be the thing the campaign page opens on when nobody is sitting**,
and to get out of the way when somebody is.

### The table — half built

| Need                              | Have                                                                               | Gap                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill checks, pushed and answered | `campaign_checks`, `ChecksPanel`, withheld DCs                                     | —                                                                                                                                               |
| Free rolls, shared log            | `RollPanel`, `campaign_rolls`, the tray                                            | —                                                                                                                                               |
| Equipping, preparing spells       | `applyLoadoutPatch`, `LoadoutSection`, `MyHeroPanel`                               | —                                                                                                                                               |
| Hit points, slots, conditions     | `PlayCard`, `applyPlayPatch`, live on `LiveState.party`                            | —                                                                                                                                               |
| DM → player privately             | Reveals to `selected`, handouts to `selected`, checks targeted                     | —                                                                                                                                               |
| **Player → DM privately**         | Nothing. A player who wants to say "I pocket the key" says it out loud.            | **Whispers.** `campaign_whispers`, from anyone to anyone at the table, announced to the recipient alone.                                        |
| **Player → player privately**     | Nothing.                                                                           | Same table. A note passed under the table.                                                                                                      |
| **Trading between characters**    | Nothing. Loot has a carrier; a sheet has an inventory; no verb moves a row.        | **`giveItem` / `giveCoin`** in `play.ts`: move an inventory row or coins between two seated characters, logged in `character_history` for both. |
| Puzzles                           | Handouts, checks, timers, all addressable                                          | — (the-same-room settled this: a puzzle is three things the app has)                                                                            |
| Presence, who is looking          | `SittingCard`, watchers off the hub                                                | —                                                                                                                                               |
| The region map, lit               | `SpotlightPanel`                                                                   | —                                                                                                                                               |
| **One surface for all of it**     | The screen (`DmScreen`), which is arrangeable but is the same for all three tables | **A table layout**: the screen's panel registry, a default arrangement per table, and the viewer's own saved one per table.                     |

### The sand table — the board is built; the room around it is not

| Need                                | Have                                                                                    | Gap                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The board, 2D and 3D                | `BattleBoard`, `BattleMap3D`, fog, drag, reach, range                                   | —                                                                                                                                                                                                                                                                                                              |
| Initiative, HP, conditions          | `InitiativeTracker`, `applyHp`, `setPlayConditions`                                     | —                                                                                                                                                                                                                                                                                                              |
| My hit points, slots, death saves   | `PlayCard`                                                                              | —                                                                                                                                                                                                                                                                                                              |
| Weapon attacks with bonuses         | `weaponAttacks(sheet, resolved)` — **only on `/characters/[id]/play`**, server-rendered | **Attacks on the live path.** An action that returns the viewer's own `WeaponAttack[]`, and a shelf panel that rolls to-hit and damage through the tray against the selected token, with range read off the board.                                                                                             |
| Changing weapons mid-fight          | `LoadoutSection` on `MyHeroPanel`                                                       | —                                                                                                                                                                                                                                                                                                              |
| Rolls from the board                | `dis · d20 · adv` on the selected token                                                 | —                                                                                                                                                                                                                                                                                                              |
| **The foe's stat block for the DM** | `StatBlock` renders a creature; `addCreaturesToEncounter` reads one                     | **`initiative_entries` forgets which creature it was dealt from.** It copies name, HP and AC and drops the ref. A DM clicking Aboleth 3 on the board gets a name and a number, not its actions. Migration: `creature_ref` on the entry, nullable. Then a `Stat block` shelf panel keyed to the selected token. |
| Rolling a monster's attack          | Nothing.                                                                                | Falls out of the above: the stat block's actions carry their to-hit and damage strings; a button rolls them through `rollAction` as the creature.                                                                                                                                                              |
| **The board in front of everybody** | The board is one panel among fourteen, on a tab, under the tracker                      | **The battle layout.** Full-bleed board as the main region; a collapsible shelf beside it holding the viewer's chosen panels; the sidebar collapsed; no page chrome.                                                                                                                                           |
| Who is being attacked               | The selected token, and the range readout                                               | A **target** that persists across the roll: select a foe, and the attack panel says "vs Aboleth 3, 25 ft, in range" and rolls.                                                                                                                                                                                 |
| Healing another                     | `applyPlayPatch` is owner-or-staff                                                      | Not built, on purpose: a potion is _given_ (trading, above) and _drunk_ by its owner. The rules agree.                                                                                                                                                                                                         |

---

## The model decisions

### 1. The table is derived from the sitting and the fight

Covered above. No column. `LiveState` gains `table: 'desk' | 'table' | 'battle'`,
computed in `getLiveState` from `sitting` and `encounter.isActive`, and every surface
reads that one field.

### 2. One screen, three arrangements

`DmScreen` is already an arrangeable grid of panels with a registry (`SCREEN_PANELS`),
per-viewer persistence and role filtering. It does not need replacing; it needs to
know which table it is at. `campaign_screen_layouts.layout` grows from one arrangement
to three — `{ desk, table, battle }` — with `normalizeLayout` reading the old
single-arrangement shape as `table`, so nobody's screen resets.

The **battle** arrangement is a different shape from the other two: not columns of equal
standing but **one main region and one shelf**. The board fills the main region. The
shelf is a column the viewer chooses panels for, collapsible to a strip of glyphs, and
it is where the attacks, the hit points, the dice, the checks and the tracker live. A DM
gets the stat block and the tracker by default; a player gets their own hero and their
attacks.

### 3. The shelf is dense, and that is the point

`SectionCard` is a page component: a title, a description, generous padding, a shadow.
In a shelf beside a battle map, that chrome costs a third of the column. The shelf
renders each panel **headless** — no card, a one-line glyph-and-label header that
doubles as the collapse handle, `text-sm` throughout. Several panels already accept the
same props the screen passes them; the shelf passes them and wraps them differently.
Panels that hard-code their `SectionCard` get a `headless` prop, as `StatBlock` already
has.

### 4. Whispers are messages, not chat, and not reveals

`the-same-room` deliberately left chat out and said why: a table on a call does not need
it. That stands. A whisper is a different thing: **one line, from one person to one or
more others, that is not shown to the rest.** "I pocket the key." "Your character
notices the bartender's hands are shaking." "Cover me."

It is not a reveal, because a reveal is _canon_ — it goes on the timeline of what the
party knows and can be widened to everybody. A whisper is a note passed under the table;
it lives in the evening and nowhere else. So: `campaign_whispers` with `from_user_id`,
`body`, and a targets table keyed on user id like every other addressed thing here;
announced to the recipients through the hub with a `whisper` event and an audience of
exactly them; read back in a shelf panel as a thread. **Staff see every whisper**, the
same way `reaches` already lets staff see anything addressed at anybody — a DM who
cannot see what the rogue told the wizard cannot run the table.

### 5. Trading is a move, not an offer

Give an item, and it is given. No offer/accept flow, because the table already has one:
the person across from you says no. The server moves the inventory row from one seated
character to another in one write, decrements or deletes on the giver's side, merges
quantity onto an identical unattuned row on the receiver's side, and writes a
`character_history` row on both sheets so "where did the healing potion go" has an
answer. Coins the same, against `sheet.currency`. Both announce to the two people and to
staff. Anyone may give from a character they own; staff may give from any.

### 6. The entry remembers its creature

`initiative_entries.creature_ref` — a `ContentRef`, JSON, nullable — set by
`addCreaturesToEncounter` and left null by the hand-typed path. It is the difference
between a DM seeing "Aboleth 3 · 150 hp" and seeing what an aboleth _does_. The stat
block renders through the existing `StatBlock` with `resolveContentRefs`, so a homebrew
monster from the campaign's library renders exactly like an SRD one — content-model rule
1 again: reference, never copy.

### 7. Attacks come off the sheet, live

`weaponAttacks` is pure and already correct; it only lacks a live path. An action
`getMyAttacksAction(characterId, campaignId)` resolves the sheet's inventory refs and
returns `WeaponAttack[]`; the shelf panel calls it once and again on loadout change.
Rolling is two presses — **to hit** (`1d20+bonus`, advantage/disadvantage) and
**damage** (the dice string, versatile when two-handed) — both through `rollAction` as
the character, so both land in the log and the tray, and the label carries the weapon
and the target.

---

## Conventions this breaks, on purpose

Each of these is a rule in `docs/design-language.md`, and each is broken only on the
two live tables, never on the desk.

- **`PageShell` width and the sidebar.** The battle layout is full-bleed and collapses
  the sidebar to its icon strip. A board is the artifact (rule 1) and a 60-tile board
  does not fit inside a reading column.
- **Card chrome.** The shelf renders panels headless. Rule 3's "asymmetry over grids"
  still holds — main region plus shelf is the dashboard's own shape — but the shelf's
  panels drop `SectionCard` entirely.
- **`text-sm` as the floor.** The shelf and the tracker inside it use `text-sm` and
  `text-xs` throughout, below the body size the rest of the app uses. Density is the
  feature.
- **More than one moving thing.** The board's turn ring, the tray, the announcements,
  and now a target highlight. Rule 4 already carved out the tray and the announcements
  as root-level moments; the target highlight is state (rule 6), not decoration.
- **Counts as furniture.** The shelf's collapsed strip shows a badge on the checks glyph
  when one is waiting for you and on the whispers glyph when one is unread. Rule 2 bans
  count tiles on pages; a collapsed strip is not a page and the number is the reason to
  open it.

What does **not** break: no emoji, ever (rule 8); the hand face stays in the margin
(rule 5); ornament encodes state (rule 6); empty states are scenes (rule 7); both
palettes; reduced motion.

---

## The work

The record of what has landed, and what each run proved, is in [phases.md](phases.md).
All four are built; the bullet about `/campaigns/[id]` opening on the fitting tab
moved from phase 1 to phase 4, where the rest of the campaign page work is. Where the
build departed from the plan below, phases.md says how and why — the sitting bar's link
already went to the screen, so phase 4 changed its wording rather than its target; the
default shelves grew a `whispers` panel; and three things found in the browser (a blank
target name, a page that scrolled by one bar, a tracker row squeezed to five lines) were
fixed on the way.

### Phase 1 — The table is known, and the screen follows it

- `LiveState.table`, derived. A `TableRibbon` in the screen header saying which table
  the campaign is at, with the DM's two verbs beside it — _Take your seats_ / _Rise_,
  _Call for initiative_ / _End the fight_ — so changing the room is one press from the
  room.
- `campaign_screen_layouts.layout` grows to `{ desk, table, battle }`; `normalizeLayout`
  reads the old shape as `table`. The screen picks the arrangement for the current
  table, and the viewer's override (per viewer, stored beside the layouts) can pin one.
- The **battle arrangement**: board full-bleed in the main region, a shelf beside it,
  collapsible, with the viewer's chosen panels rendered headless. Sidebar collapsed.
- Default shelves: DM — tracker, stat block, dice, checks, feed. Player — mine, attacks,
  dice, checks, feed.
- `/campaigns/[id]` opens on the tab that fits: desk → Session tab's quieter parts are
  fine as they are; sitting → the Session tab; fight → straight to the screen, with a
  bar offering the way back.

### Phase 2 — Attacks, targets, and the foe's stat block

- `0042_entry_creature.sql`: `initiative_entries.creature_ref`, set by
  `addCreaturesToEncounter`.
- `getMyAttacksAction`. An **Attacks** shelf panel: one row per equipped weapon — name,
  to-hit, damage, range — with _hit_ and _damage_ buttons that roll through
  `rollAction` as the character, advantage and disadvantage on the row, the label
  naming the weapon and the target.
- A **target**: selecting a token on the board while your own is on it sets it; the
  attacks panel reads "vs Aboleth 3 · 25 ft · in range" and refuses nothing (a DM can
  rule a long shot).
- A **Stat block** shelf panel for staff: the selected token's creature through
  `StatBlock headless`, with each action's attack and damage rollable as the creature.

### Phase 3 — Whispers and trading

- `0043_whispers.sql`: `campaign_whispers` + targets. `whisper` event kind. A shelf
  panel that reads as a thread, composes to one or more people, and badges when unread.
- `giveItem` / `giveCoin` in `play.ts`, both logged to `character_history` on both
  sheets, both announced to the two parties and staff. A _Give_ control on the
  inventory rows of `LoadoutSection` and on the currency line.

### Phase 4 — The desk gets out of the way

- The campaign page's tab strip reads the table too: at the sand table the Board tab
  comes first; at the desk the Chronicle does.
- The shell bar (`SittingBar`) says which table, not only that one is sitting, and its
  link goes straight to the screen in a fight.

---

## Verification

`docs/handoff/verifying-without-a-browser.md` for the server; a browser for the two live
tables, because a shelf's density and a collapsed strip's legibility are the whole
point and cannot be asserted on.

- [x] `table` derives correctly through all four transitions: seats → fight → end →
      rise. (Phase 1, headless; phase 4 again, from the ribbon, in a browser.)
- [x] A saved single-arrangement layout normalises to `table` and nobody's screen
      resets. (Phase 1.)
- [x] A whisper reaches its recipient and staff and **nobody else** — the same
      three-jar test the-same-room ran for reveals. (Phase 3, on the rows and on the
      wire.)
- [x] A gift moves the row, merges quantity, refuses an attuned item, refuses a
      character the giver does not own, and writes two history rows. (Phase 3.)
- [x] A dealt creature's entry carries its ref; a hand-typed one carries null and the
      stat block panel says so rather than breaking. (Phase 2.)
- [x] An attack roll lands in the log as the character with the weapon and target in
      its label, and the tray drew the server's faces. (Phase 2 headless; a natural 20
      in the tray in phase 3's browser pass.)
- [x] In a browser: the battle layout at laptop width and at phone width; the shelf
      collapsed and open; a player's shelf and the DM's; both palettes. (Phase 4.)

## Deliberately not in this plan

- **Chat.** Still not. Whispers are addressed, one-line, and not a stream.
- **Rules automation on attacks** — comparing to-hit against the target's AC and
  applying damage. The DM sees the roll and the AC side by side; deciding is theirs.
  The-sand-table's out-of-scope list already said this and nothing has changed.
- **Spell casting from the shelf.** Slots are already spent on `PlayCard`; the spell's
  effect is narrated. A spell panel that rolls save DCs against tokens is the same
  project as attack automation and waits for the same reason.

---

## What has been verified

Phases 1 and 2 are recorded in [phases.md](phases.md). Phases 3 and 4, against a
production build, with four real accounts, four cookie jars and real server-action
POSTs following `docs/handoff/verifying-without-a-browser.md` — and then, for the half
that method cannot reach, by driving the real app in Chrome as the player and as the DM.

### Whispers

- **The rows.** Three whispers written — player → DM, player → player, DM → one
  player. Read back through `getLiveStateAction`, the DM saw all three, the player saw
  only the two they said, the other player saw only the two said to them, and a
  stranger saw nothing. An empty line, a line to yourself, a line to somebody not at
  the table and a stranger's line were each refused.
- **The wire.** With three streams open, a marked string the DM whispered to one player
  reached the DM's and that player's bytes and **never the other player's**, while the
  state nudges reached all three. The same shape as the-same-room's leak test, and the
  same result.
- **In a browser.** The thread, the compose, Enter to send, the line landing in The
  evening; two whispers arriving with the shelf folded raised two slips and a **2** on
  the strip's whisper glyph beside the asking's **4**; opening the panel cleared the 2
  and left the 4. The DM's thread named both ends of a line between two players.

### Trading

- A partial stack merged onto the receiver's matching row; a whole row moved and landed
  fresh; an attuned item, a sheet the giver does not own, a hero at another table, the
  giver themself, a stranger, more coin than the purse holds and an empty gift were
  each refused with their own sentence; the DM gave from a player's sheet; coins moved
  by denomination. Two `character_history` rows per gift, on both sheets, with the
  purse before and after. The `gift` announcement reached both owners and the DM.
- **In a browser.** _Give_ on a row, the popover, 2 → 1. A gift arriving from another
  jar moved the purse 24 → 27 gp with nothing pressed on the receiver's side — the
  `loadoutKey` re-read doing its job.

### The desk getting out of the way

- At the table the page opened on Session; in a fight on Board, first in the strip;
  at the desk on Chronicle. The bar read _is sitting_, then _is at the sand table ·
  The cistern_ in the danger tone with _To the sand table_, then nothing. _Take your
  seats_ raised the bar the same moment and _Call for initiative_ flipped it, both
  without a reload.

### The two phase 2 items

- Tap-to-aim: a revealed foe tapped, `Something · 25 ft`, the longsword out of reach
  and the longbow in range, a natural 20 in the tray labelled `to hit vs Something ·
25 ft`.
- The DM's shelf: tracker and stat block side by side, Tentacle rollable at `+9` and
  `2d6+5`.

### Found in the browser, fixed here

Three things no headless run would have shown: a target whose name was the empty
string read as nothing (now `Something`); the screen, `100dvh` tall under the sitting
bar, scrolled by exactly one bar (the shell is now `h-dvh` on that route only); and a
tracker row in a column a third of the window wide squeezed its hit points into five
lines beside the field that edits them (the info block now keeps a floor and the
controls wrap). And one the browser made obvious: the bar's sixty-second poll left
_at the sand table_ standing for a minute after the fight ended, so the bar now
re-asks on the fight and sitting events it was already hearing.

### The second pass

After the phases, an evening was sat through at all three tables as the DM and as a
player, with the brief to find what a table would trip on rather than what the list
said. It found ten things and fixed them — among them last week's tokens on tonight's
board, tracker damage that never reached the sheet, a tray that showed a different
death save than the log recorded, and a player's shelf with no hit points on it. The
list, with what proved each, is in [phases.md](phases.md) under _The second pass_.

### Still to verify

- Two viewers on two machines, as the-same-room also recorded.
- A whole evening: the whisper thread carries the last forty, and the folded strip's
  count has only been watched for two.
