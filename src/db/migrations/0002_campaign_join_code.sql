-- 0002: shareable join code per campaign.
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

ALTER TABLE "campaigns" ADD COLUMN "join_code" TEXT;

UPDATE "campaigns"
SET "join_code" = lower(hex(randomblob(4)))
WHERE "join_code" IS NULL;

CREATE UNIQUE INDEX "campaigns_join_code_idx" ON "campaigns" ("join_code");
