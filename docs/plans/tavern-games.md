# Tavern games

Status: **Stage 1 done** · **Stage 2 done** · **Stage 3 done** · **Stage 4 done** (on `feat/tavern-games`, not pushed)
Branch base: `main` @ `1989348`
Baseline: `npx tsc --noEmit -p .` exit 0 · `npm test` 40 files / 309 tests passed (2026-10-13)

Request: in-session gambling games, so players see and play the game instead of "roll a
d20, you win 5 gp". MVP is one game, liar's dice, played over several rounds.

## Decisions the owner made up front

- No Three-Dragon Ante or any WotC game: no names, card text or art. Original or
  public-domain mechanics only.
- MVP is **one** game: liar's dice. Several rounds of raise / hold / fold / bluff, then
  the roll. Not a single roll.
- Bonuses come from the character sheet (gaming-set proficiency, ability modifiers via
  `derive.ts`). No per-class roles or powers.
- Opponents are canon NPCs, played by the DM. Attitude and stat block flavour them.
- Stakes are real: bets come out of character gold, and the pot pays the winner.
- Cheating is allowed and hidden: Sleight of Hand against the opponents' passive
  Insight/Perception. Only the cheater and staff see the attempt. Getting caught tells
  the DM; the app never decides the consequences.
- The server rolls (`rollForCampaign` pattern), and results land in Dice.
- Game records are play history: `NEVER_CARRIED`. Nothing goes in `campaigns.settings`.
- No "table" in naming. A noun is proposed below.

## Diagnosis

Nothing exists yet. Today a game of chance is a typed `1d20` in Rolls plus the DM editing
gold by hand. The pieces it should be built from all exist; three of them do not stretch
far enough as they are.

1. **Dice cannot be private to a player** (data). `campaign_rolls.visibility` is
   `'table' | 'dm'`, and `rollForCampaign` (`src/server/session/rolls.ts:42`) forces
   `'table'` for players ("a player hiding a roll from the DM is not a feature").
   `getLiveState` filters `isStaff || r.visibility === 'table'`
   (`src/server/session/live.ts:360`). A cheat roll must be seen by the cheater and staff
   and nobody else, so the log needs a third visibility: hidden from the other players,
   never from the DM. That keeps the existing rule (nothing is hidden from the DM).
   Hidden dice in a cup are a different thing: they belong to the game's own rows, read
   through a role-filtered path, and are written to Dice only when the cups are lifted.
2. **Gaming-set proficiency is prose** (data). `sheet.proficiencies.tools` is a free
   string (`src/@creator/character/schema.ts:599`). There is no structured tool grant.
   The `weaponProficiency` comment beside it warns against guessing from prose at read
   time. The MVP has to read it anyway, so it goes through one strict pure matcher that
   the panel shows back ("Dice set: proficient") so a player can see and fix a miss.
3. **"Game" already means the campaign in copy** (naming). "Runs the game"
   (`MembersPanel.tsx:211`), "Not in this game at all" (`lib/safety.ts:32`). A bare
   "game" for a round of liar's dice collides with that. The noun needs a qualifier.

Everything else is reuse.

## What already exists (reuse these)

| Need                                    | Existing                                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Server rolls, Dice row, announcement    | `rollForCampaign` `src/server/session/rolls.ts:42`                                                                                       |
| A roll off the sheet, bonus server-side | `rollFromSheet` `src/server/sheet-rolls.ts`, `sheetRollBonus` `campaign/lib/sheet-rolls.ts` (exhaustion via `d20PenaltyFor`)             |
| Skill / ability maths                   | `skillBonus`, `abilityMod`, `proficiencyBonus`, `passivePerception` `character/lib/derive.ts`                                            |
| Paying out of a purse, with history     | `payFromPurse` / `addToPurse` / `purseInCp` / `cpWords` `character/lib/coins.ts`; the transaction shape in `src/server/shops.ts:579-640` |
| Coin between two seated characters      | `src/server/play/trading.ts:291-340` (`NOT_ENOUGH_COIN`, two `character_history` rows)                                                   |
| NPC attitude and stat block             | `canon_entries.attitude`, `stat_source`/`stat_key` (0069); `src/server/npcs.ts` (staff-only)                                             |
| NPC passive Insight / Perception        | creature `data.passive_perception`, `skill_bonuses.insight`, `ability_scores` `@shared/content/schemas.ts:530-539`                       |
| Live updates                            | `bumpVersion` / `publish` with `Audience` `'everyone' \| 'staff' \| 'players' \| { users }` `src/server/live-hub.ts:46`                  |
| Announcements                           | `TABLE_EVENT_KINDS` `@shared/table/events.ts` (one entry plus one `describe` line per kind)                                              |
| A private line to some players + staff  | `WhisperEvent` / `src/server/whispers.ts` (the audience pattern a cheat result follows)                                                  |
| Session screen panels                   | `SCREEN_PANEL_KEYS` / `SCREEN_PANELS` `campaign/lib/screen.ts:15`                                                                        |
| Package exclusion                       | `NEVER_CARRIED` `src/server/library-campaign-package.ts:108`                                                                             |
| Dice animation                          | `Dice3DRoller` `@shared/components/ui/Dice3DRoller.tsx`                                                                                  |

