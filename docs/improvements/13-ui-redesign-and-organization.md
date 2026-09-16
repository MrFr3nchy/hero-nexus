# 13 — UI redesign

**Status: built** (`feat/improvements-13-ui-redesign`). Departures: the five
structural items landed as five commits on one branch rather than five branches,
each verified on its own before the next started. Item 4 needed no migration —
`campaigns.settings` is a JSON column. Item 5's numbers are in
`13-live-state-cost.md` and say leave it alone. The visual pass followed on the same
branch: rule 9 in `docs/design-language.md`, `Status.tsx` and `Panel.tsx` in `ui/`,
`ModeBar.tsx` replacing `TableRibbon.tsx`, and the status language on the tracker
and asking rows. The wireframes in `docs/concepts/` cover only the panel chrome and
the six states; the three state screens and the in-person variant were built from
those primitives and the existing arrangements, not from a per-screen wireframe.

Five independent pieces of work on `MrFr3nchy/hero-nexus`, all structural, none
requiring any visual design to land first. They remove a duplicated play surface, turn
a layout editor into presets, add in-person play as a real table setting, delete the
app's only runtime CDN dependency, and measure the live layer before anyone optimises
it.

**These are five separate branches and five separate reviews.** Item 2 alone is a large
diff. Do not combine them. If you only do one, do item 2 — it deletes more code than
it adds and everything else gets easier afterwards.

