# The session screen, at hand

Status: **Stage 1 done** · **Stage 2 done** · **Stage 3 done** · Stage 4 in progress
Branch base: `feat/new-world-map` @ `d285e8d` (8 commits ahead of `main`, unmerged world work)
Baseline: `npx tsc --noEmit -p .` exit 0 · `npm test` 27 files / 230 tests passed (2026-10-07)

Request (run with `--auto`): improve the DM and player screens for playing while in
session — clean, highly functional, everything a table needs to know or look up (stats,
NPCs, lore, rules), including rolls and being told about them.

## Diagnosis

The session screen (`/campaigns/[id]/screen`, `screen/DmScreen.tsx`) is already a
mature operating surface: 24 panels (`lib/screen.ts` `SCREEN_PANEL_KEYS`), presets,
arranging, a battle layout, announcements for every roll (`@shared/table`), whispers,
checks, timers. What is wrong is not missing boxes. It is four specific frictions.

1. **"Where do I look that up?"** (flow): a lookup mid-session is spread across six
   panels, none of which searches the others.
   - Rules: `screen/RulesPanel.tsx` (SRD rules reference + house rules).
   - Conditions: `screen/ConditionsCard.tsx`.
   - Monster: `screen/StatBlockPanel.tsx`, but only the _selected token's_ creature.
     A bestiary entry not yet in a fight cannot be read on the screen at all.
   - Spells: `screen/CastPanel.tsx`, only the viewer's _own prepared_ spells. A player
     asking "what does Hold Person do?" about a foe's spell leaves the screen.
   - Items: nowhere on the screen.
   - NPCs, places, quests, sessions, handouts, loot: `searchCampaign`
     (`src/server/search.ts`) answers all of these, role-filtered, but its only
     consumer is `CaptureBox.tsx` on the campaign page.
