# Hero Nexus design language — "Show the artifact"

This is the reference every page is built against. If a page and this doc disagree, the
page is wrong.

The app is already competently themed: Fraunces + Cinzel + Inter, a warm
parchment/candlelight token pair, a grain overlay, and a set of characterful primitives
(`Fleuron`, `Seal`, `Ribbon`, `DeckledEdge`, `Dice3DRoller`). That part is good and is
not what this document changes.

What it changes is the **layout and information design underneath the theme**, which
was generic SaaS: every route opened with the same eyebrow → serif h1 → muted lede →
fleuron rule, the home page was a centered column ending in three identical icon cards,
and the dashboard led with four stat tiles that read `0 / 0 / 0 / 0` for a new account.
No page showed the product.

---

## The principle

**Show the artifact.** Every page leads with the thing itself — a character sheet, a
spell block, a stack of party cards, a review queue — not a description of the thing.

Six rules, each phrased so a reviewer can point at a diff and say it's violated.

### 1. The object is the hero

Every page leads with the thing itself, not prose about it. If the page's most
prominent element is a paragraph describing a feature, the page is wrong.

- **Do** — home hero: `SheetPreview` on the right, a real (fixture) character with a
  roll control that recomputes its modifiers.
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
  (`SheetPreview`, a `Seal`'d review row) on the other.
- **Don't** — `<div className="grid gap-5 md:grid-cols-3">` of three `SectionCard`s
  with an icon and a paragraph each.

### 4. One toy per page, and it must demo the product

Exactly one interactive or animated moment per page. Everything else holds still.

- **Do** — home: the d20 that rolls a new fixture hero into the sheet and recomputes
  the ability modifiers. Dashboard: the d20 in the header.
- **Don't** — every `SectionCard` fading and rising on scroll via `LiftCard`'s
  `whileInView`. That is the thing that makes a page read as generated. Mount
  animation is now opt-in (`SectionCard reveal` / `LiftCard reveal`), default off.

### 5. Whimsy goes in the margin, in a different voice

The hand-lettered face (`--font-hand`, via `Marginalia`) carries the personality: card
annotations ("still bleeding from the bridge"), asides next to feature copy ("and yes,
the DM can just say no"), the quest log. Headings and body copy stay straight.

Marginalia is **never load-bearing** — every line in the hand face must be removable
without losing information.

- **Do** — `HeroCard note`: "won't stop poking the corpse", under the HP track.
- **Don't** — a save-DC value or a form label set in the hand face. It also must never
  be marked up as a heading: the global `h1..h4` rule applies the display face and the
  dark-mode gold text-shadow. `Marginalia` renders a `<p>`.

### 6. Ornament encodes state

- `Seal` — approval status (`approved` / `denied` / `pending`), not decoration.
- `Ribbon` — the active or tagged item.
- `SectionCard framed` — this surface is genuinely special. If more than one framed
  card is on screen, none of them are.
- Corner brackets, wax, and fleurons that mean nothing get cut.

- **Do** — `Seal variant={approval.status}` on a homebrew review row.
- **Don't** — a `framed` card wrapping routine content because it "looked plain".

### 7. Empty states are invitations with a scene, not apologies

- **Do** — a lit candle, "No one has pulled up a chair yet," and a primary action.
- **Don't** — `NO CHARACTERS YET`.

`EmptyState` supports `icon` / `title` / `description` / `action` and has a
compass-rose watermark. It needs better content and a scene-scale illustration slot,
not a rewrite. Note its `icon` renders inside `Float` (animates forever) — a
scene-scale illustration should not bob.

---

## Banned by default

Reach for one of these only with a stated reason in the PR description.

- All-caps tracked-out eyebrows above page titles. The `eyebrow` prop is removed from
  `PageHeader`.
- Three-up identical feature cards (`md:grid-cols-3` of icon + heading + paragraph).
- Stat-tile grids for counts that aren't the page's subject. Use `Ledger`.
- Per-card scroll / fade-in animation. `LiftCard` mount animation is opt-in now.
- Decorative ornament with no state behind it — stray corner brackets, wax seals not
  tied to an approval, fleurons between every section.
- A page whose largest element is prose about a feature.

---

## Tokens

Copied from `src/app/globals.css`. The HeroUI mirror is `src/app/hero.ts` — the two
files carry a comment saying they must stay in sync. This design work does not change
colours; if you ever do, change both.

| Token           | Light     | Dark      | Use                                     |
| --------------- | --------- | --------- | --------------------------------------- |
| `--bg`          | `#faf6ef` | `#16130f` | page ground                             |
| `--surface`     | `#ffffff` | `#1e1a14` | cards, sheets                           |
| `--surface-2`   | `#f3ede1` | `#262019` | insets, stat blocks, tracks             |
| `--ink`         | `#2b2620` | `#ede7da` | primary text, ledger values             |
| `--ink-muted`   | `#6b6459` | `#a89f8d` | secondary text, ledger labels           |
| `--ink-subtle`  | `#9a9184` | `#7a7060` | marginalia, faint captions              |
| `--line`        | `#e4dccb` | `#33291d` | every border (applied globally via `*`) |
| `--gold`        | `#b4894a` | `#d9b061` | ornament, the one accent                |
| `--gold-strong` | `#7a5c2e` | `#e8c988` | gold text needing contrast              |
| `--arcane`      | `#6b4d8a` | `#a988cf` | homebrew / custom content               |
| `--success`     | `#3f7d55` | `#6bbf8a` | approved, healthy HP                    |
| `--warning`     | `#b07d33` | `#d6a253` | pending, bloodied HP                    |
| `--danger`      | `#a23b34` | `#d9756c` | denied, critical HP                     |
| `--info`        | `#4a6076` | `#8aa4bd` | neutral accent                          |

`--radius` `0.625rem` · `--shadow-card` (see file) · `--heading-glow` is `none` in
light, a gold blur in dark — it rides on `h1..h4` automatically.

Fonts (aliases in the `@theme inline` block):

| Alias                | Family                             | Job                                    |
| -------------------- | ---------------------------------- | -------------------------------------- |
| `--font-sans`        | Inter                              | body                                   |
| `--font-display`     | Fraunces (variable, `SOFT`/`opsz`) | headings, card titles                  |
| `--font-display-alt` | Cinzel (500/600 only)              | page titles, small tab labels, kickers |
| `--font-hand`        | Caveat (500)                       | marginalia only                        |

---

## Primitives

### Existing — keep, use for meaning

| Primitive      | Use                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageShell`    | route width container                                                                                                                       |
| `PageHeader`   | title + description + actions. `rule={false}` when the page leads with an object so there's no decorative rule above it. No more `eyebrow`. |
| `SectionCard`  | themed panel. `framed` = genuinely special, at most one on screen. `reveal` opts into scroll-in animation.                                  |
| `Stat`         | still fine as a real character-sheet element; **not** for dashboard count grids                                                             |
| `StatBlock`    | printed-sheet stat tile with a tab label — used inside `SheetPreview`                                                                       |
| `EmptyState`   | invitation with a scene (rule 7)                                                                                                            |
| `Fleuron`      | one hairline ornament rule; not between every section                                                                                       |
| `Seal`         | approval status (rule 6)                                                                                                                    |
| `Ribbon`       | active / tagged item (rule 6)                                                                                                               |
| `DeckledEdge`  | torn-parchment edge; used once, at the bottom of the home hero                                                                              |
| `Dice3DRoller` | the CSS-3D dice; the "one toy" on a page that needs a roll                                                                                  |
| `DiceSpinner`  | loading indicator                                                                                                                           |

### New — added with this work

| Primitive      | Use                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Marginalia`   | hand-lettered aside (rule 5). One content prop plus optional `dash`. Renders `<p>`. Never load-bearing.                                                                            |
| `Ledger`       | prose count line (rule 2). `items: {value, label}[]`. Drops to subtle ink when every value is `0`/`—`.                                                                             |
| `HeroCard`     | the party card (rule 1): class-coloured spine, portrait/initials, level badge, HP track, optional `note` slot rendered as `Marginalia`. Used on dashboard, roster, campaign pages. |
| `SheetPreview` | read-only character sheet card (rule 1). Driven by a plain object so the marketing page can feed it fixtures without touching the real character model. Exports `abilityMod`.      |

---

## Concept mockups

`docs/concepts/` holds the standalone HTML mockups that are the visual source of truth
for the home page and dashboard. They are HTML/CSS approximations, not React — they do
not import HeroUI or any repo component. The home mockup's colours were copied from
`globals.css` and are accurate; an early dashboard mockup used an invented dark palette
— use the repo tokens above, not any hex from a mockup.
