# Hero Nexus sharing model — "the prep, never the table"

This is the contract every published thing is built against. If the code and this doc
disagree, the code is wrong. Agents working on this repo follow it without being
reminded. Its sibling is [content-model.md](content-model.md), which governs what a
piece of content _is_; this one governs what happens when it leaves the account that
made it.

Before the Wandering Library, everything an account made was private to it.
`/marketplace` was a stub with an honest empty state and `homebrew.visibility = 'public'`
was a column nothing read. The Library is the first surface in the app that deliberately
shows one account's rows to another, and that is why it gets a contract of its own.

---

## Three words that are not the same word

`library` already meant something here. Keep the three apart, in code and in copy:

| Term                      | Is                                                     | Lives in                         |
| ------------------------- | ------------------------------------------------------ | -------------------------------- |
| **the Wandering Library** | The public shelf — what everyone published. `/library` | `publications`                   |
| **your shelf**            | One reader's own collection: SRD, forged, adopted      | `ShelfItem` / `listShelfContent` |
| **a campaign library**    | What is in play at one table (content-model rule 6)    | `campaign_homebrew`              |

The verbs are **publish** and **adopt**. Never "buy", "sell", "download", "install" —
nothing here costs anything, and the words that imply it were the reason the surface was
renamed.

---

## The rules

Seven, each phrased so a reviewer can point at a diff and say it is violated.

### 1. Homebrew is live-linked; everything else is a snapshot

A `kind = 'homebrew'` publication points at the author's live row, so their later
correction reaches every table using it. That is content-model rule 1 — a copy is a fork
— applied across accounts.

`character`, `campaign`, `image` and `bundle` carry a frozen `payload`, and adopting
mints rows the adopter owns outright. A sheet and a campaign are mutable play state; a
shared one is a pregen and a module. Nobody wants their prep rewritten under them
mid-session because the author kept editing, and nobody wants their own edits to a
borrowed campaign fighting an upstream.

- **Do** — `publications.homebrew_id` for the live kind; `payload` for the rest.
- **Don't** — a "live" campaign that re-syncs, or a homebrew listing that copies stats
  into the adopter's forge by default.

### 2. Every listing carries a frozen fallback, even the live one

`payload` is written for all five kinds. On the live kind it is what a listing renders
from when its row is gone — the same argument as the denormalised `inventory[].name` on
a character sheet: a deleted or withdrawn thing must read as what it was, never as a
blank card.

### 3. Adopting is _link_ or _fork_, and the reader chooses

`linked` puts the author's live row on the reader's shelf: not theirs to edit, and the
author's fixes find them. `forked` mints their own copy with `homebrew.forked_from`
provenance, and the two never speak again.

Forking is deliberate, never the default. A silent fork is exactly the drift the content
model exists to prevent; an explicit one is the escape hatch for "nearly right".

- **Do** — two buttons, and a line saying which is which.
- **Don't** — "Add to my collection" that quietly copies.

### 4. Withdrawing stops new adoptions and reaches nobody's existing one

`status = 'withdrawn'` takes a listing off the shelf. A linked adoption keeps resolving,
and every snapshot adoption was always the adopter's own rows.

An author who wants their work gone from other people's tables is asking for something
this app cannot honestly promise. Saying so plainly is better than cascading a delete
into other users' characters.

### 5. A campaign package carries the prep and never the table

`buildCampaignPackage` works from an explicit allow-list — `CARRIED` in
`@/server/library-campaign-package` — never from "everything with this `campaign_id`".
That is the load-bearing part: the next campaign-scoped table anybody adds is opted
**out** by default, and opting it in means editing the list on purpose.

Carried: name, description, settings, canon collections/entries/links, quests and
objectives, prep notes, maps and pins, the pictures those point at, and the homebrew the
campaign's library holds. **Both bodies** of canon and quests travel, secrets included —
the adopter becomes the DM, and prep with the secret half stripped is not prep.

Never carried: members, invites, the join code, characters and their sheets, sessions,
attendance, rolls, journals, downtime, awards, initiative, clocks, screen layouts, loot,
treasury, handouts, reveals and approvals. Some of that is other users' rows outright;
the rest is the record of a table that was played, not a thing to run.

- **Do** — add a table to `CARRIED` and to `NEVER_CARRIED`'s opposite deliberately.
- **Don't** — a `select * where campaign_id = ?` sweep, however tidy it looks.

### 6. A package's refs are remapped before its rows are created

A sheet published without the homebrew it references arrives with its species pointing
into a forge the adopter cannot see: `Unavailable`, and the character silently loses
whatever that species gave it. So referenced content travels, is minted first, and the
refs are rewritten **before** `createCharacter` is called — that function writes
`character_homebrew` off the sheet it is handed, so the wrong order records the wrong
links.

Ids inside a package are the source rows' ids used as local keys. They name a piece
within the package and mean nothing outside it, which is what lets a pin still open the
right canon entry after every row is minted afresh somewhere else.

An id with no minted row is left alone, never blanked: `Unavailable` plus the
denormalised name tells the adopter what is missing, where a blank looks like the
character never had one.

### 7. Published files are copies, and they are public by construction

Publishing a picture copies the bytes into `UPLOADS_DIR/library/<publicationId>/`;
adopting copies them again into a campaign the adopter runs.

A listing pointing at a `campaign_images` row would be unreadable to everybody not at
that table — those files are served behind `requireCampaignRole` — and the only way to
make it readable would be a bypass on the route serving every table's uploads. That is
the last place in this app to put one. Copying also means archiving the campaign a
picture came from cannot take a published listing's picture with it.

`/api/library/[id]/assets/[assetId]` therefore has no role check, and the asset must
belong to the listing named in the path.

There is deliberately **no user-level image store**. Every image in this app belongs to a
campaign; a second home would mean two upload paths, two permission checks and two
garbage-collection stories for one feature. An adopter picks which of their tables
receives it.

---

## Where it lives

| Module                                  | Holds                                                             |
| --------------------------------------- | ----------------------------------------------------------------- |
| `@/@creator/library/lib/publication.ts` | The vocabulary: kinds, modes, `PublicationCard`. No React, no db. |
| `@/server/library.ts`                   | Publishing, listing, freezing, withdrawing.                       |
| `@/server/adoptions.ts`                 | Taking: link, fork, and the `shared` half of a shelf.             |
| `@/server/library-assets.ts`            | The files a listing carries, and where their bytes go.            |
| `@/server/library-packages.ts`          | Hero packages, and the ref remapping every package needs.         |
| `@/server/library-campaign-package.ts`  | `CARRIED` / `NEVER_CARRIED`, and a campaign in both directions.   |
| `@/@creator/library/components/`        | The shelf, a listing, and the publish controls.                   |

## Who moderates this

Nobody, and that is stated rather than implied. Hero Nexus is a self-hosted instance
whose users are in practice one group of people who know each other: there is no
moderation queue, no reporting, and no admin role, because there is no one to escalate
to. The instance owner has the database.

## Checking the work

[docs/handoff/verifying-without-a-browser.md](handoff/verifying-without-a-browser.md),
and the run that proved this feature is recorded in
[docs/handoff/wandering-library/README.md](handoff/wandering-library/README.md). The
checks worth re-running after any change here are the two that catch the most: a campaign
carrying a row in every excluded table adopts with none of them, and an adopted hero's
species resolves to the adopter's own row rather than to `Unavailable`.