2. **A player cannot roll their own sheet** (UI): `session/RollPanel.tsx` takes typed
   notation and a typed label. Rolling Stealth means working out `+7`, typing `1d20+7`,
   typing "Stealth". The DM cannot trust it (the modifier is the client's), and the
   server already knows the answer: `bonusFor` in `src/server/checks.ts:473`
   (`skillBonus` / `savingThrow` + exhaustion) — used only when the DM _asks_ a check.
3. **The default screens draw Rolls twice** (bug): `defaultLayout(true)` in
   `lib/screen.ts` puts `'rolls'` in columns 2 and 3; the player's
   `defaultBattleLayout(false)` puts it in `right` and `rail`. `normalizeLayouts` returns
   the defaults uncleaned when no row is stored (`src/server/screen.ts:42`), so every DM
   who has never pressed Arrange gets two identical Rolls boxes.
4. **An NPC on the screen is a name** (UI): Here's "In the room"
   (`screen/HerePanel.tsx` ~line 282) lists name · attitude · role and nothing opens.
   The DM's notes, the voice, the stat block are in the Canon panel, found by scrolling.
5. **A roll slip does not say whether it worked** (data): `RollEvent`
   (`@shared/table/events.ts`) carries a total and no verdict. An attack roll's
   `outcome` (`lib/attack.ts` `RollOutcome.hit`) exists on the roll row, filtered for
   players by `outcomeForPlayer(…, rules.showHitMiss)`, but never reaches the slip, so
   the DM reads "Kestrel · Longsword · 17" and then looks for the goblin's AC.
6. **On a phone the screen is one long scroll** (UI): below `lg` the columns stack
   (`max-lg:!grid-cols-1 max-lg:overflow-y-auto`). A player at the table on a phone
   scrolls past Initiative and Rolls to reach their own hero, every turn.

## What already exists (reuse these)

| Need                                      | Existing                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Campaign-wide, role-filtered search       | `searchCampaign` `src/server/search.ts`, `searchCampaignAction` `campaign/search-actions.ts` |
| SRD + homebrew + campaign library by type | `listPickableContent(type, campaignId)` `src/server/content.ts:171`                          |
| Render any content entry                  | `StatBlock` `@shared/components/StatBlock`, `ReferenceBrowser`                               |
| SRD rules passages                        | `searchRules` `campaign/lib/rules-reference.ts:309`                                          |
| Conditions                                | `CONDITIONS` `campaign/lib/conditions.ts`                                                    |
| Server-side sheet modifiers               | `bonusFor` (private) `src/server/checks.ts:473`; `skillBonus`, `savingThrow`                 |
| Server roll + log + announcement          | `rollForCampaign` `src/server/session.ts` (~1755)                                            |
| Roll advice from conditions               | `rollAdvice` (used in `RollPanel.tsx`)                                                       |
| Tray draws server faces                   | `useDiceTray().showNotationRoll`                                                             |
| Panel chrome / status language            | `Panel`, `StatusMark`, `StatusChip` in `@shared/components/ui`                               |
| Who the viewer is seated as               | `LiveState.viewerCharacterId`, `LiveState.party`                                             |
| NPC depth (attitude, stat block)          | `NpcDepth.tsx`, `ATTITUDE_LABEL` `lib/standing`                                              |

## Recommendation (ranked)

1. **Look it up — one box over everything** (M). _If you only do this._ A search box in
   the screen's bar (`/` to focus) over the campaign (`searchCampaign`) and the books
   (spells, creatures, items, conditions, rules, house rules). A hit opens a _peek_
   beside the panels, not over them; a peek can be kept as a panel.
2. **Roll from your sheet** (M). _If you only do this._ In Your hero: abilities, saves,
   skills and initiative as one-tap rolls. The server reads the modifier (`bonusFor`,
   exported), rolls, logs, announces; advantage defaults from conditions.
3. **Fix the doubled Rolls box** (S). Defaults without duplicates; normalise defaults
   through the same cleaner.
4. **NPC peek** (S, given 1). A person in Here opens the same peek: party body, DM
   body, attitude, stat block with roll buttons.
5. **Verdict on the slip** (S). Attack slips say hit/miss/critical where
   `showHitMiss` lets the audience see it; check answers already carry pass/fail.
6. **One panel at a time on a phone** (M). Below `lg`, the screen shows one panel with
   a bar of panel marks along the bottom (badges included), instead of a stack.

## Open questions

None blocking. Phone layout scope and whether a kept lookup is stored are decided below.

## Decisions made without asking

- **Build all six.** The memory rule is "never cut scope on my own judgement"; the
  request is "anything they could possibly need", so nothing ranked is dropped.
- **Base on `feat/new-world-map`**, not `main`: the Here panel (item 4) only exists on
  that branch.
- **Branches:** this skill's per-PR local branches, stacked
  (`feat/session-screen-N-…`), nothing pushed. The user's standing preference is fewer
  branches; stacked local branches cost nothing and the tip carries everything.
- **Slug `session-screen`**: naming.md calls the page "the session screen".

## Design brief

- **The idea:** the session screen answers any question without leaving it — search the
  record and the books from the bar, roll your own sheet in one tap, and hear whether a
  roll worked — and on a phone it shows one panel at a time.
- **Artboards:**
  1. `Main` — the DM at the table, 3 columns; typing in the bar's search lists hits
     grouped _This campaign_ / _The books_; a hit opens beside the columns with _Keep it
     on the screen_. Interactive; palette tweak.
  2. `Fight` — the DM in a fight (battle layout), a person in Here opened beside the
     board (party body, DM body, attitude, stat block with rolls); two slips in the
     corner carrying hit / miss. Dark palette.
  3. `Player` — a player's screen, Your hero with _Roll from your sheet_ (abilities,
     saves, skills, initiative, advantage switch) and the tray's result slip.
  4. `Phone-hero` — player at 390px: one panel, the panel bar along the bottom with
     badges.
  5. `Phone-search` — the same phone with search open full-width over the panel.
  6. `Edges` — search before typing (what it covers, `/` to focus), nothing found, and
     the Lookups panel holding two kept entries.
  7. `Defaults` — the DM's first screen before/after the doubled Rolls fix.
- **Look:** repo tokens from `src/app/globals.css` (design-language.md § Tokens): light
  `--bg #faf6ef --surface #ffffff --surface-2 #f3ede1 --ink #2b2620 --ink-muted #6b6459
--ink-subtle #9a9184 --line #e4dccb --gold #b4894a --gold-strong #7a5c2e --arcane
#6b4d8a --success #3f7d55 --warning #b07d33 --danger #a23b34 --info #4a6076`; dark
  `#16130f #1e1a14 #262019 #ede7da #a89f8d #7a7060 #33291d #d9b061 #e8c988 #a988cf
#6bbf8a #d6a253 #d9756c #8aa4bd`. Fonts Inter (body), Fraunces (headings), Cinzel
  (panel titles, 0.59rem caps), Caveat (margin only). Panel chrome as `ui/Panel.tsx`;
  status marks as `ui/Status.tsx`. Glyphs drawn as 1.5-stroke line icons, no emoji.