A separate design effort is running in parallel on the visual language for these
surfaces (panel chrome, status colours, the mode bar's appearance). **Nothing in this
document is blocked on it, and nothing in this document should invent new visual
treatments.** Where a new component is needed here, build it with existing primitives
from `src/@shared/components/ui` and leave it plain. The styling pass lands later.

---

## Status

- No branch exists for any of this. Start clean from the default branch.
- Nothing here has been attempted and abandoned. It is all unstarted.
- `docs/improvements/01`–`12` exist and are good. **Item 5 below overlaps with
  `docs/improvements/12-screen-polish.md`, which already specifies a `ControlRow`
  primitive and a lint rule for mixed control heights.** That plan is sound; this
  document does not restate it. Treat 12 as the authority for control sizing.
- `docs/improvements/12` proposes a migration named `0060_campaign_audio.sql`. The
  highest migration currently in `src/db/migrations/` is `0055_token_vision.sql`, so
  the next free number is **0056**. If you write any migration, number it from what is
  actually on disk, not from what a doc predicted.

---

## Context you will not get from the code

**The three states are already real and already correct.** `src/@creator/campaign/lib/screen.ts`:

```ts
export type TableKind = 'desk' | 'table' | 'battle';
```

with the comment _"Derived, never stored."_ Between-sessions, in-session, and
in-a-fight are inferred from whether a sitting is open and whether an encounter is
active. **Do not add a column for this and do not let any of the work below turn it
into stored state.** The whole point is that a sitting and a fight already say which
state the table is in, so a stored column could only ever drift from them.

**The owner's stated intent**, which the code is currently only half-expressing:

1. Everything in the app should belong to exactly one of those three states.
2. A table playing around a _physical_ map should still get the tracker, the timer and
   the secret-reveal machinery — it just has no digital board.
3. The app will be hosted (a DigitalOcean droplet, SQLite), not self-hosted per user,
   despite the README and home page still saying self-hosted. That contradiction is not
   in scope here, but do not "fix" anything by leaning harder on the self-hosted
   framing.

**`CLAUDE.md` says the docs in `docs/` are binding and the code is wrong when they
disagree.** That is a real constraint, not boilerplate. `docs/design-language.md` has
eight rules; two of them (rule 2, counts are prose not tiles; rule 4, one animated
element per page) are a poor fit for combat surfaces. **That is a known problem and it
is being handled by the design effort, not by you.** If a change here would violate one
of the eight rules, stop and leave the existing treatment alone rather than amending
the doc yourself.

**`src/db/schema.ts` and `src/db/migrations/*.sql` are hand-written and edited in the
same change.** There is no drizzle-kit generate step in this repo. `CLAUDE.md` calls
this "the rule that gets broken most."

---

## The work

### 1. Delete the second icon system

**Smallest item, entirely self-contained, do it first to prove the build loop.**

`src/@shared/components/SideNavigation.tsx` line 4:

```ts
import { Icon } from '@iconify/react';
```

Verified: this import appears exactly once in that file. It renders Phosphor icons by
name — `'ph:house-bold'`, `'ph:castle-turret-bold'`, `'ph:sword-bold'`,
`'ph:shield-bold'`, `'ph:tree-bold'`, `'ph:scroll-bold'`, `'ph:star-bold'`,
`'ph:magic-wand-bold'`, `'ph:treasure-chest-bold'`, `'ph:paw-print-bold'`,
`'ph:gavel-bold'`, `'ph:books-bold'`, `'ph:user-bold'`, `'ph:sign-out-bold'`,
`'ph:caret-right-bold'`, `'ph:caret-left-bold'`.

`package.json` has `"@iconify/react": "^6.0.0"` and **no** `@iconify/json` offline
bundle, which means those icons are fetched from the Iconify API over the network at
render time.

`docs/design-language.md` rule 8, verbatim: _"an icon fetched from a CDN at runtime.
Hero Nexus is self-hosted and makes no outbound calls; a CDN icon is blank on a box
without internet."_ And `CLAUDE.md`: _"no external services, no outbound calls at
runtime."_

So the sidebar — the first thing every signed-in user sees — breaks the app's own rule
and goes blank at a table with bad wifi.

**The work:**

1. `rg '@iconify' src/` first. I verified `SideNavigation.tsx`. I checked
   `src/@shared/components/Navigation.tsx` and it does **not** use Iconify — it is
   HeroUI `Navbar` with text links only. I could not run a repo-wide grep from my
   environment, so **do not assume SideNavigation is the only file.** Fix whatever the
   grep returns.
2. For each Phosphor icon above, either map it to an existing name in
   `src/@shared/components/ui/Glyph.tsx` or add a new glyph to that set. Read the
   existing glyphs first — several of these almost certainly already exist, since
   `SCREEN_PANELS` in `lib/screen.ts` already references glyph names including
   `sword`, `shield`, `scroll`, `map`, `die`, `person`, `gavel`, `tome`, `quill`,
   `notebook`, `coins`, `hourglass`, `candle`, `letter`, `sparkle`, `dragon`,
   `whisper`, `target`, `tankard`, `orb`, `question`, `compass`, `plus`, `x`,
   `chevron-up`, `chevron-down`.
3. New glyphs follow rule 8: 24×24 box, 1.5 stroke, `currentColor`, **drawn to read at
   16px**. Iconic, not illustrative.
4. Replace the `<Icon icon={item.icon} width={17} />` calls with `<Glyph name={...} size={17} />`.
   Note `NavItem.icon` is typed `string`; retype it to `GlyphName`, which `Glyph.tsx`
   exports (it is re-exported from `ui`, as `lib/screen.ts` imports it from
   `@/@shared/components/ui/Glyph`).
5. Remove `@iconify/react` from `package.json` dependencies. `npm install` to update
   the lockfile.

**Done means:** `rg '@iconify' .` returns nothing outside `package-lock.json` history,
`npm run check` and `npm run build` pass, and the sidebar renders every icon with
DevTools set to offline.

---

### 2. Collapse the two play surfaces into one

**The main event. Largest diff, largest payoff, net deletion.**

Today the at-the-table surface exists three times over the same components and the same
`LiveState`:

| Shell       | File                                                        | What it is                                           |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Screen      | `src/@creator/campaign/components/screen/DmScreen.tsx`      | 24 arrangeable panels, three layouts per `TableKind` |
| Session tab | `src/@creator/campaign/components/session/SessionPanel.tsx` | A `space-y-5` stack of 10 of the same panels         |
| Board tab   | `src/@creator/campaign/components/session/BoardTab.tsx`     | `BattleBoard` + `InitiativeTracker`, nothing else    |

`SessionPanel` renders `SittingCard`, `SpotlightPanel`, `PartyPlayPanel`,
`InitiativeTracker`, `BattleBoard`, `TimerPanel`, `ChecksPanel`, `RollPanel`,
`HandoutsPanel` and `EncounterPlanner`. `DmScreen`'s `Panel` switch renders every one
of those except `EncounterPlanner`, plus fourteen more. `BoardTab` renders two of them
a third time.

They are not skins of each other — they are three hand-maintained arrangements, each
with its own mount of `useCampaignLive`. `CampaignDetail.tsx` contains a comment
apologising for it: _"The Session tab keeps a copy, for a table that wants everything
in one column."_ That is a good reason for a **layout preset** (item 3). It is an
expensive reason for a second component tree.

**The work:**

1. `/campaigns/[id]/screen` becomes the only play surface. `DmScreen.tsx` stays and is
   the thing everything else routes into.
2. Delete `SessionPanel.tsx` and `BoardTab.tsx`.
3. In `CampaignDetail.tsx`, remove the `'table'` and `'board'` entries from the `all`
   tab array and their imports. Replace them with links into `/campaigns/[id]/screen`.
   The page already has such a button in `PageHeader actions`:

   ```tsx
   <Button as={Link} href={`/campaigns/${campaign.id}/screen`} ...>
     {isStaff ? 'Behind the screen' : 'Take your seat'}
   </Button>
   ```

   Keep that. It is well-labelled and the comment above it explains why the player copy
   differs — read that comment before touching the strings.

4. `EncounterPlanner` is the one thing `SessionPanel` renders that `DmScreen` does not.
   It is prep, not play. Move it onto the Chronicle tab or add an `'encounters'` entry
   to `SCREEN_PANEL_KEYS` / `SCREEN_PANELS` with `players: false`. **Do not silently
   drop it.**
5. `CampaignDetail.tsx` then has nine tabs: `party`, `quests`, `chronicle`, `notes`,
   `journal`, `canon`, `downtime`, `content`, `homebrew`. That is still too many, but
   consolidating them is an information-architecture decision the design effort is
   working on. **Leave the nine alone in this branch.** Removing two duplicated play
   surfaces is the whole scope.

**Two small fixes to make in the same file while you are in it:**

- **Glyph collision.** `CampaignDetail.tsx` uses `glyph="quill"` for both the Notes tab
  and the Journal tab. **This string appears twice in the file — assert that before
  replacing, and match on the surrounding `label` to pick the right one.** `screen.ts`
  carries a comment stating the principle being broken: _"two boxes wearing one mark is
  the failure the glyph set exists to prevent."_ Give Journal its own glyph (Notes is
  the DM's prep notebook; Journal is a player's in-character log — `notebook` is taken
  by the Chronicle tab, so this likely needs a new glyph, drawn per item 1's rules).
- **Stop reordering the tabs.** `LEADING_TAB` moves one tab to the front of the strip
  depending on `TableKind`:

  ```ts
  const LEADING_TAB: Record<TableKind, string> = {
    desk: 'chronicle',
    table: 'table',
    battle: 'board',
  };
  ```

  Once `'table'` and `'board'` are gone this is nearly dead anyway. Keep
  `defaultSelectedKey` — opening on the right tab is good. **Drop the reordering** —
  the two `all.filter(...)` calls that build `tabs`. A tab that is first on Tuesday and
  fourth on Friday costs muscle memory, which is the main thing a four-hour tool has.

**Done means:** no component is rendered by two shells, `rg 'SessionPanel|BoardTab' src/`
returns nothing, both routes still work for a DM and a player, `npm run build` passes.

---

### 3. Replace Arrange mode with presets

`DmScreen.tsx` currently ships a layout editor: drag-and-drop across columns, a
column-count `Select` (`SCREEN_COLUMN_COUNTS = [2, 3, 4]`), an "Add a box" `Select`, a
swap dropdown per `ScreenBox`, a remove control, a dirty flag and a "Save the screen"
button. `BattleArrangement.tsx` has a parallel set for the shelf.

The defaults it falls back to are good and were clearly thought about — read the
docstrings on `defaultLayout`, `defaultDeskLayout` and `defaultBattleLayout` in
`lib/screen.ts` before changing anything; they explain why a player opens on their own
hero rather than party HP, and why the battle shelf is three panels and not six.

The problem is that a DM mid-session is handed a canvas when what they want is a
choice.

**The work — and note this needs no schema change at all:**

A preset is just a named `ScreenLayouts` value. `src/server/screen.ts` `saveScreen()`
takes `unknown`, runs it through `normalizeLayouts`, and stores the blob. So:

1. In `lib/screen.ts`, add:

   ```ts
   export interface ScreenPreset {
     key: string;
     label: string;
     line: string;                                    // one line, like TABLE_META
     layouts: (isStaff: boolean) => ScreenLayouts;
   }
   export const SCREEN_PRESETS: readonly ScreenPreset[] = [ ... ];
   ```

   Keep it pure — no React, no server, no db. That file's docstring is explicit about
   why, and `screen.ts` is imported by both the server (`src/server/screen.ts`) and the
   client.

2. Four presets is probably right: something like a combat-forward one, a
   roleplay-forward one, an in-person one (see item 4), and "everything", plus whatever
   `defaultLayouts` already produces as the starting point.
3. Surface the preset picker where `Arrange` currently is in `DmScreen`'s header.
   Picking one calls the existing `save()` with the preset's layouts.
4. **Keep arranging.** Demote it to a secondary control — inside a popover, behind a
   "Customise" affordance, whatever is least disruptive. Do not delete the drag code;
   `movePanel`, `withoutPanel` and `dropIndexIn` are correct and the comment on
   `movePanel` documents an off-by-one that was already fixed once.
5. Applying a preset overwrites a hand-made arrangement. That needs a confirm. There is
   already `useConfirm` in `@/@shared/components/ui` — `TableRibbon.tsx` uses it. Use
   that, not `confirm()`; `docs/design-language.md` bans native `confirm()`/`alert()`.

**Done means:** a DM can get a sensible three-state arrangement in one press, arranging
by hand still works, and `normalizeLayouts` still round-trips every preset unchanged
(worth an assertion — see Verification).

---

### 4. In-person play as a real table setting

There is currently no such thing. I searched for `offline`, `in person` and `inPerson`
and found nothing. `BattleArrangement.tsx` gives the battle state a mandatory board
region at `flex-1` with the shelf beside it at `lg:w-[22rem]`; `SessionPanel` rendered
`BattleBoard` whenever `isStaff || state.battlemap`.

So a table playing around a physical map gets a board region holding either nothing or
a map nobody is looking at, while the things they actually need — initiative, HP,
conditions, the timer, secret reveals — are squeezed into a 22rem column.

**Where the setting goes — and why this is cheaper than it looks:**

`src/@creator/campaign/lib/table-rules.ts` is a registry. Its docstring: _"`TABLE_RULE_FIELDS`
is the registry — the manage form, the fight popover and 'Rules at hand' all render
from it, so a new rule is one entry here and nothing else has to learn its name."_
`mergeTableRules(raw)` folds a stored, possibly-partial, possibly-garbage blob over
`DEFAULT_TABLE_RULES` one field at a time, so a row written before a field existed
still reads as a whole table.

That means adding a field is: one entry in `TableRules`, one in `DEFAULT_TABLE_RULES`,
one `choiceField` in `TABLE_RULE_FIELDS`, and the manage form picks it up for free.

```ts
// in TableRules
/** Whether the fight is run on the app's board or a real one on a real table. */
board: 'virtual' | 'in-person';

// in DEFAULT_TABLE_RULES
board: 'virtual',
```

`TABLE_RULE_GROUPS` has `'combat' | 'rests' | 'survival' | 'dice' | 'seen'`. None fits
well — this is a fact about the room, not a rule. Add a sixth group (something like
`room`) rather than forcing it into `combat`. **Do not set `perFight: true`** — the
physical table does not change mid-fight.

> **Unverified.** This assumes `campaigns.settings` is a JSON blob column, which is
> strongly implied — `CampaignDetail.tsx` reads `campaign.settings.table`,
> `.rules`, `.allowHomebrew`, `.customRules`, `.sessionNotes`, `.bannerImageId`, and
> `mergeTableRules` is written to tolerate arbitrary stored shapes. **I did not open
> `src/db/schema.ts` (90 KB) to confirm it.** Check the `campaigns` table definition
> before concluding no migration is needed. If `settings` is a JSON column, this is a
> zero-migration change. If it is not, the next free migration number is `0056`, and
> per `CLAUDE.md` `schema.ts` and the `.sql` file are edited in the same commit.

**Then wire it:**

1. `LiveState` already carries `rules` (`DmScreen` passes `state.rules` to
   `RulesPanel`, and `TableRibbon` reads `state.rules.mode`), so the client can read
   `state.rules.board` with no new plumbing.
2. In `DmScreen.tsx`, the battle branch is:

   ```tsx
   {current === 'battle' && live.state ? (
     <BattleArrangement ... />
   ) : ( /* the column grid */ )}
   ```

   When `board === 'in-person'`, render the **column-grid** branch against
   `layouts.battle` — but note `layouts.battle` is a `BattleLayout` (`{ shelf, shelfOpen,
folded, shelfSide }`), not a `ScreenLayout` (`{ columns }`). They are different
   shapes. Options, in order of preference:
   - Add a fourth arrangement to `ScreenLayouts` (e.g. `battleInPerson: ScreenLayout`)
     and handle it in `defaultLayouts` and `normalizeLayouts`. This is the honest
     version and `normalizeLayouts` is already written to tolerate missing keys.
   - Or reuse `layouts.table` for in-person battle. Cheaper, but it means a DM's
     in-session and in-fight screens cannot differ, which defeats the point.

   Take the first. `normalizeLayouts` has an explicit branch for reading older stored
   shapes and a comment explaining the migration strategy — follow that pattern.

3. Defaults for the in-person battle arrangement: `initiative` and `vitals` leading,
   with `timers`, `checks` and `reveals`. Explicitly **not** `board`.
4. `'board'` is in `SCREEN_PANEL_KEYS`. In in-person mode it should not be offerable.
   `DmScreen` already computes `allowed` by filtering on
   `isStaff || SCREEN_PANELS[key].players`; add the board filter there and in
   `BattleArrangement`'s `allowed` (which already excludes `'board'` for its own
   reasons — read that line before editing it).