## Recommendation (ranked)

1. **If you only do this:** the liar's dice engine as a pure module
   (`campaign/lib/liars-dice.ts`: state, legal moves, bid order, who lost the call), with
   tests. Every rule lives there, so the server and the panel agree. **M**
2. **If you only do this:** the server half: tables for a game, its seats and its moves
   (migration `0075`), stakes out of the purse and the pot paid in one transaction with
   `character_history` rows, cups rolled by the server and written to Dice when lifted. **L**
3. A session-screen panel to sit, bid, call and see the pot; the DM plays each NPC seat
   from the same panel. **M**
4. Cheating: a hidden Sleight of Hand roll (third Dice visibility, audience cheater +
   staff), checked against the highest passive Insight/Perception at the game; caught
   tells the DM and stops there. **M**
5. Sheet bonuses: gaming-set (dice) proficiency and an Insight read of the last bid,
   both server-side through `derive.ts`. **S**
6. A second, original card game as a later PR on the same engine (owner to say). **L**

## Decisions at checkpoint 1 (owner, 2026-10-13)

- **Where:** both. A session-screen panel to play on, and a campaign-page section listing
  past tavern games (who sat, who won, what the pot was).
- **Who starts one:** the DM only. The DM seats NPC opponents and invites heroes; a
  player sits or declines.
- **Second game:** build it in this run. An original card game, after liar's dice, on
  the same seats / stakes / pot / cheat model.
- **Noun:** a tavern game. Panel "Tavern games". Inside one: a round, a bid, the stake,
  the pot, "Liar!" (the call), cheat, caught.

## The rules of play

Both games share one frame: **seats, an ante, a stake that can rise, a pot per round,
reads and cheats off the sheet.** Only the middle of a round differs.

**The frame.** The DM opens a tavern game (kind, a name like "Dice at the Gilded Eel",
the ante, the most one raise may add, up to six seats). NPC seats are canon NPCs; hero
seats are invitations, and a player taps **Sit down** (consenting to the stakes) or
**Not this time**. The DM starts each round. A round takes the ante from every seated
hero's purse (an NPC's coin comes from nowhere and goes nowhere); a hero who cannot
cover it stands up. Coin is held in copper internally (`purseInCp`) and shown with
`cpWords`. Bidding or calling after somebody raised **holds**: it takes the difference
from your purse. **Fold** leaves the round; what you put in stays in the pot. The round's
winner takes the pot; when everyone else folds, the last seat in takes it unshown. **End
the tavern game** may come at any time; mid-round, every hero's stake for that round
goes back.

