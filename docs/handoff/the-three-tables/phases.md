# The three tables — phases

Build order. Each phase leaves the app usable, and each is worth landing alone.

**All four phases are built.** `[x]` below means landed and verified, not merely
written; `[ ]` under a built phase is recorded as deliberately open, not forgotten.
Phases 1 and 2 landed on `main` directly; phases 3 and 4, and the two items phase 2
left open, landed together on `feat/the-three-tables-3-4`.

The model is in [README.md](README.md). Read it first: the whole of phase 1 is only
correct in the light of decision 1 (the table is derived, never stored), and phase 2's
stat block only in the light of decision 6 (the entry remembers a reference, never a
copy).

**Every phase that touches the database edits `src/db/schema.ts` and a new
`src/db/migrations/NNNN_*.sql` in the same change.** The next free number is `0044`.

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
      attacks, dice, checks, feed. _Phase 3 put `whispers` on both, between checks and
      feed; a shelf somebody has already arranged is untouched._
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

## Phase 2 — Attacks, targets, and the foe's stat block `[built · bc0cf66]`

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

- [x] Tap-to-aim proven in a browser, with phase 3. As the player, a foe revealed on
      the board was tapped and the row read `Something · 25 ft`, the longsword `out of
    reach`, the longbow `in range`; _Hit_ on the longbow rolled a natural 20 in the
      tray with the hint `to hit vs Something · 25 ft`, and the log carries the same
      label. Found on the way: the target's name was blank for a token whose entry is
      not in the running order — `??` on a label that is the empty string, not null —
      and now reads `Something`, the board's own word for a foe the DM has not named.
- [x] The DM's shelf in a browser, with phase 3: the tracker with Kessa, two aboleths
      and Rurik, the stat block under it reading `Aboleth 1 · 150/150 hp · ac 17` with
      _Hit +9_ / _2d6+5_ on Tentacle, `3d6` on Consume Memories and `1d10` on Psychic
      Drain, and _The whole block_ folded below. Found on the way: a tracker row in a
      column a third of the window wide squeezed `150 / 150 hp · ac 17` into five lines
      beside the hit-point field, because the info block had `min-w-0` and the controls
      never wrapped. `.screen-box-body [data-entry-info]` now has a floor, so the
      controls drop to a second line instead.

## Phase 3 — Whispers and trading `[built]`

- [x] `0043_whispers.sql`: `campaign_whispers` (id, campaign, from, body, session,
      created) and `campaign_whisper_targets` (whisper, user). `session_id` is the
      nullable link `campaign_checks` carries — the record of which evening, not a
      gate. Staff are never listed as targets and always read everything — decision 4:
      a whisper is never a channel the DM cannot see.
- [x] `src/server/whispers.ts`: `listWhispers` (staff read all; a player reads what
      they said and what was said to them, and nothing between two other people) and
      `sendWhisper` (any member; targets resolved against members + the GM before
      anything is written; yourself filtered out; nobody left → `NOBODY_TO_TELL`).
      `LiveState.whispers` carries the last 40 the reader may see, oldest first.
- [x] `whisper` event kind, published to `{ users: [sender, ...targets] }` — staff
      hear it through `reaches`. The line travels in the event, because everybody it
      reaches was meant to read it. `describe` says `Kessa whispers to you` for a
      target and `Rurik whispers to Kessa` for the DM overhearing, in the arcane tone.
      A `whisper` glyph — a bubble with one line in it, deliberately not the three-dot
      chat mark — joins the set.
- [x] A **Whispers** panel (`WhispersPanel.tsx`, key `whispers`, players allowed):
      reads as a thread — the reader's own lines on one wash, the ones said to them on
      another, everybody else named — composes to one or more people through the
      member list, opens addressed to the DM for a player and to nobody for the DM,
      and sends on Enter. Marks the table read by writing the newest `createdAt` into
      `TablePreferences.whispersReadAt[campaignId]`, beside mute, for the reason mute
      is there: "have I read this" is a fact about a reader on a device.
- [x] The folded shelf wears a count: `BattleArrangement` takes `badges`, and
      `DmScreen` computes two — asks waiting on the viewer (`checks`), and whispers
      newer than the read marker from somebody else (`whispers`). A folded panel's
      header wears the same number while it is folded. Nothing else earns one.
- [x] `giveItem` / `giveCoin` in `play.ts`. The giver's side is `authorize` (owner or
      staff) **plus a seat at this table** — `authorize` lets an owner through before
      it looks at the campaign, and a hero on the shelf must not hand things to a
      table it does not sit at. The receiver must be another character seated at the
      same table. Both sheets and both `character_history` rows are written in one
      `db.transaction`. An item merges onto the receiver's matching unattuned row —
      same `refKey` for content, same name for a hand-typed line — or lands as a fresh
      row, unequipped and unattuned; the giver's row is decremented or deleted, and
      handing over a worn shield recomputes the giver's armour class the way stowing
      it would. Attuned → `ATTUNED`; not seated → `NOT_AT_TABLE`; more coin than the
      purse holds → `NOT_ENOUGH_COIN`; nothing → `NOTHING_TO_GIVE`. One `gift` event
      to the two owners (and staff, through `reaches`).
- [x] `PlayLoadout` gains `currency` and `others` (the other seats at the table, empty
      without a campaign), and `PlayState` gains `loadoutKey` — a fingerprint of the
      pack and the purse. The attacks panel re-prices on it (armour class alone missed
      a longbow being drawn) and `MyHeroPanel` re-reads the loadout on it, which is
      how a potion somebody handed you appears without a remount.