**Do not** design what the in-person battle screen looks like. Get the setting stored,
readable and driving which arrangement renders. Typography and scale for
read-from-across-the-room are part of the design effort.

**Done means:** a DM can set the table to in-person on the manage page, the battle
state renders without a board region, `'board'` cannot be added to a panel arrangement
at that table, and an existing campaign with no stored value reads as `'virtual'`.

---

### 5. Measure the live layer. Do not optimise it yet.

`src/@shared/hooks/useCampaignLive.ts`. An SSE frame carries a version number and
nothing else:

> _"The stream tells this hook that something changed and never what — the frame
> carries a version number and nothing else — so the answer still comes back through
> `getLiveState`, which is role-filtered."_

That is a deliberate and good decision: **one place decides what a player may see.**
Adding delta frames would add a second, which is exactly the failure mode the design
avoids. Do not undo it casually.

But every nudge triggers a full `getLiveStateAction(campaignId)`, and `LiveState`
carries at minimum `party`, `entries`, `effects`, `checks`, `whispers`, `encounter`,
`sitting`, `spotlight`, `battlemap`, `rules`, `table` and `viewerCharacterId` — inferred
from its use across `DmScreen.tsx`, not from reading `src/server/session.ts` (45 KB,
which I did not open). So one token drag re-reads the whole table for every connected
browser.