- **Words:** naming.md throughout — session screen, Dice, Table log, Revealed, a check
  (the DM asking only), Here, Party notes, attitude, stat block, a place. New words, each
  getting a naming.md row: **Search** (the box, same verb as the campaign page's
  "Search the table's record"), **Lookups** (the panel of kept entries), **Keep it on
  the screen** (the verb), **Roll from your sheet** (the section; not "checks", which is
  the DM's ask).
- **Content:** invented — the campaign "The Salt Road", heroes Kestrel Vane, Brother
  Odo, Mirelle Ash; NPC Harrow Quill the ferryman; place Duskwater Crossing.

## Canvas

https://claude.ai/artifact/PvfJvPuDH5JRyWVZiUFQji (private; share it from the page's
Share menu before anyone else can open it)

| Artboard       | Shows                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Main`         | DM at the table: Search in the bar, hits grouped _This campaign_ / _The books_, the opened hit beside the columns, _Keep it on the screen_, the Lookups panel. Interactive.                                      |
| `Fight`        | DM in a fight (dark): Harrow Quill opened from Here beside the board — party body, DM notes hatched _only you_, attitude, stat block rolls, party notes; three slips with hit / miss / critical hit and "vs AC". |
| `Player`       | Player's Your hero with _Roll from your sheet_ (abilities, saves, 18 skills, initiative, disadvantage/straight/advantage defaulted by Poisoned); the tray result; Rolls waiting on an asked check. Interactive.  |
| `Phone-hero`   | 390px: one panel at a time, panel bar along the bottom with badges. Interactive.                                                                                                                                 |
| `Phone-search` | 390px dark: Search full width, hits, a creature opened below with _Keep it on the screen_.                                                                                                                       |
| `Edges`        | Search focused with nothing typed (recent + what it covers), nothing found, the Lookups panel with three kept entries.                                                                                           |
| `Defaults`     | The DM's first screen before (Rolls twice) and after (Here in the freed slot).                                                                                                                                   |

### Mockup copy that is NOT final

| Canvas says                                    | Build says / why                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| "●● expertise", "Stealth ●" double dot         | Nothing — the sheet models proficiency only (`sheet.skills[key]` is a boolean). One dot = proficient.                     |
| "Death save" button in Roll from your sheet    | Not built there: `PlayCard`'s `DeathSaveControl` already rolls it while dying.                                            |
| "Take damage" / "Heal" on the phone hero       | The real `PlayCard` controls, unchanged.                                                                                  |
| "Roll “vorpal goose” as dice?"                 | Offered only when the text parses as dice notation (`parseNotation`); the mockup shows it on words to show where it sits. |
| "Ghoul, drowned" homebrew in a player's search | Creatures from the campaign library are staff-only in Search (Decision 6).                                                |
| "Open in the World"                            | Same words, links to the World's Here at the person's place.                                                              |

## Context — the rules that bite here

- **design-language.md rule 9**: the session screen is an operating surface. State only
  in the six-state status language; every panel wears `Panel` chrome; nothing moves but
  the announcement slip (and the dice tray). The opened hit is a panel, not a modal.
- **Rule 4, the dice tray**: "If the server rolled a die and the viewer caused it, the
  tray draws the server's faces — `showNotationRoll`". Roll from your sheet rolls on the
  server and shows those faces.
- **Rule 8**: glyphs only. Lookups wears `magnifier` (unused by any panel today).
- **Rule 10**: a row of controls shares one size — `ControlRow` / `size="sm"` in panels.
- **naming.md**: "a check" is the DM asking somebody to roll. Rolls a player makes
  unasked are _not_ checks in copy — the section is "Roll from your sheet", buttons are
  the skill/ability names. "pin" is banned in copy (a mark's never-again).
- **src/db/README.md**: every writer a live view reads calls `bumpVersion` —
  `rollForCampaign` already does; reuse it rather than writing `campaign_rolls` again.
- **events.ts header**: an event payload must be safe for its audience. A foe's AC never
  reaches a player (`outcomeForPlayer` sets `ac: null`).
- **No migration needed.** Kept lookups ride in `campaign_screen_layouts.layout` (JSON),
  normalised by `normalizeLayouts`; that table is in `NEVER_CARRIED`
  (`src/server/library-campaign-package.ts:136`), so nothing new travels in a package.

## Decisions

1. **Search is one box in the bar, on every screen state, for staff and players**,
   because the friction is the same for both; `/` focuses it from anywhere not typing.
2. **The books are filtered in the browser; the record on the server.** The book index
   (names + one-line descriptor, ~1,100 rows) is fetched once per screen
   (`getBookIndexAction`); typing filters it instantly with no per-keystroke SRD read.
   The campaign record goes through `searchCampaignAction` (debounced 250 ms, ≥ 2 chars)
   because only the server knows what a viewer may read. SRD rules passages and
   conditions are already pure client modules.
3. **An opened hit is a panel beside the others, never over them** (rule 9 chrome; the
   table keeps running). Desktop: a 400px column at the right edge. Phone: it replaces
   the shown panel until closed.
4. **Kept lookups are stored with the screen layouts** (`ScreenLayouts.kept`, ≤ 12),
   not localStorage: a DM preps on a laptop and runs on a tablet. "Looked at tonight"
   (recent, ≤ 5) _is_ localStorage — a convenience, try/catch wrapped.
5. **Roll from your sheet rolls on the server** with the modifier the server reads off
   the sheet (`skillBonus` / `savingThrow` / `abilityModifier` + `d20PenaltyFor`), then
   hands the notation to `rollForCampaign` — so the log, the bump, the announcement and
   the physical-dice rule are the existing ones. The client sends a _kind and key_,
   never a bonus. Initiative from here only logs a roll; it never edits the order.
6. **What Search shows from the books:** SRD + the viewer's own shelf + adopted (same as
   `/spells`, `/bestiary`), plus the campaign library for spells, items and rules (in
   play is player knowledge). Campaign-library **creatures are staff-only**: a DM's
   homebrew monster is a spoiler.
7. **Verdicts travel structured.** `RollEvent.verdict` (`hit | miss | critical`, target,
   `ac`) replaces the " — hit" string glued onto the label in `fight.ts`. Staff always
   get it (with AC); players get it only when `rules.showHitMiss === 'everyone'`, never
   the AC. That needs a `'players'` audience in `live-hub.ts`: two publishes, staff and
   players, when the copies differ.
8. **Phone = below `lg` (1023px)**, the same breakpoint the screen already stacks at.
   One panel at a time; the bottom bar shows the first four panels of the current
   arrangement (battle on a virtual board: _Battle board_ first) and _More_ for the rest.
   Arranging is a desktop act; the phone follows the arrangement.
9. **The doubled Rolls box**: fix the defaults _and_ assert in a test that no default or
   preset repeats a panel, so the next edit can't reintroduce it.

## What already exists (reuse these) — verified

| Need                                                              | Existing (checked 2026-10-07)                                                                                                                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| Role-filtered campaign search                                     | `searchCampaign` `src/server/search.ts:41`; `searchCampaignAction` `src/@creator/campaign/search-actions.ts`                                                                      |
| Canon rows, role-filtered (dmBody/attitude/stat null for players) | `listCanon` `src/server/canon.ts:87`; `CanonEntryRow` `campaign/lib/canon.ts:183`                                                                                                 |
| Content a viewer may use                                          | `listPickableContent` `src/server/content.ts:171`; `listShelfContent` `:216`                                                                                                      |
| Render any `ContentEntry`                                         | `StatBlock` `src/@shared/components/StatBlock.tsx:605` (`entry`, `headless`, `showSource`)                                                                                        |
| Monster action prose → dice                                       | `rollsIn` (private) `screen/StatBlockPanel.tsx:41` — move to a pure lib                                                                                                           |
| Rules passages / conditions                                       | `searchRules`, `RULES_REFERENCE` `campaign/lib/rules-reference.ts:29,309`; `CONDITIONS` `campaign/lib/conditions.ts`                                                              |
| Sheet maths (client-safe)                                         | `abilityModifier`, `savingThrow`, `skillBonus`, `initiative` `character/lib/derive.ts:36–66`; `SKILL_KEYS`, `SKILL_ABILITY`, `SKILL_LABELS`, `ABILITY_KEYS` `character/schema.ts` |
| Exhaustion on d20 tests                                           | `d20PenaltyFor` `campaign/lib/condition-effects.ts:173`                                                                                                                           |
| Condition advice                                                  | `rollAdvice(conditions, 'check'                                                                                                                                                   | 'save' | 'attack', ability)` `condition-effects.ts:71` |
| Server roll → log → bump → announce                               | `rollForCampaign` `src/server/session.ts:1755`; `rollAction` `campaign/actions.ts:527`                                                                                            |
| Advantage notation                                                | `withAdvantage` `@shared/lib/dice.ts:334`                                                                                                                                         |
| Real dice entry                                                   | `FaceEntry` `@shared/components/dice/FaceEntry.tsx:18`                                                                                                                            |
| Play numbers per hero                                             | `toPlayState` `src/server/play.ts:351` (add `bonuses`)                                                                                                                            |
| Media query hook                                                  | local `useMediaQuery` `screen/BattleArrangement.tsx:65` — lift to `@shared/hooks`                                                                                                 |
| Panel chrome                                                      | `Panel` `@shared/components/ui/Panel.tsx`                                                                                                                                         |
| World address                                                     | `writeWorldRoute` `campaign/lib/world-route.ts:95`                                                                                                                                |
| Audience                                                          | `Audience`, `reaches` `src/server/live-hub.ts:41–55`                                                                                                                              |

## The work

Stacked local branches off `feat/new-world-map`; each leaves the app working.

### PR 1: The doubled Rolls box (needs: —) `feat/session-screen-1-defaults`

- `src/@creator/campaign/lib/screen.ts` `defaultLayout(true)`: `[['initiative','vitals'],['notebook','here'],['rolls','feed']]`.
  `defaultBattleLayout(false)`: `rail: ['timers']` (was `['rolls']`, already on the right).
  `SCREEN_PRESETS` combat, staff table: third column `['whispers','timers']`.
- `normalizeLayouts`: the no-row branch returns defaults run through the same
  cleaners, so a future duplicate in a default is dropped rather than drawn.
- New `src/@creator/campaign/lib/screen.test.ts`: for both roles, every default and
  every preset has no key twice within `table`, within `battleInPerson`, and across
  `battle.left/right/rail`; `normalizeLayouts(undefined, r)` likewise; players' layouts
  hold only `players: true` panels.
- Done means: tests pass; a DM with no stored layout sees one Rolls box.

### PR 2: Roll from your sheet (needs: PR 1) `feat/session-screen-2-sheet-rolls`

- New pure `src/@creator/campaign/lib/sheet-rolls.ts`: `SheetRoll = { kind: 'ability' | 'save' | 'skill' | 'initiative'; key }`,
  `isSheetRoll`, `sheetRollLabel` ("Stealth", "Dexterity save", "Strength", "Initiative"),
  `sheetRollBonus(sheet, roll)`, `sheetRollD20(roll)` → `'check' | 'save'` and the
  ability for `rollAdvice`, `sheetBonuses(sheet)` → `SheetBonuses`. Tests beside it.
- `src/server/play.ts` `PlayState.bonuses: SheetBonuses` filled in `toPlayState`.
- New `src/server/sheet-rolls.ts` `rollFromSheet(campaignId, characterId, roll, mode, faces?)`:
  validates `roll`; loads the character; the character must sit at this campaign
  (`characters.campaign_id`) — `NOT_AT_TABLE`; owner or staff (else
  `NOT_YOUR_CHARACTER`, the code `rollForCampaign` uses); bonus + exhaustion; notation
  via `withAdvantage`; delegates to `rollForCampaign`. Test
  `src/server/sheet-rolls.test.ts` (pattern: `canon.test.ts`): the modifier is the
  sheet's; exhaustion 2 takes 4 off; a player cannot roll another's hero; advantage
  writes `2d20kh1+N` and a dropped die.
- `rollFromSheetAction` in `src/@creator/campaign/actions.ts` beside `rollAction`.
- New `screen/SheetRolls.tsx`, mounted in `MyHeroPanel` under `PlayCard`: abilities
  (6), saves (6, proficient dotted), skills (18, three columns, two in a narrow panel),
  Initiative; disadvantage/straight/advantage defaulted per press by `rollAdvice`
  (shown as the advice line, like `RollPanel`); real dice through `FaceEntry` when
  `play.physicalDice`. The tray draws the server's faces (`showNotationRoll`).
- naming.md row: _Roll from your sheet_.
- Done means: unit + server tests; in the browser a player rolls Stealth, the tray shows
  the faces, the DM's Dice shows "Kestrel · Stealth · 17 · 1d20+7" and a slip.

### PR 3: Hit or miss on the slip (needs: PR 1) `feat/session-screen-3-verdict`

- `src/server/live-hub.ts`: `Audience` gains `'players'`; `reaches` returns true for
  non-staff only. Test in `src/server/live-hub.test.ts`.
- `src/@shared/table/events.ts` `RollEvent.verdict?: { result: 'hit' | 'miss' | 'critical'; target: string; ac: number | null }`;
  `describe` puts the word in the title and "vs AC n" in the detail; `critical` takes
  the success tone. Tests in `events.test.ts`.
- `src/server/fight.ts` (~line 830): drop the string verdict from `label`; publish the
  staff copy (verdict with AC) to `'staff'` and the player copy to `'players'` (verdict
  only when `showHitMiss === 'everyone'`, AC null). When `showHitMiss === 'everyone'`
  the two copies differ only in AC, so still two publishes.
- `src/server/casting.ts:548` spell attacks: same, if the cast carries a hit/miss.
- Done means: tests; in the browser the DM's slip reads "Kestrel Vane · Rapier → Ghoul 2 · 19 · hit / vs AC 12".

### PR 4: Search, the opened hit, and Lookups (needs: PR 1) `feat/session-screen-4-search`

- Pure `src/@creator/campaign/lib/lookup.ts`: `LookupRef` union
  (`{ kind: 'book'; ref: ContentRef }`, `{ kind: 'record'; record: SearchKind; id }`,
  `{ kind: 'condition'; key }`, `{ kind: 'rule'; section; key }`), `lookupKey`,
  `isLookupRef`, `BookHit`, `bookLine(entry)`, `matchBooks(index, q)` (prefix > word
  start > contains, ≤ 8), `matchRules(q)`, `matchConditions(q)`. Tests.
- New `src/server/lookup.ts`: `bookIndex(campaignId)` (Decision 6), `openBook(campaignId, ref)`
  (only refs `bookIndex` would list; null otherwise), `openRecord(campaignId, kind, id)`
  via `listCanon` / `listQuests` / `listSessions` / `getLiveState().handouts` /
  `getLedger` — the same readers `searchCampaign` uses, so it can only open what
  search could find. Test `src/server/lookup.test.ts`: a player cannot open a hidden
  canon entry, nor a library creature; staff can.
- `src/@creator/campaign/lookup-actions.ts`: `getBookIndexAction`, `openBookAction`, `openRecordAction`.
- `lib/screen.ts`: panel `lookups` (label **Lookups**, glyph `magnifier`, players true);
  `ScreenLayouts.kept: LookupRef[]` normalised (valid refs, unique, ≤ 12).
- UI: `screen/SearchBox.tsx` (bar, `/`, grouped list, ↑↓/Enter/Esc, recent, dice offer
  when the text parses as notation), `screen/LookupView.tsx` (body per kind; creature
  rolls for staff via the moved `rollsIn`, rolled like `StatBlockPanel`),
  `screen/LookupPeek.tsx` (Panel chrome, _Keep it on the screen_, Close),
  `screen/LookupsPanel.tsx`. `DmScreen` holds `opened: LookupRef | null` in
  `ScreenContext` (`openLookup`), draws the peek to the right of columns and of the
  battle arrangement.
- naming.md rows: _Search_ (the session screen's box — the record and the books),
  _Lookups_, _Keep it on the screen_.
- Done means: tests; browser: DM and player each search a spell, an NPC (player sees no
  DM notes), keep one, reload, it is still there.

### PR 5: A person opens (needs: PR 4) `feat/session-screen-5-person`

- `screen/LookupView.tsx` canon body (`CanonPeek`): kind + where ("Lives in …", "Inside …"),
  party body, DM body hatched _only you_ (staff), attitude (staff), `fields.role`,
  stat block name with its rolls (staff, `openBook(stat.ref)` when `available`),
  party notes, _Open in the World_ (`/campaigns/[id]#world/` + `writeWorldRoute({scope:'here', placeId, entryId})`).
