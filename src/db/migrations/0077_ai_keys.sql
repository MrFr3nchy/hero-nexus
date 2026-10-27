-- A user's own AI provider key, for drafting homebrew and encounters.
--
-- One row per user: one provider at a time, which is all the settings page
-- offers. The key is never stored as typed. `key_sealed` is AES-256-GCM under
-- AI_KEY_SECRET (src/server/ai/seal.ts), and `key_hint` is its last four
-- characters, which is all any page ever shows of it.
--
-- Its own table rather than a column on "user", for the reason campaign_discord
-- is its own table: a credential should not ride along on every read of a row.
--
-- Hand-written to match src/db/schema.ts. Applied by src/db/migrate.ts.

CREATE TABLE "user_ai_keys" (
  "user_id" TEXT PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('openai','anthropic','gemini')),
  "model" TEXT NOT NULL,
  "key_sealed" TEXT NOT NULL,
  "key_hint" TEXT NOT NULL DEFAULT '',
  "last_error" TEXT,
  "updated_at" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
