# Hero Nexus design language — "Show the artifact"

This is the reference every page is built against. If a page and this doc disagree, the
page is wrong. Agents working on this repo follow it without being reminded.

The app is already competently themed: Fraunces + Cinzel + Inter + Caveat, a warm
parchment/candlelight token pair, a grain overlay, and a set of characterful primitives
(`Fleuron`, `Seal`, `Ribbon`, `DeckledEdge`, `Dice3DRoller`). That part is good and is
not what this document changes.

What it governs is the **layout, information design, and voice on top of the theme** —
the part that used to read as generic SaaS: every route opened with the same eyebrow →
serif h1 → muted lede → fleuron rule, the home page was a centered column ending in
three identical icon cards, and the dashboard led with four stat tiles that read
`0 / 0 / 0 / 0` for a new account. No page showed the product.

The two reference implementations are **`src/app/page.tsx`** (home) and
**`src/app/dashboard/page.tsx`** (dashboard), built from the concept in
`docs/concepts/hero-nexus-dashboard-concept.html`. Read those three before building a
new page.

---

## The principle

**Show the artifact.** Every page leads with the thing itself — a character sheet, a
spell block, a stack of party cards, a review queue — not a description of the thing.

Eight rules, each phrased so a reviewer can point at a diff and say it's violated.

### 1. The object is the hero

Every page leads with the thing itself, not prose about it. If the page's most
prominent element is a paragraph describing a feature, the page is wrong.

- **Do** — home hero: `SheetPreview` on the right, a real (fixture) character with a
  roll control that recomputes its modifiers. Dashboard: the party of `HeroCard`s is
  the first thing under the greeting.
- **Don't** — home hero: a centered `h1` + lede + two buttons, product nowhere on
  screen.

### 2. Counts are prose, not furniture

A number that isn't the point of the page is set as a sentence, not a tile. Use
`Ledger`.

- **Do** — dashboard: `3 heroes / 2 campaigns / 11 homebrew / 1 table you run` on one
  line under the greeting.
- **Don't** — dashboard: `grid-cols-2 sm:grid-cols-4` of `Stat` tiles. Four empty
  tiles read as a broken app; one empty ledger line reads as a quiet fact.

### 3. Asymmetry over grids

Three-across identical cards is banned as a default. Pair each claim with a working
fragment of the product in alternating rows. Grids are for genuinely homogeneous
collections — a spell list, a character roster — not for three feature blurbs.