- `screen/HerePanel.tsx` "In the room" rows and place rows become buttons calling
  `openLookup({ kind: 'record', record: 'canon', id })` (prop passed from `PanelContents`).
- Done means: in the browser Harrow Quill opens from Here for the DM (notes, attitude,
  rolls) and for a player (party body + notes only).

### PR 6: One panel at a time on a phone (needs: PR 4) `feat/session-screen-6-phone`

- Lift `useMediaQuery` to `src/@shared/hooks/useMediaQuery.ts`; `BattleArrangement`
  imports it.
- New `screen/PhoneScreen.tsx`: below `lg`, `DmScreen` renders it instead of the
  columns / `BattleArrangement`: the shown panel fills the body (`Panel` chrome); a
  bottom bar of panel buttons (glyph + label + badge, ≥ 44px), first four plus _More_
  (a HeroUI `Dropdown` with the rest); the shown tab per screen state remembered in
  localStorage. Battle on a virtual board: _Battle board_ is the first tab.
- `DmScreen` header on a phone: Search collapses to a 44px icon that opens it full
  width; Arrange controls hidden.
- The opened hit on a phone replaces the shown panel until closed.
- Done means: 390px browser pass as DM and player, both palettes.

## Ask the person

- None blocking. Defaults used: Search covers creatures for players from the SRD and
  their own shelf only (Decision 6); Initiative from the sheet only logs (Decision 5).

