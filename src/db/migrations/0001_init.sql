-- 0001_init: auth + core app tables.
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

PRAGMA foreign_keys = ON;

/* ---------------- Auth.js (Drizzle adapter) ---------------- */

CREATE TABLE "user" (
  "id"            TEXT PRIMARY KEY NOT NULL,
  "name"          TEXT,
  "email"         TEXT NOT NULL,
  "emailVerified" INTEGER,
  "image"         TEXT,
  "password_hash" TEXT,
  "created_at"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "user_email_unique" ON "user" ("email");

CREATE TABLE "account" (
  "userId"            TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type"              TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token"     TEXT,
  "access_token"      TEXT,
  "expires_at"        INTEGER,
  "token_type"        TEXT,
  "scope"             TEXT,
  "id_token"          TEXT,
  "session_state"     TEXT,
  PRIMARY KEY ("provider", "providerAccountId")
);

CREATE TABLE "session" (
  "sessionToken" TEXT PRIMARY KEY NOT NULL,
  "userId"       TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "expires"      INTEGER NOT NULL
);

CREATE TABLE "verificationToken" (
  "identifier" TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "expires"    INTEGER NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

/* ---------------- App tables ---------------- */

CREATE TABLE "characters" (
  "id"         TEXT PRIMARY KEY NOT NULL,
  "owner_id"   TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name"       TEXT NOT NULL,
  "class"      TEXT NOT NULL DEFAULT '',
  "species"    TEXT NOT NULL DEFAULT '',
  "level"      INTEGER NOT NULL DEFAULT 1,
  "background" TEXT NOT NULL DEFAULT '',
  "rpg_system" TEXT NOT NULL DEFAULT 'dnd5e2024',
  "sheet"      TEXT NOT NULL,
  "created_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "characters_owner_id_idx" ON "characters" ("owner_id");

CREATE TABLE "homebrew" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "owner_id"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "data"        TEXT NOT NULL DEFAULT '{}',
  "visibility"  TEXT NOT NULL DEFAULT 'private',
  "rpg_system"  TEXT NOT NULL DEFAULT 'dnd5e2024',
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX "homebrew_owner_id_idx" ON "homebrew" ("owner_id");
CREATE INDEX "homebrew_type_visibility_idx" ON "homebrew" ("type", "visibility");

CREATE TABLE "campaigns" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "gm_id"       TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "settings"    TEXT NOT NULL DEFAULT '{}',
  "status"      TEXT NOT NULL DEFAULT 'active',
  "created_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "updated_at"  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE "campaign_members" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "campaign_id"  TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "user_id"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "character_id" TEXT REFERENCES "characters"("id") ON DELETE SET NULL,
  "role"         TEXT NOT NULL DEFAULT 'player',
  "status"       TEXT NOT NULL DEFAULT 'active',
  "joined_at"    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX "campaign_members_campaign_user_idx"
  ON "campaign_members" ("campaign_id", "user_id");

CREATE TABLE "campaign_invites" (
  "id"                  TEXT PRIMARY KEY NOT NULL,
  "campaign_id"         TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "invited_user_id"     TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "invited_by_user_id"  TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "status"              TEXT NOT NULL DEFAULT 'pending',
  "expires_at"          TEXT,
  "created_at"          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE "homebrew_approvals" (
  "id"                     TEXT PRIMARY KEY NOT NULL,
  "campaign_id"            TEXT NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "homebrew_id"            TEXT NOT NULL REFERENCES "homebrew"("id") ON DELETE CASCADE,
  "requested_by_user_id"   TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "status"                 TEXT NOT NULL DEFAULT 'pending',
  "reviewed_by_user_id"    TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "review_notes"           TEXT,
  "created_at"             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  "reviewed_at"            TEXT
);

CREATE TABLE "reference_data" (
  "category" TEXT NOT NULL,
  "slug"     TEXT NOT NULL,
  "name"     TEXT NOT NULL,
  "data"     TEXT NOT NULL,
  PRIMARY KEY ("category", "slug")
);

CREATE TABLE "rpg_systems" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "name"        TEXT NOT NULL,
  "version"     TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT ''
);
