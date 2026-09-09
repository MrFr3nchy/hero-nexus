# The Wandering Library — phases

Build order. Each phase leaves the app usable. `[x]` = landed on
`feat/wandering-library`; `[ ]` = not yet.

The model these tasks implement is in [README.md](README.md). Read it first — several
of these tasks are only correct in the light of a decision recorded there (why a
homebrew publication is live-linked and a campaign one is a snapshot; why withdrawing
does not break existing adoptions; why there is no user-level image store).

---

## Phase 1 — Foundations

- [ ] `src/db/migrations/0029_publications.sql` + the matching `schema.ts` definitions,
      in the same commit (`src/db/README.md`, the rule that gets broken most).
      Tables: `publications`, `publication_items`.
- [ ] `src/server/library.ts` — `publish`, `updatePublication`, `withdraw`, `relist`,
      `listPublications` (filters: kind, content type, tag, query), `getPublication`.
      Ownership checks on every write; `requireUserId` on nothing that only reads a
      public shelf.
- [ ] Freezing: `freezeHomebrew(row)` produces the `payload` a listing renders from
      when its live row is gone. Validated through `parseContentData` on the way out,
      same as everywhere else.
- [ ] `src/@creator/library/actions.ts` — server actions over the above.
- [ ] Publish control in the Forge: a homebrew row gains "Publish to the Library" with
      a title/blurb/tags sheet, and shows a `Ribbon` when it is listed.
- [ ] `/library` route: the listing as real cards (design-language archetype
      **Collection** — the shelf is the page, no rule, scene empty state).
- [ ] `/marketplace` redirects to `/library`; `SideNavigation` item renamed; the old
      `PublicHomebrewMarketplace` placeholder deleted, not left orphaned.
- [ ] A publication detail page at `/library/[id]` rendering the real `StatBlock`
      (content-model rule 5 — no second mini-renderer).

## Phase 2 — Adoption

- [ ] Migration `0030_adoptions.sql` + schema: `adoptions`.
- [ ] `src/server/adoptions.ts` — `adopt(publicationId, mode)`, `unadopt`,
      `listAdoptions`, `listAdoptedHomebrew`.
- [ ] `listShelfContent` gains its third source and starts returning
      `origin: 'shared'`. The seam described in `src/server/content.ts` is filled in
      one function, and no consumer changes.
- [ ] Forking: `forkHomebrew(publicationId)` mints the adopter's own row. Provenance
      column `homebrew.forked_from` (nullable, `set null`), migration in the same
      commit.
- [ ] `listPickableContent` includes adopted content, so an adopted species is
      buildable and an adopted item is submittable to a table for approval.
- [ ] The shelf's "yours to edit" affordance reads `origin`, and an adopted row offers
      "fork it" rather than an edit that would fail.
- [ ] Adoption count on a listing, from `adoptions`, not a denormalised counter.

## Phase 3 — Images

- [ ] Migration `0031_publication_assets.sql` + schema: `publication_assets`,
      `publications.cover_asset_id`.
- [ ] `src/server/library-assets.ts` — copy bytes into
      `UPLOADS_DIR/library/<publicationId>/`, delete them when a publication is deleted
      outright (not when it is merely withdrawn).
- [ ] `GET /api/library/[id]/assets/[assetId]` — public read, no campaign role check,
      because a published image is public by construction.
- [ ] Publish an image from a campaign's image panel; adopt one into a campaign you
      run, through a picker of your own campaigns.
- [ ] Cover images on every publication kind, from the same asset store.

## Phase 4 — Heroes

- [ ] `buildCharacterPackage(characterId)` — the sheet, plus every homebrew row its
      refs resolve to, as `publication_items`.
- [ ] Strip on the way out: `character_secrets`, sheet notes, the audit log and the
      history. A shared hero is a pregen, not a play record.
- [ ] `adoptCharacter` — mints homebrew rows the adopter owns for each bundled item,
      then rewrites the sheet's refs to point at them before the character is created.
      A ref left pointing at a stranger's `homebrew.id` renders `Unavailable`, which is
      the failure this task exists to prevent.
- [ ] The sheet goes through `migrate-sheet` and the character schema on the way in;
      a package from an older build must not be trusted to be shaped right.

## Phase 5 — Campaigns

- [ ] `buildCampaignPackage(campaignId)` — the allow-list in README.md, table by
      table, written as an explicit list so a new campaign-scoped table is opted **out**
      by default.
- [ ] `adoptCampaign` — mints a campaign the adopter runs: canon (both halves),
      collections and links, quests and objectives, notes, maps and pins, and the
      bundled homebrew, with every internal id remapped.
- [ ] Images referenced by canon or maps travel as `publication_assets` and are
      re-uploaded into the new campaign.
- [ ] No join code, no members, no characters. Asserted in the verification script
      against a campaign carrying a row in every excluded table.

## Phase 6 — Browse and prove

- [ ] Search and filters on `/library`: kind, content type, tag, free text; sort by
      newest and by most adopted.
- [ ] An author page — everything one account has published.
- [ ] `docs/sharing-model.md`, the binding contract, sibling to `content-model.md`;
      `CLAUDE.md` index row pointing at it.
- [ ] `docs/handoff/verifying-without-a-browser.md` gains the sharing checks, and the
      six proofs in README.md are run and their output recorded here.