```ts
const FLOOR_MS = 30_000; // while the stream is up
const FALLBACK_MS = 3_000; // stream down
```

**I have not measured this and it may be completely fine.** SQLite reads are fast and
a table is six people. This is the most plausible source of board lag during a fight
and it is also the easiest thing in the codebase to break.

**The work is measurement, not change:**

1. Instrument `getLiveState` with a duration log and a serialised payload size.
2. Seed a campaign with eight combatants, an active encounter with effects on most of
   them, a populated whisper log and a battle map with tokens.
3. Open six browser contexts. Drag a token. Record: how many `getLiveState` calls fire,
   total wall time, total bytes.
4. Write the numbers into a new `docs/improvements/13-live-state-cost.md` with a
   recommendation. If p95 is comfortably under a frame budget, the recommendation is
   "leave it alone," and that is a successful outcome for this item.
5. Only if the numbers are bad: the cheapest safe fix is to keep one
   `getLiveState` but let the frame name a _scope_ (`'board' | 'party' | 'all'`) so the
   server can skip assembling sections nobody asked for — still one authority, still
   role-filtered, just less work per call. Propose it in the doc; do not build it in
   this branch.

---

## Decisions already made, with reasoning

| Decision                                                 | Why                                                                                                                           | Disagree if                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `TableKind` stays derived, never stored                  | A sitting and an active fight already determine it; a column can only drift                                                   | You find a state that genuinely cannot be derived                                                    |
| The screen route wins, the tabs lose                     | `DmScreen` handles all three states and both roles and has the panel registry; `SessionPanel` handles one state in one column | Never — the reverse means reimplementing three-state support                                         |
| Presets, not the deletion of arranging                   | Arranging is correct code solving the wrong-priority problem; the default should be a choice, customisation the escape hatch  | You find telemetry showing DMs actually arrange                                                      |
| In-person is a campaign setting, not a viewer preference | It describes the physical room. Every seat at a table with a real map is at a table with a real map                           | Never                                                                                                |
| Delta frames are not the fix for item 5                  | One role-filtering authority is the point of the current design                                                               | The measurement shows full reads are genuinely the bottleneck, and even then propose before building |
| Nine remaining tabs are left alone in item 2             | Consolidating them is an IA decision the design effort owns                                                                   | Never in this branch                                                                                 |

