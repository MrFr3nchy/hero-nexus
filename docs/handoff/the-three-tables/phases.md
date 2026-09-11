# The three tables — phases

Build order. Each phase leaves the app usable, and each is worth landing alone.

**Phases 1 and 2 are built** on `main`. `[x]` below means landed and verified, not
merely written; `[ ]` under a built phase is recorded as deliberately open, not
forgotten. Phases 3 and 4 are written and not started.

The model is in [README.md](README.md). Read it first: the whole of phase 1 is only
correct in the light of decision 1 (the table is derived, never stored), and phase 2's
stat block only in the light of decision 6 (the entry remembers a reference, never a
copy).

**Every phase that touches the database edits `src/db/schema.ts` and a new
`src/db/migrations/NNNN_*.sql` in the same change.** The next free number is `0043`.

---

## Phase 1 — The table is known, and the screen follows it `[built · 723347f]`

- [x] `LiveState.table`, derived in `src/server/session.ts`: no sitting → `desk`; a
      sitting with no running fight → `table`; a sitting with one → `battle`. Nothing
      writes it; the DM's existing verbs change it.
- [x] `TableRibbon` in the screen header: which table, in the danger tone when it is
      the sand table, and beside it the DM's verbs — _Take your seats_ / _Rise_ and
      _Call for initiative_ / _End the fight_ — the last two behind a confirm.
- [x] The viewer's **pin**: hold the screen at a table the campaign is not at. Stored
      with the viewer's layouts as `layouts.pin`; says nothing to anybody else.
- [x] `campaign_screen_layouts.layout` is now `ScreenLayouts { desk, table, battle,
    pin }`. `normalizeLayouts` reads both older shapes (`{columns}` and
      `{main, rail}`) as the `table` arrangement, so nobody's screen reset.
- [x] The **battle arrangement** (`BattleArrangement.tsx`): board fitted to the main
      region by a `ResizeObserver`, a shelf beside it (`22rem`, `26rem` at `xl`) that
      folds to a strip of glyphs, each panel foldable, arrange = add / up / down /
      remove. Panels render headless in `.screen-box-body.shelf-dense`. Below `lg` the
      shelf drops under the board.
- [x] Default shelves. Staff: initiative, stat block, dice, checks, feed. Player: mine,
      attacks, dice, checks, feed.
- [x] The sidebar starts folded on `/campaigns/[id]/screen`; the hand control still
      works there.
- [x] Fix found on the way: `setBattleMapActive` rebinds the board to the fight
      running now, not the ended one it was dealt on.
- [ ] `/campaigns/[id]` opening on the tab that fits the table. Written into this
      phase, not built here; it is the same change as phase 4's first bullet and moves
      there.

**Verified** — `table` derives through desk → table → battle → table → desk by real
actions against a production build; seven normalisation cases headless; in a browser
as a player, the board fitting the region with the shelf beside it, and pinning to the
table swapping to columns and unpinning swapping back.

## Phase 2 — Attacks, targets, and the foe's stat block `[built]`

- [x] `0042_entry_creature.sql`: `initiative_entries.creature_ref` (json, nullable).
      `addCreaturesToEncounter` sets it; a hand-typed entry carries null. Nulled for
      players in `LiveState` — the ref names a bestiary key, and a player at the table
      does not learn what the DM has not said.
- [x] `src/server/fight.ts`: `getMyAttacks` (owner or staff; `weaponAttacks` off the
      sheet with its refs resolved, so a forged weapon corrected in the library is
      corrected here), `getEntryCreature` (staff; resolves the ref), `mySeat`. Actions
      in `fight-actions.ts`.
- [x] `src/@shared/battlemap/selection.ts`: the selected token, per campaign, through
      `useSyncExternalStore`. The board publishes to it; the two panels read it.
- [x] **Attacks** panel: one row per equipped weapon — name, to-hit, damage, range —
      _Hit_ and _Damage_ through `rollAction` as the character; adv/dis on the row;
      versatile weapons get a _two hands_ toggle. With a token selected the row reads
      `vs Aboleth 3 · 25 ft` and says in reach / in range / long / out — and refuses
      nothing. The label carries weapon, what, and target.
- [x] **Stat block** panel, staff only: the selected foe's block through `StatBlock
    headless` in a `<details>`, its actions above it with roll buttons wherever the
      prose parses — `Attack Roll: +9` becomes _Hit +9_, `(2d6 + 5)` becomes _Damage
      2d6+5_, a save-only action gets only its damage. Rolls go through `rollAction`
      with no character and the label `Aboleth 3 · Tentacle · to hit`.
- [x] `BattleBoard` takes `fitHeight` and publishes its selection.

**Verified** — a freshly dealt aboleth's entry carries
`{"source":"srd","type":"creature","key":"srd-2024_aboleth"}`; `getEntryCreatureAction`
returns the block for the DM and `null` for the player; `getMyAttacksAction` returns
Kessa's `Longsword +3 1d8/1d10` and `Longbow +7 1d8+4 150/600` and a stranger gets
`[]`; the parser reads Tentacle as `1d20+9` / `2d6+5` and Consume Memories as `3d6`
only; both roll paths land in `campaign_rolls` with their labels — `Longsword · to hit
vs Aboleth 3 · 10 ft` as Kessa, `Aboleth 3 · Tentacle · to hit` with no character —
and show in the feed. In a browser as the player: the shelf carries Your hero,
Attacks, Dice, The asking, The evening; the Attacks panel lists both weapons with
their bonuses and the longbow's range.

- [ ] Tap-to-aim proven in a browser. The foes on the probe campaign's board sit in fog
      on the player's side, so the selection → `vs … ft` readout was proven through the
      store and the label it produces, not by a click. Reveal a foe and tap it before
      calling this closed.
- [ ] The DM's shelf in a browser (stat block + tracker side by side). Proven headless
      through the action and the parser; not yet looked at.

## Phase 3 — Whispers and trading `[ ]`

- [ ] `0043_whispers.sql`: `campaign_whispers` (id, campaign, from, body, created) and
      `campaign_whisper_targets` (whisper, user). Staff always among the readers —
      decision 4: a whisper is never a channel the DM cannot see.
- [ ] `whisper` event kind, audience = sender + targets + staff, through
      `publish(campaignId, event, audience)`; `LiveState.whispers` carries the last N
      the reader may see.
- [ ] A **Whispers** shelf panel: reads as a thread, composes to one or more people,
      badges when unread (per reader, in `preferences.ts` beside mute).
- [ ] `giveItem` / `giveCoin` in `play.ts`: same campaign, giver owns the source, both
      sheets written in one transaction, quantity merged on a matching row, an attuned
      item refused, two `character_history` rows, one announcement to the two parties
      and staff.
- [ ] A _Give_ control on the inventory rows of `LoadoutSection` and on the currency
      line.
- [ ] The three-jar test: a whisper reaches its recipient and staff and nobody else. A
      gift moves the row, merges, refuses attuned, refuses a character the giver does
      not own, writes two history rows.

## Phase 4 — The desk gets out of the way `[ ]`

- [ ] `/campaigns/[id]` opens on the tab that fits: at the sand table, the board; at
      the table, Session; at the desk, the Chronicle. The tab strip's order follows.
- [ ] `SittingBar` says which table, not only that one is sitting; in a fight its link
      goes straight to the screen.
- [ ] In a browser: the battle layout at laptop and phone width, the shelf folded and
      open, a player's and the DM's, both palettes. The full list at the foot of
      [README.md](README.md).