**Liar's dice** (the public-domain dudo family). Five dice a cup, shaken by the server,
each seat seeing only its own (the DM sees the NPCs' cups; heroes' cups are behind a
"Show me the heroes' cups" switch, off by default). The loser of the last call opens the
next round (the winner, if the loser is out). On your turn: **Bid** a count and a face ("four 5s"), which must beat the
last bid (more dice, or as many of a higher face), and may **raise** the stake; or call
**Liar!** on the last bid; or **Fold**. Bluffing is bidding what you do not hold, and
there is no separate button for it. Ones are wild unless the DM turns that off. On
"Liar!" every cup is lifted, and each one lands in Dice as its own row (`5d6`, the
seat's name, "Liar's dice · round 3"). If the count is at least the bid, the caller
loses; otherwise the bidder loses. The winner of the call takes the pot. The loser
sets one die aside for the rest of the game, and a seat with no dice is out. The game
ends when one seat still has dice, or when the DM ends it.

**Crowns** (an original card game). It uses 40 cards in four suits (Coins, Cups, Blades,
Staves), ranked 1 to 10, shuffled by the server. Each seat is dealt two cards face down,
then one card is turned up in the middle: **the crown**. Its suit is crowned for the
round, and crowned cards count double. One pass of betting follows (raise / hold /
fold). Then each seat still in may **draw** up to two cards, one at a time, or
**stand**. A second pass of betting follows, then the show: the highest hand at or under
31 wins, a hand over 31 is bust, ties split the pot, and if everyone busts the pot
**rolls over** into the next round. Cards are not dice: no Dice row for a deal, but
every read and cheat is a d20 and lands in Dice.

**Off the sheet** (server-side, `derive.ts`, once a round each, on your own turn):

- **Read** a seat: a Wisdom (Insight) check against that seat's passive Deception
  (10 + `skillBonus(deception)`; for an NPC, its stat block's `skill_bonuses.deception`,
  else its Charisma modifier, else +0). On a success it tells you one true thing, which
  only you and staff see. In liar's dice: whether the last bidder holds at least one of
  the face they bid. In Crowns: whether they hold a crowned card. The roll itself is
  public in Dice.
- **Cheat**: a Dexterity (Sleight of Hand) check against the highest passive Perception
  or passive Insight among the other seats still in. In liar's dice you **palm a die**
  and set one die to a face you choose. In Crowns you **deal from the bottom**: draw two
  and keep one. The roll lands in Dice as a hidden row that only the cheater and staff
  see. On a success, the change happens quietly and the DM's panel says "got away with
  it". On a failure, nothing changes, and the DM gets a hidden slip saying who noticed.
  The app does nothing more: what happens next is the DM's to say.
- **Proficiency:** a hero proficient with the right gaming set (a dice set for liar's
  dice, a playing-card set for Crowns) has advantage on both checks. This is the 2024
  rule for a tool plus a skill. The panel shows "Dice set: proficient" or
  "Dice set: not proficient", read from the sheet's tools line.
- The DM may read and cheat for an NPC seat the same way, off its stat block (+0 without
  one). An NPC's attitude is shown as a chip on its seat. It is flavour only and changes
  no number.

## Design brief

**The idea:** a tavern game on the session screen that the party can see and play,
round by round, with real coin, and with reads and cheats off the sheet.

Artboards:

1. **Main**: the "Tavern games" panel, a player's view mid-round in liar's dice. It
   shows your cup, the bid line, the pot, the seats, and the action row (Bid / Liar! /
   Fold, plus Read and Cheat). Interactive.
2. **DM**: the same round from behind the screen. It shows the NPC cups, acting as an
   NPC seat, attitude chips, and the hidden rows for cheats.
3. **Liar!**: the lift. Cups are shown, the count is made, the pot is paid, a die is
   set aside.
4. **Cheat**: a player palms a die (hidden roll, "only you"), and the DM's slip when a
   cheat is caught.
5. **Open**: the DM opens a tavern game (kind, name, ante, raise cap, ones wild, NPC
   and hero seats).
6. **Invite and empty**: a player is asked to sit (**Sit down** / **Not this time**),
   and the panel with no game running.
7. **Crowns**: the card game mid-round, a player's view.
8. **History**: the campaign page's "Tavern games" section, past games, who won what.
9. **Phone**: the player's view at 390 wide.

Look: the repo's tokens (`docs/design-language.md` table). Light: `--bg #faf6ef`,
`--surface #ffffff`, `--surface-2 #f3ede1`, `--ink #2b2620`, `--ink-muted #6b6459`,
`--line #e4dccb`, `--gold #b4894a`, `--gold-strong #7a5c2e`, `--danger #a23b34`,
`--success #3f7d55`. Dark: `#16130f` / `#1e1a14` / `#262019` / `#ede7da` / `#a89f8d` /
`#33291d` / `#d9b061` / `#e8c988` / `#d9756c` / `#6bbf8a`. Fonts: Fraunces (display),
Cinzel (panel titles), Inter (body), Caveat (margin only). Glyphs are stroked at 1.5 in
`currentColor`, and a new `cards` glyph is needed. The panels use the status language:
`yours`, `waiting`, `hidden` "only you", `live`. A theme tweak is on every artboard.

Words: tavern game, round, bid, stake, pot, ante, raise, hold, fold, Liar!, read, cheat,
palm a die, deal from the bottom, caught, Sit down, Not this time, End the tavern game.
None of them are in a "Never again" column. "Dice" is only the roll log; the dice in a
cup are "your cup".

## Canvas

https://claude.ai/artifact/Hk6GMjVNZ6PeFdgL3YWAom (private; nine artboards, a theme tweak
on each)