---

## Verification

Both of these must pass on every branch. From `CLAUDE.md`: **`npm run check` does not
run `tsc`. `npm run build` is the only typecheck.**

```bash
npm run check    # eslint + prettier; clean when it reports nothing
npm run build    # the actual typecheck
```

For item 4, if it turns out to need a migration:

```bash
npm run db:migrate
npm run db:reset   # rm -f data/hero-nexus.db* && migrate && seed
```

**I have not run any of these.** They are read from `package.json` `scripts`, which is
verified; whether they currently pass on the default branch is not.

`CLAUDE.md` is explicit that a typecheck is not verification here:

> _"Anything rendered is looked at in a browser, in both palettes. A typecheck cannot
> tell you that an equipped shield resolved to the shield spell and quietly cost the
> character 2 AC."_

So per item:

- **Item 1** — sidebar renders every icon with the network throttled to offline, in
  light and dark.
- **Item 2** — real DM account and real player account, at a campaign with an open
  sitting and an active encounter. Both routes, both roles. Check that an action taken
  on the screen (tick a quest, apply damage) is reflected on the campaign page, since
  they share server functions.
- **Item 3** — apply every preset, reload, assert the stored layout round-trips through
  `normalizeLayouts` unchanged. A preset that normalises to something different from
  itself is a silent bug that only shows up on the second page load. Assert this
  directly against the pure module, apart from the app, the way `CLAUDE.md` describes
  for rules modules.
