# Handoff — the Wandering Library

Branch: `feat/wandering-library`.

This directory is the state of play for one piece of work: **sharing**. Until now every
piece of work a user made — homebrew, heroes, whole campaigns, the pictures pinned to
them — was private to the account that made it. `/marketplace` was a stub with an
honest empty state, and `homebrew.visibility = 'public'` was a column nothing read.

The Wandering Library is where a user puts something down so other users can pick it
up, and nothing is bought or sold. Take a spell, take a hero, take somebody's whole
six-month campaign and run it at your own table.

## Contents

| Document                                         | Holds                                                    |
| ------------------------------------------------ | -------------------------------------------------------- |
| This file                                        | The model, the phases, and the run that proved them.     |
| [phases.md](phases.md)                           | Per-phase task lists, in build order, with their status. |
| [../../sharing-model.md](../../sharing-model.md) | The binding contract that came out of this work.         |

---

## Three words that are not the same word

`library` already meant something in this repo, and shipping a fourth meaning of it
would make every sentence in `docs/content-model.md` ambiguous. The three terms, kept
apart deliberately:

| Term                      | Is                                                             | Lives in                         |
| ------------------------- | -------------------------------------------------------------- | -------------------------------- |
| **the Wandering Library** | The public shelf. What everyone published, for anyone to take. | `publications`, `/library`       |
| **your shelf**            | One reader's own collection — SRD, forged, adopted.            | `ShelfItem` / `listShelfContent` |
| **a campaign library**    | What is in play at one table (content-model rule 6).           | `campaign_homebrew`              |

Copy rule: the public surface is always "the Library" or "the Wandering Library", never
"the market"; a reader's own collection is always "your shelf"; `campaign_homebrew` is
always "the campaign's library" or "in play at this table". A sentence that needs a
qualifier to say which one it means is a sentence to rewrite.

The verbs are **publish** (put it on the shelf) and **adopt** (take it home). Never
"buy", "sell", "download", "install".

---

## The model

### A publication is a listing, not the thing

`publications` is one row per thing offered. It carries the title, the blurb, the tags,
who wrote it, and — this is the part that decides everything else — **how the thing
behind it is delivered**. There are exactly two deliveries and a publication is one or
the other:

**Live-linked** (`kind = 'homebrew'`). The publication points at the author's live
`homebrew` row. An adopter gets a link to it, so the author's later correction to their
own spell reaches every table using it. This is content-model rule 1 — a copy is a fork
— applied across accounts.

**Snapshot** (`kind` is `character`, `campaign`, `image`, or `bundle`). The publication
carries a frozen `payload`, and adopting it mints new rows the adopter owns outright.
A character sheet and a campaign are mutable play state; a shared one is a pregen and a
module, not a live feed. Nobody wants their DM's prep rewritten under them mid-session
because the original author kept editing, and nobody wants their own edits to a
borrowed campaign fighting an upstream.

Both deliveries carry a frozen `payload` regardless. For the live kind it is the
fallback: a withdrawn or deleted homebrew row still renders as what it was, rather than
as a blank card, which is the same reason `inventory[].name` is denormalised on a sheet.

### Adopting is linking or forking, and both are recorded

`adoptions` is one row per (reader, publication).

- **Linked** — the reader's shelf now shows the author's live content. `ShelfOrigin`
  already reserves `'shared'` for exactly this, and every consumer of a shelf already
  handles it. Not theirs to edit.
- **Forked** — the reader gets their own `homebrew` row, copied at that moment, theirs
  to edit, with `forkedFrom` provenance. Their edits never reach the author and the
  author's never reach them. This is the escape hatch for "nearly right".

Snapshot kinds are always effectively a fork: adopting mints characters, campaigns and
images the reader owns. The adoption row survives as provenance and as the count on the
listing.

### What a shared campaign carries, and what it must not

A campaign package is the highest-risk object in this work, because a campaign row is
surrounded by other people's data. The package carries the **prep**; it never carries
the **table**.

Carried: name, description, settings, canon entries (both halves — the adopter becomes
the DM and prep with the secrets stripped is not prep), canon collections and links,
quests and their objectives, notes, maps and their pins, and every homebrew row the
above reference, bundled as `publication_items`.

Never carried: members, invites, the join code, characters and their sheets, sessions,
attendance and RSVPs, rolls, journals, downtime, awards and grants, secrets belonging to
a player, initiative encounters, progress clocks, screen layouts, party loot and
treasury. Some of that is other users' rows outright; the rest is a record of a table
that was played, not of a thing to run.

The exclusion list is enforced in one place — `buildCampaignPackage` — and the test that
matters is that adding a new campaign-scoped table does not silently opt it into being
shared. Packages are built from an explicit allow-list of tables, never from "everything
with this `campaign_id`".

### Images are files, and files are the thing that outlives the row

Images already have a home: `campaign_images` plus files under `UPLOADS_DIR`. Publishing
one copies the bytes into `UPLOADS_DIR/library/<publicationId>/`, so withdrawing a
publication or deleting the campaign it came from cannot leave a listing pointing at a
file that is gone. Adopting an image copies the bytes again, into a campaign the adopter
runs.

There is deliberately **no user-level image store** in this work. Every image in the app
belongs to a campaign; giving images a second home would mean two upload paths, two
permission checks and two garbage-collection stories for one feature. An adopter picks
which of their campaigns receives it.

### Visibility, withdrawal, and the fact that this is self-hosted

`visibility` is `public` (listed and searchable) or `unlisted` (reachable only by its
link). There is no private publication — that is what not publishing is.