- [x] A _Give_ control on every inventory row of `LoadoutSection` and on a new purse
      line under the list — a popover: to whom, how many (when the stack is more than
      one) or how much of each denomination the purse holds, _Hand it over_. An
      attuned row shows _Bound_ with the reason on hover instead. Off entirely with no
      table or nobody else seated.
- [x] The three-jar test, and the rest, below.

**Verified** — headless, against a production build, following
`verifying-without-a-browser.md`, with a fourth seated character (Rurik, owned by the
outsider account) seeded for the trades:

- Whispers written: player → DM, player → player, DM → one player. Refused: an empty
  body (`Say something.`), yourself as the only target, a user not at the table, and a
  stranger (`NOT_FOUND`, the leak-safe answer).
- The three-jar read through `getLiveStateAction`: the DM reads all three; the player
  reads only the two they said; the second player reads only the two said to them —
  **not** "I pocket the key" — and the stranger reads nothing.
- The wire: three `curl -N` streams open at once, the DM whispering the second player a
  marked string and the second player whispering the first. The marked string reached
  the DM's and the second player's streams and **never appeared in the first player's
  bytes**; all three still received the state nudges.
- Gifts: 1 of 2 daggers merged onto the receiver's dagger row (1 → 2); the rope moved
  whole and landed as a new row; the attuned ring was refused; the first player giving
  from the second's sheet was refused; a gift to a hero at another table and a gift to
  yourself were both refused as not seated; a stranger was refused; the DM gave a potion
  from Kessa's sheet to Rurik; 100 gp was refused as more than the purse; an empty coin
  gift was refused; 12 gp and 5 sp moved. Eight `character_history` rows, two per
  gift, in the DM's wording on both sheets — `Gave "Dagger" to Kessa` / `Received
"Dagger" from Rurik`, `Gave 12 gp, 5 sp to Kessa` with the purse before and after.
- The `gift` event reached both owners' streams and the DM's.

In a browser, as the player: the thread with `You → Verify GM`, `You → Rurik` and
`Rurik → you` on the arcane wash; a line typed and sent on Enter landed in the thread
and in The evening as `Kessa whispers to Verify GM`; _Give_ on a dagger row opened the
popover, 2 became 1; 3 gp handed over from another jar moved the purse 24 → 27 with
nothing pressed; with the shelf folded, two whispers from Rurik raised two slips and the
strip's whisper glyph wore a **2** beside the asking's **4**, and opening the panel
cleared it while the 4 stayed. As the DM: the thread reads every line, both ends named,
and a whisper composed to one chosen player landed.

## Phase 4 — The desk gets out of the way `[built]`

- [x] `tableAt(campaignId)` in `session.ts`: the two facts, one answer, no role check
      (the answer is not a secret and every caller has already established the reader
      belongs). `getLiveState` still derives its own from the rows it already holds.
- [x] `/campaigns/[id]` opens on the tab that fits: the page reads `tableAt` once on
      the server and `CampaignDetail` moves that tab to the front of the strip and
      selects it — Chronicle at the desk, Session at the table, Board at the sand
      table. Nothing else in the strip moves. Decided when the page opens, not live:
      tabs that rearrange under a reader mid-sitting would be the app moving the
      furniture while somebody is sitting on it.
- [x] `mySitting` returns `table` and the fight's name; `SittingBar` says _is sitting_
      at the table and _is at the sand table_ in a fight, wearing the sword and the
      danger ink the screen's ribbon already wears, with the fight's name on its
      second line. Its link already went to the screen, and since phase 1 the screen
      already opens on the board in a fight — so "straight to the screen in a fight"
      was true before this phase; what changed is the label, _To the sand table_.
- [x] The bar re-asks on `encounter` and `sitting` events off the stream it already
      holds, rather than only on its sixty-second poll — found in the browser, where
      ending a fight left the bar saying _at the sand table_ for up to a minute.
- [x] Found on the way: the screen is `100dvh` tall and sat under the sitting bar in a
      `min-h-screen` shell, so the page that "never scrolls" scrolled by exactly one
      bar — and at the sand table the bar is always up. `ConditionalLayout` bounds the
      shell to `h-dvh` on the screen route only, and `DmScreen` fills it with `h-full`.
      The other routes keep scrolling the document, which Next's scroll restoration
      expects.
- [x] In a browser: the battle layout at ~1500 px and at 430 px (the shelf drops under
      the board, the bar wraps to two lines), the shelf folded and open, a player's
      shelf and the DM's, both palettes. The full list at the foot of
      [README.md](README.md), each item ticked there.

**Verified** — headless: `mySittingAction` read `table: "battle"` with the fight's
name while one ran and `table: "table"` after `endEncounterAction`; the live state
agreed; a stranger got `null`. In a browser: at the table the page opened on Session
with the bar reading _is sitting_; after the DM called for initiative (from another
jar) a reload opened on Board, first in the strip, with the bar in the danger tone
reading _is at the sand table · Session 4 · The cistern_ and _To the sand table_; after
_End the fight_ and _Rise_ from the ribbon (both behind their confirms) the page opened
on Chronicle with no bar and Session 4 filed with Kessa and Rurik in the register. Then
_Take your seats_ raised the bar the same moment, and _Call for initiative_ flipped it
to the sand table without a reload.

## Still open

- **Two viewers on two machines.** Every browser check above was one Chrome, signed in
  as one account at a time, with the other seats driven by cookie jars. The-same-room
  recorded the same gap and nothing here closes it.
- **The whisper thread is the last forty.** A long evening at a talkative table will
  scroll older lines off `LiveState`. They are still rows; nothing reads them back yet.
- **Folding a panel loses what was typed in it.** A fold unmounts; the compose box and
  its recipient reset. Keeping a folded panel mounted would also keep marking whispers
  read, which is the wrong trade.
