-- 0029: the Wandering Library — publishing, and taking.
--
--   publications      — one listing per thing somebody put on the public shelf.
--   publication_items — the pieces a listing carries, for the ones that carry
--                       more than one thing (a hero and the species it needs,
--                       a campaign and everything in it).
--   adoptions         — what a reader took, and how they took it.
--
-- Until now every piece of work an account made was private to it, and
-- `homebrew.visibility = 'public'` was a column nothing read. This is the
-- first table in the schema that exists so one user's rows can reach another
-- user's account.
--
-- The load-bearing distinction is `kind`, because it decides how the thing
-- behind a listing is delivered:
--
--   'homebrew'                     — live-linked. `homebrew_id` points at the
--                                    author's live row, so their later
--                                    correction reaches every table using it.
--                                    This is content-model rule 1 (a copy is a
--                                    fork) applied across accounts.
--   'character' / 'campaign' /     — a snapshot. `payload` is frozen and
--   'image' / 'bundle'               adopting mints rows the adopter owns
--                                    outright. A sheet and a campaign are
--                                    mutable play state; a shared one is a
--                                    pregen and a module, and nobody wants
--                                    their prep rewritten under them
--                                    mid-session because the author kept
--                                    editing.
--
-- `payload` is filled for both. On the live kind it is the fallback: a
-- withdrawn or deleted homebrew row still renders as what it was rather than
-- as a blank card — the same reason `inventory[].name` is denormalised onto a
-- character sheet.
--
-- `credit` is frozen at publish time on purpose. It is who wrote the thing as
-- the shelf should say it, not a join on `user.name` that rewrites history
-- when somebody renames their account, and it survives the author deleting it.
--
-- `status = 'withdrawn'` takes a listing off the shelf and stops new
-- adoptions. It deliberately does not reach into anybody's existing adoption:
-- cascading a delete into other users' characters would be worse than saying
-- plainly that this app cannot un-share a thing.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

CREATE TABLE "publications" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "owner_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kind"         TEXT NOT NULL
                 CHECK ("kind" IN ('homebrew', 'character', 'campaign', 'image', 'bundle')),
  -- The live row, for the live-linked kind only. SET NULL rather than CASCADE:
  -- deleting the homebrew leaves the listing rendering its frozen payload,
  -- which is what an adopter's shelf falls back to as well.
  "homebrew_id"  TEXT REFERENCES "homebrew"("id") ON DELETE SET NULL,
  -- The narrow content type when the listing is about one piece of content
  -- ('spell', 'item', …). Kept beside `kind` so the shelf can filter to
  -- spells without unpacking a payload per row.
  "content_type" TEXT,
  "title"        TEXT NOT NULL,
  "summary"      TEXT NOT NULL DEFAULT '',
  -- JSON array of lowercase strings. Searched with LIKE, which is honest at
  -- this scale and cheaper than a join table nothing else needs.
  "tags"         TEXT NOT NULL DEFAULT '[]',
  -- Who wrote it, as the shelf says it. Frozen: see the note above.
  "credit"       TEXT NOT NULL DEFAULT '',
  "visibility"   TEXT NOT NULL DEFAULT 'public'
                 CHECK ("visibility" IN ('public', 'unlisted')),
  "status"       TEXT NOT NULL DEFAULT 'listed'
                 CHECK ("status" IN ('listed', 'withdrawn')),
  -- The frozen thing. Filled for every kind; the fallback for the live one.
  "payload"      TEXT NOT NULL DEFAULT '{}',
  -- Bumped whenever the author re-freezes. An adopter can see that what they
  -- took is behind what is on the shelf now.
  "version"      INTEGER NOT NULL DEFAULT 1,
  "created_at"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "publications_owner_idx" ON "publications" ("owner_id");
CREATE INDEX "publications_shelf_idx"
  ON "publications" ("status", "visibility", "kind");