- **Item 4** — an existing campaign with no stored `board` value reads `'virtual'`.
  A campaign set to `'in-person'` renders no board region and cannot add the board
  panel. Both palettes.
- **Item 5** — the numbers are the deliverable.

---

## Traps

1. **`normalizeLayouts` and `normalizeLayout` are load-bearing and subtle.** They read
   two historical stored shapes (`{ columns }` and the older `{ main, rail }`), drop
   panels a demoted co-DM may no longer see, and deduplicate in a single pass. There is
   a comment explaining that chained `.filter()` calls let the same panel through twice
   because each filter runs to completion before the next starts. Do not refactor these
   into something tidier.

2. **`movePanel` takes its index against the post-removal array** so dragging a box
   downwards inside its own column lands where the indicator said. There is a comment.
   It was wrong once.

3. **`setColumnCount` moves orphaned panels to the last column** rather than dropping
   them, on purpose — narrowing the screen should not silently delete something a user
   arranged. Preserve that when you touch arrange mode.

4. **`BattleLayout` and `ScreenLayout` are different shapes.** `ScreenLayouts.battle`
   is `{ shelf, shelfOpen, folded, shelfSide }`; `.desk` and `.table` are
   `{ columns }`. `DmScreen` has a line that quietly relies on this:

   ```ts
   const layout: ScreenLayout =
     current === 'battle' ? layouts.table : layouts[current];
   ```

   It falls back to the _table_ arrangement when in the battle state, because the
   battle state uses `BattleArrangement` instead. Item 4 will trip over this.