- **Player · liar's dice, your turn** (interactive): the panel mid-round. It shows the
  seats, the bid line, your cup, the count, face and raise pickers, Bid / Liar! / Fold,
  and Read and Palm a die. A read result shows as an "only you" row.
- **DM · the same round**: an NPC to act, with its cup visible. It shows attitude and
  stat-block chips, the heroes' passives, the hidden rows for a cheat and a read, the
  "Show me the heroes' cups" switch (off), Next round, and End the tavern game.
- **Liar! · the cups lifted**: each cup's dice are counted, the pot is paid, a die is
  set aside, and each cup becomes its own line in Dice.
- **Cheat · palm a die, and caught**: the player picks a die and a face, the roll stays
  hidden, the hidden row in Dice, and the DM's "Caught" slip.
- **DM · open a tavern game**: kind, name, ante, raise cap, ones wild, NPC seats and
  hero invitations.
- **Player · asked to sit, and nothing running**: the Sit down / Not this time
  invitation with the purse shown, and the empty state (only the DM sees the button).
- **Phone · player**: a pinned action tray, 44px targets.
- **Crowns · the card game**: the crown card, the hand total against 31, Draw / Stand /
  Fold, and Read and Deal from the bottom.
- **Campaign page · Tavern games**: a ledger line, the running game with each seat's net,
  past games, the catches (only you), and a rail of who is up and down.

### Mockup copy that is NOT final

- "Tavern games" sits between Downtime and Battle boards in the sections list. Its place
  there is a guess.
- The hand-lettered lines are filler; the real ones are written in Stage 4.
- The DM board's NPC bid controls are drawn as static chips; the build reuses the
  player's pickers.

## Checkpoint 2 (owner, 2026-10-13)

"Make whatever changes you think would be good … gambling tavern games would be useful for
the DM to also potentially have a hand in creating through set rules or such for their
players with names. … Put it all on one branch and then I will verify and push it as
needed and I'll make the PR."

So: **house games** (below) join the design, every other open choice is made in
"Decisions", and the work is one local branch, `feat/tavern-games`, one commit per PR
below. Nothing is pushed; no PR is opened.

---

# The build plan

## Status

Base `main` @ `1989348`. Ran: `npx tsc --noEmit -p .` exit 0; `npm test` 40 files / 309
tests. Next migration: **`0075`** (`ls src/db/migrations | tail -1` is `0074_place_stops.sql`).

## Context: the rules that bite

- `src/db/schema.ts` and `src/db/migrations/*.sql` are hand-written **together** (CLAUDE.md).
- Every server write a live view reads calls `bumpVersion(campaignId)` **in the server
  module**, after the commit (`src/db/README.md` § Real-time).
- Event payloads must be safe for their audience; `reaches()` sends `{ users }` to those
  users **and every staff member** (`src/server/live-hub.ts:48`).
- A campaign-scoped table is opted out of packages unless added to `CARRIED` on purpose
  (`docs/sharing-model.md` rule 5, `src/server/library-campaign-package.ts:108`).
- Coin on a sheet changes with a `character_history` row of kind `currency`, server-side,
  in the same transaction (content-model rule 7; `src/server/shops.ts:579-640`).
- If the server rolled a die the viewer caused, the dice tray draws the server's faces
  (design-language rule 4).
- On the screen: one panel chrome, state only in the six status words (rule 9); panel
  controls are `sm` (rule 10); no emoji, glyphs from `Glyph` (rule 8).