`status` is `listed` or `withdrawn`. Withdrawing removes a publication from the shelf and
stops new adoptions. It does **not** break existing ones: a linked adoption keeps
resolving to the live homebrew row, and every snapshot adoption was always the adopter's
own rows. An author who wants their content gone from other people's tables is asking for
something this app cannot honestly promise, and pretending otherwise by cascading a delete
into other users' characters would be worse than saying so.

Hero Nexus is a self-hosted instance whose users are, in practice, one group of people who
know each other. There is no moderation queue, no reporting, no admin role, because there
is no one to escalate to. The instance owner has the database. That is the moderation
story, and it is stated rather than implied.

---

## Phases

Each phase is shippable on its own and leaves the app in a state a person could use.
Full task lists live in [phases.md](phases.md).

| #   | Phase                | Lands                                                                                                                      |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Foundations**      | Migration `0029`, `publications`, `src/server/library.ts`, publishing homebrew, `/library` listing real cards, nav rename. |
| 2   | **Adoption**         | `adoptions`, the `shared` branch of `listShelfContent` lit, fork-to-edit, provenance marks, submitting adopted content.    |
| 3   | **Images**           | `publication_assets`, publishing a campaign image, adopting one into a campaign you run, cover images on any publication.  |
| 4   | **Heroes**           | Character packages: sheet snapshot plus the homebrew it references, ref remapping on adoption.                             |
| 5   | **Campaigns**        | Campaign packages: the allow-list above, and adoption that mints a runnable table.                                         |
| 6   | **Browse and prove** | Search, filters, sort, author pages, `docs/sharing-model.md`, and the verification script.                                 |

## The proof run

Run against a production build (`npm run build` + `npm run start`) with three real
accounts and three cookie jars, over real server-action POSTs, per
[verifying-without-a-browser.md](../verifying-without-a-browser.md). The accounts, the
campaigns and the uploaded files were deleted afterwards.

| #   | Proof                                                                                                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A published spell and species appear on a second account's shelf; the unpublished item does not.           | 2 listings, both credited "Verify GM"; `Verify Blade` absent.                                                                                                                                                                                                                                                                                                                                                                                             |
| 2   | An adopted spell shows on the adopter's shelf as `shared`, as `mine` for its author, and on nobody else's. | `origin: shared` / `origin: mine` / absent for the third account.                                                                                                                                                                                                                                                                                                                                                                                         |
| 2a  | The author's later correction reaches the adopter without republishing.                                    | Author changed `2d6` → `4d8`; the adopter's shelf read `4d8`.                                                                                                                                                                                                                                                                                                                                                                                             |
| 2b  | A fork stops tracking.                                                                                     | Author changed the species' speed to 45 and its blurb; the fork still read speed 30 and the old blurb, `forked_from` set, `visibility: private`.                                                                                                                                                                                                                                                                                                          |
| 3   | Publishing and adopting a picture copies bytes, twice.                                                     | Three distinct files: the campaign's, `library/<pub>/…`, and the adopter's campaign.                                                                                                                                                                                                                                                                                                                                                                      |
| 4   | An adopted hero's homebrew refs point at the adopter's own rows.                                           | `build.speciesKey` and the spell ref both equal ids in the adopter's forge; `provenance` empty.                                                                                                                                                                                                                                                                                                                                                           |
| 5   | An adopted campaign carries the prep and none of the table.                                                | Canon (both bodies), quest (with `dmNotes`), prep note, map, pin re-pointed at the local canon entry, image copied, library homebrew minted and in play. `campaign_members`, `campaign_invites`, `campaign_sessions`, `party_loot`, `campaign_rolls`, `player_journals`, `campaign_clocks`, `downtime_periods`, `session_awards`, `party_treasury`, `campaign_handouts`, `initiative_encounters`, `campaign_screen_layouts` all 0, and a fresh join code. |
| 6   | The shelf filters and sorts.                                                                               | `kind`, `contentType`, `tag`, free text and `sort` each returned exactly the expected listings out of five.                                                                                                                                                                                                                                                                                                                                               |

Negatives, because a permission check that only proves the owner _can_ has proven
nothing:

- A player publishing the GM's homebrew — "That homebrew is not yours to publish."
- A player publishing a picture from a table they only play at — refused. (This one
  returned a bare "Something went wrong" on the first run: `requireCampaignRole` throws
  `FORBIDDEN`, which the action layer had no sentence for. Fixed, re-run, and it now
  reads "Only a table's DM can do that.")
- Adopting a picture without naming a table — "Choose which of your tables the picture
  should go to."
- Adopting a withdrawn listing — "The author has taken this off the shelf," while the
  reader who had already taken it kept it (`origin: shared`).

### What each phase had to prove

Proof means `docs/handoff/verifying-without-a-browser.md`: real accounts, real cookie
jars, real server-action POSTs against a production build. A typecheck cannot tell you
that adopting a campaign copied a player's secrets into a stranger's table.

1. A published spell appears on a second account's `/library` and a private one does not.
2. An adopted spell appears on the adopter's shelf marked `shared`, is not editable by
   them, and reflects an edit the author makes afterwards. A fork does not.
3. An adopted image lands in the target campaign's picker and the bytes on disk are a
   second file, not a shared one.
4. An adopted hero arrives with its homebrew species resolving, not as an `Unavailable`
   ref pointing at a stranger's row.
5. An adopted campaign carries the quests and none of the members: the exclusion list,
   checked table by table against a campaign that has a row in every one of them.
6. Every listing renders, filters by kind and tag, and the counts on it are real.
