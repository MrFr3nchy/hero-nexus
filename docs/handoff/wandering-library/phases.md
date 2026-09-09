# The Wandering Library — phases

Build order. Each phase leaves the app usable. `[x]` = landed on
`feat/wandering-library`. All six phases are built and proved; the boxes are kept as the
record of what each set out to do.

The model these tasks implement is in [README.md](README.md). Read it first — several
of these tasks are only correct in the light of a decision recorded there (why a
homebrew publication is live-linked and a campaign one is a snapshot; why withdrawing
does not break existing adoptions; why there is no user-level image store).

---

## Phase 1 — Foundations

- [x] `src/db/migrations/0029_wandering_library.sql` + the matching `schema.ts` definitions,
      in the same commit (`src/db/README.md`, the rule that gets broken most).
      Tables: `publications`, `publication_items`.
- [x] `src/server/library.ts` — `publish`, `updatePublication`, `withdraw`, `relist`,
      `listPublications` (filters: kind, content type, tag, query), `getPublication`.
      Ownership checks on every write; `requireUserId` on nothing that only reads a
      public shelf.
- [x] Freezing: `freezeHomebrew(row)` produces the `payload` a listing renders from
      when its live row is gone. Validated through `parseContentData` on the way out,
      same as everywhere else.
- [x] `src/@creator/library/actions.ts` — server actions over the above.
- [x] Publish control in the Forge: a homebrew row gains "Publish to the Library" with
      a title/blurb/tags sheet, and shows a `Ribbon` when it is listed.
- [x] `/library` route: the listing as real cards (design-language archetype
      **Collection** — the shelf is the page, no rule, scene empty state).
- [x] `/marketplace` redirects to `/library`; `SideNavigation` item renamed; the old
      `PublicHomebrewMarketplace` placeholder deleted, not left orphaned.
- [x] A publication detail page at `/library/[id]` rendering the real `StatBlock`
      (content-model rule 5 — no second mini-renderer).

## Phase 2 — Adoption

- [x] `adoptions` landed in `0029` rather than in its own migration: the shelf shows an
      adoption count from the first commit, and a phase that lit that field up later
      would have shipped a zero nobody could explain. `0030` became the
      `homebrew.visibility` backfill instead.
- [x] `src/server/adoptions.ts` — `adopt`, `fork`, `unadopt`, `listAdoptions`,
      `listAdoptedContent`. `adopt` takes a target campaign for the picture kind, which
      is the one kind that has to be told where it is going.
- [x] `listShelfContent` gains its third source and starts returning
      `origin: 'shared'`. The seam described in `src/server/content.ts` is filled in
      one function, and no consumer changes.
- [x] Forking: `fork(publicationId)` mints the adopter's own row. Provenance column
      `homebrew.forked_from` (nullable, no reference — SQLite cannot add one by ALTER,
      and the listing it names belongs to another account).
- [x] `listPickableContent` includes adopted content, so an adopted species is
      buildable and an adopted item is submittable to a table for approval.
- [x] The shelf's "yours to edit" affordance reads `origin`, and an adopted row offers
      "fork it" rather than an edit that would fail.
- [x] Adoption count on a listing, from `adoptions`, not a denormalised counter.

## Phase 3 — Images

- [x] `0031_publication_assets.sql` + schema: `publication_assets`,
      `publications.cover_asset_id`.
- [x] `src/server/library-assets.ts` — copy bytes into
      `UPLOADS_DIR/library/<publicationId>/`, delete them when a publication is deleted
      outright (not when it is merely withdrawn).
- [x] `GET /api/library/[id]/assets/[assetId]` — public read, no campaign role check,
      because a published image is public by construction.
- [x] Publish an image from a campaign's image panel; adopt one into a campaign you
      run, through a picker of your own campaigns.
- [x] Cover images on every publication kind, from the same asset store.

## Phase 4 — Heroes

- [x] `publishCharacter(characterId, input)` — the sheet, plus every homebrew row its
      refs resolve to, as `publication_items`. Only the author's _own_ rows: content that
      reached their sheet through a campaign library is somebody else's to publish.
- [x] Strip on the way out: `character_secrets`, sheet notes, the audit log and the
      history. A shared hero is a pregen, not a play record.
- [x] `adoptCharacter` — mints homebrew rows the adopter owns for each bundled item,
      then rewrites the sheet's refs to point at them before the character is created.
      A ref left pointing at a stranger's `homebrew.id` renders `Unavailable`, which is
      the failure this task exists to prevent.
- [x] The sheet goes through `migrate-sheet` and the character schema on the way in;
      a package from an older build must not be trusted to be shaped right.
- [x] `publications.character_id`, uniquely indexed (`0032`), so publishing the same hero
      twice edits the listing that exists. Not a live link: a snapshot does not track its
      source.

## Phase 5 — Campaigns

- [x] `buildCampaignPackage(campaignId)` — the allow-list in README.md, table by
      table, written as an explicit list so a new campaign-scoped table is opted **out**
      by default.
- [x] `adoptCampaign` — mints a campaign the adopter runs: canon (both halves),
      collections and links, quests and objectives, notes, maps and pins, and the
      bundled homebrew, with every internal id remapped.
- [x] Images referenced by canon or maps travel as `publication_assets` and are
      re-uploaded into the new campaign.
- [x] No join code, no members, no characters. Asserted against a campaign carrying a
      row in every excluded table — see the proof run.
- [x] `publications.campaign_id`, uniquely indexed (`0032`), for the same reason as the
      hero's.

## Phase 6 — Browse and prove

- [x] Search and filters on `/library`: kind, content type, tag, free text; sort by
      newest and by most adopted.
- [x] An author's shelf, reached by clicking a credit rather than as a route of its own:
      the filter already existed server-side, and a second page would have been a second
      place to render the same cards.
- [x] `docs/sharing-model.md`, the binding contract, sibling to `content-model.md`;
      `CLAUDE.md` index row pointing at it.
- [x] The six proofs in README.md were run against a production build with three real
      accounts. Results are recorded in [README.md](README.md#the-proof-run).