## Verification

```bash
npx tsc --noEmit -p .
npm run check
npm test
# build beside a running dev server, never over it:
NEXT_DIST_DIR=.next-verify npm run build && git checkout tsconfig.json && rm -rf .next-verify
```

Browser: copy the dev DB to the scratchpad (`sqlite3 data/hero-nexus.db ".backup <scratch>/verify.db"`),
`HERO_NEXUS_DB_PATH=<scratch>/verify.db npx next dev --turbopack --port 3105`, the user
signs in as DM (never touch passwords); the player view via headless Playwright with a
minted cookie for `pip.worldtest@test.local` at the "World test" campaign
(`c0ffee00-…-0001`). Per UI PR: DM + player, light + dark, 1440 and 390 wide.

## Traps

- **"check" is the DM's ask** in naming.md. The sheet section must not be called
  "Checks". **"pin" is banned in copy**: the verb is _Keep it on the screen_.
- **A HeroUI collection child must be the Item element itself** (Dropdown in _More_).
- **Client components import pure libs only.** `lookup.ts`, `sheet-rolls.ts` in
  `campaign/lib/` must not import `server-only` modules.
- **Two exports named `createNoteAction`** confuse the action-id scraper; new actions
  get unique names.
- **`npm run build` while `next dev` runs corrupts `.next`** — use `NEXT_DIST_DIR`.
- **`pkill -f next-server` kills the agent's shell** — `pgrep -f "^next-server"`, then kill pids.
- **A seeded sheet with the wrong `abilities` shape shows NaN** — seed with `makeEmptySheet()`.
- **`outcome.ac` must never reach a player**, in the live state _or_ an event.
- **Kept lookups are references, not copies** (content-model rule 1): a kept homebrew
  item shows the author's current text, and a deleted one says _Unavailable_.

## Out of scope

- Expertise (double proficiency): the sheet has no field for it; a builder change.
- Server-side recents: a per-device convenience; localStorage is the right home.
- Searching other campaigns or the Wandering Library: the screen runs one table.

## Progress

- [x] PR 1 The doubled Rolls box — `feat/session-screen-1-defaults`
- [x] PR 2 Roll from your sheet — `feat/session-screen-2-sheet-rolls` (browser pass batched with PR 6, see Notes)
- [x] PR 3 Hit or miss on the slip — `feat/session-screen-3-verdict`
- [ ] PR 4 Search, the opened hit, and Lookups
- [ ] PR 5 A person opens
- [ ] PR 6 One panel at a time on a phone
