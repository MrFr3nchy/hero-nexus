-- 0030: make `homebrew.visibility` agree with the shelf.
--
-- Before 0029 that column was the whole of "shared" and was read by nothing:
-- the market was a placeholder, so a row could sit marked `public` without
-- being visible to a single other account. Now a row is public because it has a
-- listing in `publications`, and `@/server/library` sets the flag when one is
-- published or withdrawn.
--
-- Any row still marked public with no listing behind it is a leftover of the
-- old meaning. Left alone it would be a row claiming to be shared that nobody
-- can find, and the first thing to read the flag again would show it.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

UPDATE "homebrew"
   SET "visibility" = 'private'
 WHERE "visibility" = 'public'
   AND "id" NOT IN (
         SELECT "homebrew_id" FROM "publications"
          WHERE "homebrew_id" IS NOT NULL
            AND "status" = 'listed'
       );