CREATE INDEX "publications_content_type_idx" ON "publications" ("content_type");
-- One listing per homebrew row. Publishing the same spell twice is an edit of
-- the listing that exists, not a second stall selling the same thing.
CREATE UNIQUE INDEX "publications_homebrew_idx"
  ON "publications" ("homebrew_id") WHERE "homebrew_id" IS NOT NULL;

CREATE TABLE "publication_items" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "publication_id" TEXT NOT NULL REFERENCES "publications"("id") ON DELETE CASCADE,
  -- What this piece is. A campaign package is mostly 'homebrew' and 'canon'
  -- rows; a hero package is the sheet plus the homebrew its refs resolve to.
  "kind"           TEXT NOT NULL
                   CHECK ("kind" IN ('homebrew', 'character', 'canon', 'quest', 'note', 'map', 'image')),
  -- The content type for a 'homebrew' item, so an adopter's shelf can be told
  -- what a bundle would add to it without parsing every payload.
  "content_type"   TEXT,
  "name"           TEXT NOT NULL DEFAULT '',
  -- The piece, frozen. Items are always snapshots even inside a live-linked
  -- publication: a bundled species has to keep working when the author
  -- reorganises their own forge.
  "payload"        TEXT NOT NULL DEFAULT '{}',
  -- Its id in the package, so refs between items survive being remapped on the
  -- way into an adopter's account. Not a row id: it is only unique in here.
  "local_key"      TEXT NOT NULL DEFAULT '',
  "sort_order"     INTEGER NOT NULL DEFAULT 0,
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "publication_items_publication_idx"
  ON "publication_items" ("publication_id");
CREATE UNIQUE INDEX "publication_items_local_key_idx"
  ON "publication_items" ("publication_id", "local_key");

-- Adoptions: what a reader took, and how they took it.
--
-- Two modes, and the difference is the whole point:
--
--   'linked' — the reader's shelf shows the author's live row. The author's
--              correction reaches them; it is not theirs to edit.
--   'forked' — the reader got their own copy, theirs to edit, and the two
--              never speak again. The escape hatch for "nearly right".
--
-- Snapshot kinds are always effectively a fork: adopting mints characters,
-- campaigns and images the reader owns. The row survives as provenance and as
-- the count on the listing — which is counted from here rather than kept as a
-- column on `publications`, because a denormalised counter is a number that
-- can be wrong and this one has no reason to be.
--
-- One adoption per reader per listing. Taking the same thing twice is not two
-- copies of it.

CREATE TABLE "adoptions" (
  "id"             TEXT PRIMARY KEY NOT NULL,
  "user_id"        TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "publication_id" TEXT NOT NULL REFERENCES "publications"("id") ON DELETE CASCADE,
  "mode"           TEXT NOT NULL DEFAULT 'linked'
                   CHECK ("mode" IN ('linked', 'forked')),
  -- What the adoption resolves to on the reader's shelf: the author's row for a
  -- link, the reader's own for a fork. SET NULL, never CASCADE — losing the
  -- content must not erase the record that it was taken.
  "homebrew_id"    TEXT REFERENCES "homebrew"("id") ON DELETE SET NULL,
  -- What a snapshot adoption minted, for the kinds that mint something.
  "character_id"   TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "campaign_id"    TEXT REFERENCES "campaigns"("id") ON DELETE SET NULL,
  -- The listing's version at the moment it was taken, so a reader can be told
  -- that what they have is behind what is on the shelf now.
  "version"        INTEGER NOT NULL DEFAULT 1,
  "created_at"     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "adoptions_user_publication_idx"
  ON "adoptions" ("user_id", "publication_id");
CREATE INDEX "adoptions_publication_idx" ON "adoptions" ("publication_id");
CREATE INDEX "adoptions_user_idx" ON "adoptions" ("user_id");

-- Where a forked row came from.
--
-- No REFERENCES, following 0011 and 0028: SQLite cannot add a foreign key by
-- ALTER, and the row this points at belongs to another account that may delete
-- it. A dangling provenance line should read as "forked from something that is
-- gone", not break the fork.
ALTER TABLE "homebrew" ADD COLUMN "forked_from" TEXT;