5. **`.screen-box-body` in `globals.css` strips chrome by selector.** It zeroes
   `[data-card]` borders and backgrounds, `display: none`s `[data-card-title]` and
   `[data-empty-scene]`, and hides `[data-card-head]` when it has no
   `[data-card-actions]`. **Any component you render inside a screen box inherits
   this.** A new panel that looks fine on a tab may lose its heading entirely on the
   screen. The fix for this is part of the design effort — for now, just know it
   happens and check new panels in both shells. `.shelf-dense` adds a second layer of
   the same on top.

6. **Panels must not each mount their own poller.** `DmScreen`'s `Panel` reads
   `ctx.live` and there is a comment spelling out why: _"Mounting three panels that
   each poll would be three requests every three seconds for one answer."_ Deleting
   `SessionPanel` and `BoardTab` removes two extra mounts of `useCampaignLive`; do not
   reintroduce one.

7. **`RevealTimeline` needs a manual reload nudge.** Both `DmScreen` (`revealSeq` /
   `bumpReveals`) and `CampaignDetail` (`revealSeq`) pass a `reloadKey` so the timeline
   re-reads when the notebook reveals a line. It is not on the live stream. If you move
   either component, carry the nudge.

8. **`state.table` vs `layouts.pin` vs `current` are three different things.**
   `state.table` is where the campaign actually is. `layouts.pin` is a viewer holding
   their own screen somewhere else. `current` is the resolved answer
   (`layouts.pin ?? live.state?.table ?? 'table'`). Server-side logic reads the first;
   rendering reads the third. Mixing them up produces a DM whose screen says one thing
   and whose buttons do another.

9. **`TableRibbon` disables the rules toggle when a fight overrides the mode**
   (`fightHoldsMode`) and points the user at the initiative box instead. If any of this
   work moves the rules toggle, that interaction has to move with it or the control
   becomes a dead button during every fight.

10. **`@iconify/react` may be in more files than I could verify.** I could not run a
    repo-wide search. Grep first.

---

## Out of scope

Say no to these if you find yourself drifting into them.

- **Any new visual treatment.** Panel chrome, status colours, the mode bar's
  appearance, HP track design, condition chips, turn indicators. All of it belongs to
  the parallel design effort. Build plain with existing primitives.
- **Amending `docs/design-language.md`.** Its rules 2 and 4 fit play surfaces poorly.
  That is known and owned elsewhere.
- **Consolidating the nine remaining campaign tabs.** Item 2 removes two; the rest is
  an IA decision that needs the design work first.
- **Control heights and the `ControlRow` primitive.** Already specced in
  `docs/improvements/12-screen-polish.md`.
- **Splitting `BattleBoard.tsx` (114 KB) or `BattleMap3D.tsx` (68 KB).** Both are
  almost certainly overdue for it, and both are far too load-bearing to touch in a
  branch about layout. Separate effort, separate review, done deliberately.
- **The self-hosted/hosted contradiction in the README and home page.**
- **Ambient audio**, proposed in `docs/improvements/12`.

---

## Confidence

**Verified — I read the file on the default branch:** every path, type name, exported
symbol, constant and quoted comment in this document. `SCREEN_PANEL_KEYS` has 24
entries. `SCREEN_COLUMN_COUNTS` is `[2, 3, 4]`. `FLOOR_MS` is `30_000` and
`FALLBACK_MS` is `3_000`. The highest migration is `0055_token_vision.sql`.
`package.json` has `@iconify/react` and no `@iconify/json`. `Navigation.tsx` does not
use Iconify. `TABLE_RULE_FIELDS` is a registry that the manage form renders from.