- **Do** — home: alternating pitch rows, copy on one side, a live fragment
  (`SheetPreview`, a `Seal`'d review row) on the other. Dashboard: main column +
  narrower rail, not two equal halves.
- **Don't** — `<div className="grid gap-5 md:grid-cols-3">` of three `SectionCard`s
  with an icon and a paragraph each.

### 4. One toy per page, and it must demo the product

Exactly one interactive or animated moment per page. Everything else holds still.

- **Do** — home: the d20 that rolls a new fixture hero into the sheet and recomputes
  the ability modifiers. Dashboard: the d20 in the header that tumbles and lands on a
  number with a scrawled verdict.
- **Don't** — every `SectionCard` fading and rising on scroll via `LiftCard`'s
  `whileInView`. That is the thing that makes a page read as generated. Mount
  animation is opt-in (`SectionCard reveal` / `LiftCard reveal`), default off.

### 5. Whimsy goes in the margin, in a different voice

The hand-lettered face (`--font-hand`, via `Marginalia`) carries the personality: card
annotations ("still bleeding from the bridge"), asides next to feature copy ("and yes,
the DM can just say no"), the quest log, the "signed in as…" footer. Headings and body
copy stay straight.

Marginalia is **never load-bearing** — every line in the hand face must be removable
without losing information. Never more than ~2 hand-lettered lines in one eyeful.

- **Do** — `HeroCard note`: "won't stop poking the corpse", under the HP track.
- **Don't** — a save-DC value, a form label, an error message, or a nav item set in
  the hand face. It also must never be marked up as a heading: the global `h1..h4`
  rule applies the display face and the dark-mode gold text-shadow. `Marginalia`
  renders a `<p>`.

### 6. Ornament encodes state

- `Seal` — approval status (`approved` / `denied` / `pending`), not decoration.
- `Ribbon` — the active or tagged item.
- `SectionCard framed` — this surface is genuinely special. If more than one framed
  card is on screen, none of them are.
- Class colour (`--oxblood` / `--arcane` / `--verdigris` / `--gold` / `--info`) on a
  `HeroCard` spine and an HP-track fill means something. A coloured bar with no
  meaning behind it gets cut.
- Corner brackets, wax, and fleurons that mean nothing get cut.

- **Do** — `Seal variant={approval.status}` on a homebrew review row.
- **Don't** — a `framed` card wrapping routine content because it "looked plain".

### 7. Empty states are invitations with a scene, not apologies

- **Do** — a lit candle (still, not bobbing), "No one has pulled up a chair yet," a
  scrawled second line, and a primary action. The dashboard concept's empty state is
  the template: `EmptyState` with `scene`, `title`, `description`, `action`.
- **Don't** — `NO CHARACTERS YET` centered in a dashed box.

Every empty state names the thing that's missing in-world and offers the action that
fills it. Loading states get the same care: `DiceSpinner` with a themed label
("Gathering your heroes…"), never a bare spinner.

### 8. Icons are drawn, never typed

Every glyph in the UI comes from `Glyph` — a 24x24 box stroked at 1.5 in
`currentColor`. That is what lets one sit in `text-ink-subtle` and read as ink,
or in `text-gold` and read as gold, in both palettes.

**Emoji are banned in the UI.** They are rendered by the operating system, so
the DM on a Mac and a player on Windows see visibly different apps; they are
fixed full-colour bitmaps that ignore the tokens and shout over the parchment;
and they have no relationship to the line art in `scenes.tsx`. If a kind or a
status needs a mark, add a glyph to the set rather than reaching for a
character.

Drawing one: keep it iconic rather than illustrative, and **draw for 16px** —
that is the size it renders at inside a `SelectItem` or an `EntryCard` kind
label, and detail below that is mud. Scene-scale drawing that carries mood
belongs in `scenes.tsx`, not here.

- **Do** — `<Glyph name="dragon" size={13} />` beside the word "Creature".
- **Don't** — an emoji in a kind label, or an icon fetched from a CDN at
  runtime. Hero Nexus is self-hosted and makes no outbound calls; a CDN icon is
  blank on a box without internet.

---

## Banned by default

Reach for one of these only with a stated reason in the PR/commit description.

- All-caps tracked-out eyebrows above page titles. The `eyebrow` prop is gone from
  `PageHeader`.
- Three-up identical feature cards (`md:grid-cols-3` of icon + heading + paragraph).
- Stat-tile grids for counts that aren't the page's subject. Use `Ledger`.
- Per-card scroll / fade-in animation. `LiftCard` mount animation is opt-in.
- Decorative ornament with no state behind it — stray corner brackets, wax seals not
  tied to an approval, fleurons between every section, coloured bars that mean nothing.
- A page whose largest element is prose about a feature.
- `confirm()` / `alert()` for destructive actions — use a themed dialog.
- Emoji anywhere in the UI (rule 8). Add a `Glyph` instead.
- `space-y-*` as the only thing between two HeroUI controls. Most of them render
  `inline-flex` and will share a line regardless. Use a flex column.
- Bare `—` or `0` flashing into place before data loads. Hold behind a skeleton or a
  `DiceSpinner`.

---

## Page archetypes

Every route is one of these. The archetype decides what the page leads with.

| Archetype           | Leads with                                            | Examples                                                                                        |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Marketing**       | The artifact + one toy (rule 1, 4)                    | `/`                                                                                             |
| **Dashboard**       | Greeting + `Ledger` + the party, then a rail          | `/dashboard`                                                                                    |
| **Collection**      | The collection itself (grid/list of the real objects) | `/characters`, `/spells`, `/classes`, `/campaigns`, `/marketplace`                              |
| **Single object**   | The object, full-bleed; metadata second               | `/campaigns/[id]`, `/campaigns/[id]/players/[characterId]`, `/creator/character`                |
| **Workspace**       | The thing being built/managed; controls in a rail     | `/creator/homebrew`, `/campaigns/[id]/manage`                                                   |
| **Form / utility**  | The form as a framed sheet, plus an in-world scene    | `/login`, `/register`, `/forgot-password`, `/campaigns/create`, `/campaigns/join`, `/account/*` |
| **Reference prose** | A short lede, then asymmetric content (rule 3)        | `/about`, `/faq`                                                                                |

Rules that always apply regardless of archetype: no eyebrow; `PageHeader rule={false}`
when the page leads with an object; calm motion; empty/loading states get a scene and
a themed label; hand-lettered voice only in the margin.

---

## The shell

### Book-spine sidebar (`SideNavigation`) — logged-in routes

Modelled on the concept's `.spine`. Not a generic app sidebar.

- Background `--surface` a touch darker than the page; a **3px gradient stripe** down
  the right edge (`transparent → gold/35 → transparent`).
- Brand: sigil + "Hero Nexus" in `font-display-alt`, gold-strong.
- Nav items: `font-sans`, `text-ink-muted`, generous row padding. Hover → `text-ink`
  on a faint wash.
- **Active item**: gold fill, `--bg`-colour text, `font-medium`, plus a **4px oxblood
  (`--danger`) tab** flush to the left edge of the row. Exactly one active item.
- A hairline separator splits primary nav (Table / Heroes / Campaigns) from the
  compendium group (Forge / Classes / Spells / Market).
- Foot: a `Marginalia` line — "Signed in as {name}, keeper of {n} campaigns" — above
  the theme toggle and sign-out.
- Collapse behaviour is kept; collapsed shows icons only, active tab still reads.

### Top nav (`Navigation`) — public routes

Stays a top bar. Keeps the `border-t-2 border-t-gold/70` hairline. Active link is
`text-ink`; the rest `text-ink-muted`. No eyebrow-style tracking.

---

## Component recipes

### Greeting block (dashboard, and any "your X" landing)

```
<h1 font-display, ~text-4xl>The table is set, <em class="text-gold-strong italic">{name}</em></h1>
<Marginalia>{one in-world line about what's waiting}</Marginalia>
<Ledger items={[…]} />           // held behind a skeleton until data resolves
```

Paired to the right: the one toy (`<HeaderDie />` on the dashboard). Below: a
`<Fleuron />` rule, then the content.

### `HeroCard` — the party card

Anatomy, matching the concept's `.card`:

- `~12rem` wide in a `flex flex-wrap` (not a rigid grid), each card at a **tiny random
  rotation** (`±0.7deg`), straightening + lifting on hover.
- Top: a **4px spine band** in the class colour.
- Portrait area (`portrait` node, or initials on `--surface-2`), with a **gold level
  badge** top-right.
- Name in `font-display`; `{species} · {subclass}` in small `--ink-subtle`.
- HP track: thin bar, fill width `= current/max`, fill colour by ratio
  (`success` > 50% > `warning` > 25% > `danger`); a `48 / 66 hp` · `ac 18` row under
  it in tabular nums.
- Optional `note`: one `Marginalia` line.
- A sibling **"roll a new one"** dashed card ends the row on pages where creating a
  hero makes sense.

### Right rail (dashboard)

`SectionCard`-free; hairline `border-l`, `pl-7`. Blocks, each `h3` + content:

- **Recently forged** — the last few homebrew items as `Ribbon`/pill links.
- **Tables you run** — campaigns where `isGM`, name + member count, linking in.
- **Next session** — now real: `campaign_sessions` carries scheduled dates, and
  `getCampaignPulse` returns the soonest planned sitting. The campaign page shows it
  beside its `Ledger` line as "Session 4 · Thursday, September 10 — in 7 days".
- Only build a block that has real data. A stub with fake content is worse than an
  absent block.

### Quest log

`ul` of `Marginalia`-voice lines, `※` gold bullet, done = `✓` verdigris + strikethrough.
Built as `QuestPanel` on `/campaigns/[id]`. A quest has two bodies — what the party
was told, and what is actually going on — and each objective carries its own
visibility, so the same list serves the DM and the table.

### Empty-state scene

`EmptyState` with the `scene` prop: an inline SVG at ~70–96px, drawn in token colours,
one gently-animated element max (the candle flame) that **stops** under
`prefers-reduced-motion`. The set lives in `ui/scenes.tsx`: `CandleScene` (an absent
party), `SealedLetterScene` (auth and mail), `ChronicleScene` (an unwritten chronicle),
`QuestScene` (a bare notice board), `HoardScene` (an empty chest), `BattlefieldScene`
(no fight running), `ForgeScene` (a cold anvil), `HourglassScene` (no downtime
window open), `TomeScene` (an empty archive, and an unseeded compendium),
`HandoutScene` (nothing passed across the table), `QuietDeskScene` (a review
queue with nothing in it). `title` straight, `description` as the scrawl, one primary +
optional ghost action.

### Pitch row (marketing)

Two-column, alternating side via a `flip` prop. One side: `h2` + one paragraph of
straight copy + optionally one `Marginalia` aside. Other side: a **working fragment**
of the product, not an illustration.

---

## Tokens

Copied from `src/app/globals.css`. The HeroUI mirror is `src/app/hero.ts` — the two
files carry a comment saying they must stay in sync. This design work does not change
colours; if you ever do, change both.

| Token           | Light     | Dark      | Use                                           |
| --------------- | --------- | --------- | --------------------------------------------- |
| `--bg`          | `#faf6ef` | `#16130f` | page ground                                   |
| `--surface`     | `#ffffff` | `#1e1a14` | cards, sheets, sidebar                        |
| `--surface-2`   | `#f3ede1` | `#262019` | insets, stat blocks, tracks, hover washes     |
| `--ink`         | `#2b2620` | `#ede7da` | primary text, ledger values                   |
| `--ink-muted`   | `#6b6459` | `#a89f8d` | secondary text, ledger labels, nav items      |
| `--ink-subtle`  | `#9a9184` | `#7a7060` | marginalia, faint captions                    |
| `--line`        | `#e4dccb` | `#33291d` | every border (applied globally via `*`)       |
| `--gold`        | `#b4894a` | `#d9b061` | ornament, the one accent, active nav fill     |
| `--gold-strong` | `#7a5c2e` | `#e8c988` | gold text needing contrast, greeting `em`     |
| `--arcane`      | `#6b4d8a` | `#a988cf` | homebrew / custom content; caster class spine |
| `--success`     | `#3f7d55` | `#6bbf8a` | approved, healthy HP                          |
| `--warning`     | `#b07d33` | `#d6a253` | pending, bloodied HP                          |
| `--danger`      | `#a23b34` | `#d9756c` | denied, critical HP, oxblood nav tab          |
| `--info`        | `#4a6076` | `#8aa4bd` | neutral accent                                |

`--radius` `0.625rem` · `--shadow-card` (see file) · `--heading-glow` is `none` in
light, a gold blur in dark — it rides on `h1..h4` automatically.

Fonts (aliases in the `@theme inline` block):

| Alias                | Family                             | Job                             |
| -------------------- | ---------------------------------- | ------------------------------- |
| `--font-sans`        | Inter                              | body                            |
| `--font-display`     | Fraunces (variable, `SOFT`/`opsz`) | headings, card titles, greeting |
| `--font-display-alt` | Cinzel (500/600 only)              | page titles, small tab labels   |
| `--font-hand`        | Caveat (500)                       | marginalia only                 |

---

## Primitives

### Existing — keep, use for meaning

| Primitive      | Use                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `PageShell`    | route width container                                                                                      |
| `PageHeader`   | title + description + actions. `rule={false}` when the page leads with an object. No `eyebrow`.            |
| `SectionCard`  | themed panel. `framed` = genuinely special, at most one on screen. `reveal` opts into scroll-in animation. |
| `Stat`         | a real character-sheet element; **not** for dashboard count grids                                          |
| `StatBlock`    | printed-sheet stat tile with a tab label — used inside `SheetPreview`                                      |
| `EmptyState`   | invitation with a `scene` (rule 7)                                                                         |
| `Fleuron`      | one hairline ornament rule per page; not between every section                                             |
| `Seal`         | approval status (rule 6)                                                                                   |
| `Ribbon`       | active / tagged item (rule 6)                                                                              |
| `DeckledEdge`  | torn-parchment edge; used once, at the bottom of the home hero                                             |
| `Dice3DRoller` | the CSS-3D ability dice; the "one toy" on a page that rolls a sheet                                        |
| `DiceSpinner`  | loading indicator, always with a themed label                                                              |

### New — added with this work

| Primitive      | Use                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Marginalia`   | hand-lettered aside (rule 5). Content prop + optional `dash`. Renders `<p>`. Never load-bearing.                                                   |
| `Glyph`        | the house icon set (rule 8). `name` + `size`, stroked in `currentColor`, so it takes whatever ink colour it sits in.                               |
| `Ledger`       | prose count line (rule 2). `items: {value, label}[]`. Drops to subtle ink when every value is `0`/`—`.                                             |
| `HeroCard`     | the party card (rule 1): `charClass`-coloured spine, portrait/initials, level badge, HP track, optional `note`. Dashboard, roster, campaign pages. |
| `SheetPreview` | read-only character sheet card (rule 1). Plain-object driven so marketing can feed it fixtures. Exports `abilityMod`.                              |

---

## Per-route checklist

What "following the guide" means for each route. `[x]` = done in this pass.

| Route                                     | Archetype       | Must                                                                                                                                                                                |
| ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                       | Marketing       | Split hero, `SheetPreview` + d20, two pitch rows with product fragments, `DeckledEdge`. `[x]`                                                                                       |
| `/dashboard`                              | Dashboard       | Greeting + `em` name, scrawl line, `Ledger` behind skeleton, header d20, party `HeroCard` row + "roll a new one", rail (Recently forged / Tables you run), scene empty state. `[x]` |
| `/characters`                             | Collection      | Leads with the roster as `HeroCard`s; `PageHeader rule={false}`; scene empty state; no eyebrow.                                                                                     |
| `/campaigns`                              | Collection      | Leads with campaign cards showing real state (`Ribbon` status, member count); scene empty state.                                                                                    |
| `/campaigns/[id]`                         | Single object   | The campaign (party + session tools) first; manage secondary. Tabs carry a glyph and a one-word name; counts are staff-only. `[x]`                                                  |
| `/campaigns/[id]/manage`                  | Workspace       | Members/settings as the working surface; breadcrumb back-link, not eyebrow. `[x]`                                                                                                   |
| `/campaigns/[id]/players/[characterId]`   | Single object   | The sheet full-bleed; `Ribbon` for homebrew; change log in one `framed` card. `[x]` breadcrumb                                                                                      |
| `/campaigns/create`, `/campaigns/join`    | Form            | Form as a sheet; in-world scene; straight labels.                                                                                                                                   |
| `/creator`                                | Workspace       | The three creators as entry cards that preview what they make — not blurbs.                                                                                                         |
| `/creator/character`                      | Single object   | The sheet is the page; `Dice3DRoller` is the one toy.                                                                                                                               |
| `/creator/homebrew`                       | Workspace       | The item being forged front and centre; `Seal` on submitted items. `[x]`                                                                                                            |
| `/spells`, `/classes`                     | Collection      | The compendium leads — no rule, no card around the browser; `Ledger` only when there is something to count. `[x]`                                                                   |
| `/marketplace`                            | Collection      | Public homebrew as real cards; honest empty state (still a placeholder feature).                                                                                                    |
| `/account/profile`, `/account/settings`   | Form            | Framed form sheet; an aside apiece; a scene on the signed-out state. `[x]`                                                                                                          |
| `/about`, `/faq`                          | Reference prose | Short lede then asymmetric content; a `Marginalia` aside or two; no 3-up cards.                                                                                                     |
| `/login`, `/register`, `/forgot-password` | Form            | Form as a framed sheet on one side, an in-world scene (candle / locked ledger / sealed letter) on the other.                                                                        |

---

## Review checklist

Run this against any page diff:

1. What's the largest thing on the page? If it's prose about a feature, fail (rule 1).
2. Any count rendered as a tile that isn't the page's subject? → `Ledger` (rule 2).
3. Any `md:grid-cols-3` (or 4) of near-identical cards that aren't a homogeneous
   collection? Fail (rule 3).
4. More than one animated/interactive element? Fail (rule 4). Is the one toy tied to
   the product?
5. Hand-lettered text anywhere load-bearing, or marked up as a heading? Fail (rule 5).
6. Any `framed` card when another is on screen? Any coloured bar / seal / bracket with
   no state behind it? Fail (rule 6).
7. Empty state an apology or a bare dashed box? Loading state a bare spinner? Fail
   (rule 7).
8. Any `eyebrow`, any `confirm()`/`alert()`, any `—`/`0` flash before load? Fail
   (banned list).
9. Any emoji in the UI? Fail (rule 8). Does every new glyph still read at 16px?
10. Verified in light **and** dark, and with `prefers-reduced-motion: reduce`.

---

## Concept mockups

`docs/concepts/` holds the standalone HTML mockups. They are HTML/CSS approximations,
not React — they do not import HeroUI or any repo component, and their palette/fonts
are **not** authoritative (an early dashboard mockup uses an invented dark palette and
Cormorant/Karla). Take the **layout and information design** from them; take colours
and type from the tokens above.

- `hero-nexus-dashboard-concept.html` — dashboard, with a filled/empty toggle.
- The home concept was not committed; `src/app/page.tsx` is its reference
  implementation.