- One thing, one name (docs/naming.md). "game" alone already means the campaign in copy.

## What already exists (reuse these)

(See the stage-1 table above; all anchors re-checked 2026-10-13.) Added for the build:

| Need                                  | Existing                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| d20 notation with advantage           | `sheetRollNotation(bonus, mode)` `campaign/lib/sheet-rolls.ts:172`                                 |
| Skill keys incl. `sleightOfHand`      | `SKILL_KEYS` `character/schema.ts`; creature `skill_bonuses` uses the same keys (`schemas.ts:539`) |
| Creature data off a ref               | `resolveContentRefs` `server/content.ts:132` + `parseContentData('creature', …)`                   |
| NPC's stat block columns              | `canon_entries.stat_source` / `stat_key`, read the way `server/canon.ts:169` does                  |
| The sitting in progress               | `campaignSessions` where `status = 'live'` (`server/session/live.ts:442`)                          |
| A DM-authored, carried campaign table | random tables: `server/random-tables.ts`, `random-table-actions.ts`, package lines 94/340/513/860  |
| Screen panel registry + render switch | `SCREEN_PANELS` `lib/screen.ts:56`; `renderPanel` switch `screen/DmScreen.tsx:~560-735`            |
| Campaign page section list            | `sections` `components/CampaignDetail.tsx:258` (group `Play`, after Downtime)                      |
| Feed labels per event kind            | `KIND_LABEL` / `KIND_GROUPS` `screen/FeedPanel.tsx:31`                                             |
| Server test harness                   | `test/db.ts` + `src/server/random-tables.test.ts` (pattern)                                        |

## Decisions

1. **House games are DM-named rule sets on one of the two games.** A house game is
   `{ name, kind, blurb, rules }`, where `rules` holds that kind's own settings, clamped
   by a pure `normalizeRules`. "Brannoc's Bones: six dice, no wild ones, spot on allowed,
   ante 2 gp" is a house game. _Why:_ it gives the DM authorship over names and rules
   without a rules language, and every setting is one the engine already understands.
   The two plain games are always on offer as "Liar's dice" and "Crowns" with default
   rules; house games appear beside them in the Open form.
2. **House games are prep, so they are `CARRIED`**; tavern games, seats and moves are
   play history, so they are `NEVER_CARRIED`. _Why:_ a house game is exactly like a
   random table, a thing to run. The owner's rule "game records are play history" holds.
3. **A tavern game snapshots its rules when opened.** Editing or deleting a house game
   never changes a game in progress (`house_game_id` set null on delete, `rules` copied).
4. **One running tavern game per campaign.** The panel shows it. _Why:_ one at a time is
   how a table plays, and it keeps "the" game unambiguous for players and for the
   `LiveState` field.
5. **The running game rides on `LiveState`** as `tavern: TavernView | null`, built per
   viewer by `tavernViewFor()`. _Why:_ `shared.ts:174-186` argues "one answer, one
   request" for every live panel. Cups, hands and the deck are filtered there and only
   there.
6. **Round state is one JSON column, written in a transaction.** Each move reads the row,
   checks whose turn it is, and writes the new state plus any coin changes together.
   Moves are logged as rows (`tavern_game_moves`) for the record and the history page.
7. **Hidden dice reuse `visibility = 'dm'`.** The roll-log filter widens from
   `isStaff || table` to `isStaff || table || actorUserId === viewer`. _Why:_ no player
   has ever been able to make a `'dm'` roll, so no existing row changes meaning, and the
   rule "nothing is hidden from the DM" holds. Players still can't choose `'dm'` through
   `rollForCampaign`'s input. Only the tavern module asks for it.
8. **Cups are rolled by the server when a round starts, and written to Dice when
   lifted.** Each cup is one row with the faces the server rolled. These rows are quiet
   (no roll slip each); one `tavern` announcement carries the lift. Reads and cheats are
   ordinary d20 rows, and the dice tray draws them for the person who rolled.
   `rollForCampaign`'s insert / bump / publish moves into `recordRoll()` in the same
   file, so both paths write one kind of row.
9. **Cards are shuffled with `node:crypto` `randomInt`** and never touch Dice (they are
   not dice). The deck order lives in the round state, which is never sent to a player.