**Reasoned but untested:** that `campaigns.settings` is a JSON column and item 4 needs
no migration. That `LiveState` contains the fields listed in item 5 — that comes from
reading its _use_ in `DmScreen.tsx`, not from `src/server/session.ts`. That the preset
layouts in item 3 round-trip through `normalizeLayouts` — plausible from reading the
normaliser, worth asserting rather than assuming.

**Genuinely unknown:** whether the full-`LiveState` refetch is actually a performance
problem. Whether `@iconify/react` appears anywhere besides `SideNavigation.tsx`.
Whether `npm run check` and `npm run build` currently pass on the default branch — run
both before starting so you know which failures you caused.

**Not read at all:** `BattleBoard.tsx`, `BattleMap3D.tsx`, `src/server/battlemap.ts`,
`src/server/play.ts`, `src/server/session.ts`, `src/db/schema.ts`, every individual
panel component, `docs/content-model.md`, `docs/sharing-model.md`, and
`docs/improvements/01`–`11`. If something in this document contradicts one of those,
the file wins.

## Then: the visual pass

The wireframes for this work are at docs/concepts/Hero Nexus - Panel chrome.html.

Do the five structural items above FIRST, in separate branches, and merge them
before starting this. The wireframes assume a single play surface and a preset
picker. Applying them to the current duplicated shells means doing the visual
work twice and throwing one copy away.

### What the wireframes are authority for

Layout, information hierarchy, what leads each screen, panel anatomy, and the
status language (live / stale / yours / waiting-on-you / hidden-from-players /
homebrew).

### What they are NOT authority for

- Colour and type. src/app/globals.css is. Every colour must resolve to an
  existing token. If a wireframe shows a colour with no token behind it, either
  map it to the nearest token or stop and ask — do not add a token.
- Features. The wireframes rearrange what exists. If one implies a panel, a
  server action, or a piece of state that isn't in SCREEN_PANELS or LiveState
  today, that's a scoping question, not a build instruction. List them and stop.
- Copy. The in-world voice is deliberate and already written — "Nothing is
  trying to kill you", "The table rises?", "Take your seats". Keep the existing
  strings unless a wireframe's label is clearer, and never make a string
  load-bearing in the handwritten face.

### The flow is non-negotiable

Three states, derived from a sitting being open and an encounter being active:
The Desk (between sessions) → The Table (in session, no fight) → The Sand Table
(fight running), with in-person as a variant of the third. Every screen belongs
to exactly one state. If the wireframes and this disagree, this wins and you
should flag the conflict rather than silently resolving it.

### Where the design-language rules and the wireframes conflict

docs/design-language.md rule 2 (counts are prose, not tiles) and rule 4 (one
animated element per page, and a panel never reacts to an arriving event) were
written for the marketing and dashboard pages. The wireframes deliberately break
both on the play surfaces, because a combat tracker needs dense numeric readouts
and "it is your turn" has to announce itself.

That conflict is real and CLAUDE.md says the docs win. So: add a ninth rule to
docs/design-language.md scoping rules 2 and 4 to reading surfaces and stating
what governs operating surfaces instead — phrased so a reviewer can point at a
diff and say it's violated, like the other eight. Do this in its own commit,
FIRST, before any component changes. Do not just violate them quietly.

### Order

1. The design-language amendment (above).
2. The status-language primitives, in src/@shared/components/ui/, built and
   verified in isolation in both palettes before anything consumes them.
3. The panel container. When it lands, DELETE the .screen-box-body and
   .shelf-dense blocks from src/app/globals.css. Those exist only because the
   panels had no native dense mode — that's the whole point of this step. Check
   every panel afterwards: those selectors were display:none-ing card titles and
   empty-state scenes, so some panels will suddenly grow a heading back.
4. The mode bar, replacing TableRibbon.tsx. Same four server actions, no
   server-side change.
5. The three state screens, then the in-person variant.

### Verification

Per CLAUDE.md, npm run build is the only typecheck and rendered work is looked
at in a browser. For every screen: light palette, dark palette, and
prefers-reduced-motion: reduce. DM account and player account — the role
filtering is real and a player seeing a hidden quest objective is the worst bug
this app can have. 390px phone for The Table, and landscape phone for The Sand
Table, which BattleArrangement.tsx already special-cases at
(orientation: landscape) and (max-height: 500px).