10. **The DM sees every cup.** Heroes' cups are behind a "Show me the heroes' cups"
    switch, off by default (UI only). _Why:_ nothing is hidden from the DM, but a DM who
    plays the NPCs honestly would rather not see them.
11. **Coin.** Antes and holds come out of the purse when paid, and the pot is paid out
    at round end, each with a `character_history` `currency` row. NPC coin is notional.
    Ending a game mid-round hands each hero back what they put in that round.
    `tavern_game_seats.net_cp` keeps a running net for the record.
12. **A failed cheat tells the cheater "it did not work" and nothing about who saw.** The
    DM gets a staff-only `tavern` event and a hidden move row naming who noticed. Nothing
    else happens automatically.
13. **Gaming-set proficiency is read off `proficiencies.tools`** with one strict pure
    matcher (`/\bdice\b/i` for liar's dice; `/playing[- ]?cards?|card set/i` for Crowns).
    The panel prints the result.
14. **Spot on** (an optional liar's dice rule, public domain like the rest of the dudo
    family): instead of "Liar!", claim the bid is exactly right. If you are right you
    take the pot; if you are wrong you lose a die and the bidder takes the pot.
15. **The DM starts each round** with "Next round", and nothing advances by itself. A
    seat that can't cover the ante stands up for the rest of the game.

## The work (one branch `feat/tavern-games`, one commit each)

### PR 1: the rules, pure (needs: —)

- `src/@creator/campaign/lib/tavern.ts`: `TAVERN_KINDS = ['liars-dice','crowns']`,
  `LiarsDiceRules`, `CrownsRules`, `DEFAULT_RULES`, `normalizeRules(kind, raw)`, betting
  helpers (`holdCp`, `canRaise`), `rulesLines(kind, rules)` (the "How it's played"
  sentences for players), `gamingSetProficient(toolsText, kind)`, limits (`MAX_SEATS = 6`).
- `src/@creator/campaign/lib/liars-dice.ts`: round state type, `newRound`, `beats`,
  `applyBid`, `applyCall`, `applySpotOn`, `fold`, `countFace`, `nextSeat`.
- `src/@creator/campaign/lib/crowns.ts`: `deck()`, `cardValue`, `handTotal`, `newRound`,
  phases `bet1 → draw → bet2 → show`, `draw`, `stand`, `showdown` (winners, ties split,
  all bust rolls over).
- Tests beside each: bid ordering incl. wild ones, a call both ways, spot on, folding to
  one seat, ante shortfall, Crowns totals with the crown, bust, ties, rollover, the
  proficiency matcher, and `normalizeRules` clamping garbage.
- **Done means:** `npm test` green, no React or db imports in the three files.

### PR 2: tables, house games, packages (needs: PR 1)

- `0075_tavern_games.sql` + `schema.ts`: `tavern_house_games`, `tavern_games`,
  `tavern_game_seats`, `tavern_game_moves` (columns in Decisions 1–6).
- `src/server/tavern/house-games.ts`: list (any member), create/update/delete (staff).
- `library-campaign-package.ts`: `tavern_house_games` into `CARRIED` + build + adopt;
  the other three into `NEVER_CARRIED`.
- `src/@creator/campaign/tavern-actions.ts` (house-game actions).
- Tests: staff-only writes, player read, rules normalised on write, package carries
  house games and none of the game rows.

### PR 3: playing, on the server (needs: PR 2)

- `src/server/session/rolls.ts`: extract `recordRoll`; `rollForCampaign` unchanged in
  behaviour.
- `src/server/session/live.ts:360`: the widened filter (Decision 7); `LiveState.tavern`.
- `src/server/tavern/`: `open`, `answerSeat` (sit / not this time), `startRound`, `act`
  (bid / call / spot on / raise / fold / draw / stand), `read`, `cheat`, `endGame`,
  `tavernViewFor`, `listTavernGames` (history, role-filtered).
- `@shared/table/events.ts`: kind `tavern` (`TavernEvent { line, caught? }`), glyph
  `tankard`, and `describe`; `FeedPanel` `KIND_LABEL` "Tavern games".
- Actions in `tavern-actions.ts`.
- Tests: a player never receives another seat's cup or hand or the deck; a cheat roll is
  visible to the cheater and staff and absent for another player; coin and history rows
  on ante/hold/payout; ending mid-round refunds; NPC read/cheat off a stat block;
  out-of-turn and illegal bids refused.

### PR 4: the session-screen panel (needs: PR 3)

- `SCREEN_PANEL_KEYS` + `SCREEN_PANELS.tavern` (`label: 'Tavern games'`, glyph
  `tankard`, players: true), `renderPanel` case, live badge when waiting on the viewer.
- `components/screen/tavern/`: `TavernPanel`, `OpenTavernGame`, `SeatList`,
  `LiarsDicePlay`, `CrownsPlay`, `PipDie`, `PlayingCard`, `TavernMoveLog`.
- `Glyph`: new `cards`.
- **Done means:** looked at as DM and player, light and dark, desktop and phone.

### PR 5: the campaign page section (needs: PR 3)

- `CampaignDetail.tsx` section `tavern` (group Play, after Downtime): house games
  (staff edit, players read with `rulesLines`), then the record: games newest first with
  each seat's net, and the catches as `hidden` rows for staff.

### PR 6: vocabulary and docs (needs: PR 4–5)

- `docs/naming.md` rows: tavern game, Tavern games, house game, the pot, Liar!, Spot on,
  Palm a die, Deal from the bottom, caught, Sit down, Not this time, End the tavern game.
- `docs/sharing-model.md` rule 5 lists: house games carried; tavern games not.

## Verification

```bash
npm run check && npx tsc --noEmit -p . && npm test && npm run build
```

Then in the running app (`npm run dev`), as a DM and a player, light and dark, at desktop
and 390 px. Open a house game, sit, play a round of each game to a payout, read, cheat
until caught, end mid-round, then check the purses and the character history.

## Traps

- `TABLE_EVENT_KINDS`, `GLYPHS`, `describe`, `FeedPanel.KIND_LABEL` must all gain
  `tavern`. Three of them are `Record<TableEventKind, …>`, so tsc catches them;
  `KIND_GROUPS` does not (an unfiled kind lands in the last row).
- `SCREEN_PANELS` is a `Record`, so tsc catches it; `LIVE_PANELS` / `HIDDEN_PANELS` sets
  don't.
- `getLiveState` is JSON-fingerprinted: a `tavern` view built with unstable key order or
  timestamps would re-render every panel each poll. Build it deterministically.
- `campaign_rolls.visibility` has no CHECK (0014), so `'dm'` from a player is valid at
  the db level. The filter is the only guard; test it.
- A purse can't go negative: always `payFromPurse` → null means "can't cover".

## Out of scope

- Posting tavern games to Discord (a fourth outbound call would need a CLAUDE.md line).
- A rules language for house games beyond the knobs each engine understands.
- Player-vs-player games with no DM: the owner chose DM-only opening.

## Progress

- [x] PR 1 the rules, pure — 24 tests. Deviation: the loser of a call opens the next round
      (dudo's own rule), not the seat to their left.
- [x] PR 2 tables, house games, packages — migration 0075; 3 server tests
- [x] PR 3 playing, on the server — 11 server tests (filtering, coin, cheat audience, refunds)
- [x] PR 4 the session-screen panel — looked at as DM in light, dark and 400 px: open, sit, a round to the lift, a cheat, end mid-round, Crowns dealt
- [x] PR 5 the campaign page section — house game written through the UI; record and rail
- [x] PR 6 vocabulary and docs

## Build notes (2026-10-13)

Gates on the final commit: `npm run check` clean · `npx tsc --noEmit -p .` exit 0 ·
`npm test` 45 files / 347 tests · `npm run build` exit 0.

Looked at in the running app as the DM, in light and dark and at 400 px: wrote a house
game, opened it from the screen, sat a hero, played a liar's dice round to the lift, palmed
a die, ended a game mid-round (stakes back), and dealt a Crowns round.

**Not looked at in a browser:** a second account's view (the player's own cup only, the
invitation from the other side). The server tests assert it (`src/server/tavern/games.test.ts`),
but a sign-in as `mrfrenchj+user@gmail.com` on the "Tavern test" campaign would show it.

The local dev database has migration 0075 applied, plus a scratch campaign "Tavern test"
(id `tavern-test-0000-4000-8000-000000000001`) with two heroes, two NPCs and the games
played above. Delete the campaign when done with it.

Deviations from the plan: the loser of a liar's dice call opens the next round (PR 1). A
read or a cheat in liar's dice may be made any time in the round, not only on your turn;
Crowns' cheat is a draw, so it stays on your turn.

---

# Addendum: dice games of the DM's own rules (2026-10-13)

The owner's ask: a DM puts together a dice game from rules ("roll N dice, wins on …") and
names it, instead of only tuning the two built-in games. Their answers:

1. The DM can play too: either as **the house** (every player against the DM, paid at set
   odds), with the house played as "the house" or as one of the NPCs, or through NPC seats
   as before.
2. **Push your luck** is in, as one of the options.
3. **Any combination** is allowed, plus templates and recommended options.

## The rules (a third kind, `custom-dice`, label "Dice game")

| Rule         | Options                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| Dice         | 1–10 dice of d4, d6, d8, d10, d12 or d20                                                    |
| A turn       | one roll · hold and reroll (up to 3 rerolls) · push your luck (roll until you stop or bust) |
| Score        | sum · highest die · how many show N or more · most of a kind · longest straight             |
| Wins on      | highest · lowest · closest to N without going over · exactly N · first to N points          |
| Bust face    | none, or a face: any die showing it busts (in push your luck, loses the turn's points)      |
| Wild face    | none, or a face that counts as whatever helps most                                          |
| Instant win  | none · every die at its highest face · every die alike                                      |
| Dice seen    | in the open, or under cups until the show (reads only work under cups)                      |
| Who you play | each other, for the pot · the house, which pays N to 1, and ties push                       |

Normalising fixes the impossible, not the odd: push your luck without a bust face gets one
(a 1); first-to-N against the house becomes highest (there is no pot to race for).

## Decisions

16. **Migration 0076 rebuilds the four tavern tables** to widen the `kind` CHECK. The
    runner keeps foreign keys on and a `DROP TABLE` cascades, so the new tables are made
    first, rows copied, the old ones dropped children-first, and the new ones renamed
    (SQLite 3.53 rewrites the foreign-key references on rename).
17. **The house is a seat** with no character and no canon entry, or an NPC's. It's stored
    as `state.houseSeat`, seated last, and played by staff like any NPC seat.
18. **Every roll lands in Dice.** In the open, each roll is a quiet row and the game line
    announces it. Under cups, each roll is a hidden row (the roller and staff), and the
    final dice are written as table rows at the show, like the liar's dice lift.
19. **Read** (cups only): is that seat ahead of you right now? **Cheat**: on your turn,
    after a roll, set one of your dice to a face.

## The work: PR 7 (one commit on the same branch)

`lib/custom-dice.ts` + tests; `lib/tavern.ts` kind, rules, defaults, templates, lines;
0076 + schema; the server (open with a house, rounds, roll/reroll/stop, house payouts,
first-to points, read, cheat, view); the rules builder with templates; the play view.

## PR 7 progress (stopped mid-way, 2026-10-13)

- [x] `lib/tavern.ts`: the `custom-dice` kind, `CustomDiceRules`, defaults, `normalizeRules`
      (only the impossible is fixed), `customLines`, `DICE_TEMPLATES` (Pig, Beat the banker,
      Five alike, Under the cups, Under twenty-one, Sailor's straight), `customAdvice`.
- [x] Migration 0076 + `schema.ts` kind enums. Proved on a copy of the dev DB: row counts
      kept, foreign keys on the final names, `foreign_key_check` clean, indexes back.
- [x] `lib/custom-dice.ts` engine + tests (19) (bet pass, one-roll / hold / push turns, scoring
      with wilds, bust, instant win, each-other pot vs house payouts at odds, first-to points).
- [x] Server: open with a house seat (`state.houseSeat`, "The house" or an NPC), rounds,
      roll / reroll(hold) / stop moves, settle, read (cups only), cheat, view `custom`.
- [ ] UI: rules builder with templates and advice; house picker on the Open form; play view.
- [ ] Tests, naming rows ("Dice game", "the house"), gates, browser pass.
