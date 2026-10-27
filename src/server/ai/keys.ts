import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { campaignMembers, campaigns, userAiKeys } from '@/db/schema';

import { rateLimit } from '../rate-limit';
import { requireUserId } from '../session-user';
import { defaultModel, listModels, type AiProvider } from './providers';
import { seal, sealingConfigured, unseal } from './seal';

/**
 * A user's AI key: saved, read back masked, used, removed.
 *
 * The key goes in and never comes out — nothing here returns it to a caller
 * that could hand it to the browser. `keyForDrafting` is the one function
 * that opens it, and it is not exported past `@/server/ai`.
 */

export interface AiSettings {
  /** False when the operator has not set `AI_KEY_SECRET`; nothing can be saved. */
  available: boolean;
  /** Whether this account may draft: it runs at least one table. */
  runsATable: boolean;
  key: {
    provider: AiProvider;
    model: string;
    /** The last four characters, for "ends in …". */
    hint: string;
    lastError: string | null;
    updatedAt: string;
  } | null;
}

/** Drafting is a DM's tool for now: the account must run a table. */
export async function runsATable(userId: string): Promise<boolean> {
  const [own] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.gmId, userId))
    .limit(1);
  if (own) return true;
  const [co] = await db
    .select({ id: campaignMembers.id })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.status, 'active'),
        inArray(campaignMembers.role, ['co-gm'])
      )
    )
    .limit(1);
  return Boolean(co);
}

export async function getAiSettings(): Promise<AiSettings> {
  const userId = await requireUserId();
  const row = await db.query.userAiKeys.findFirst({
    where: eq(userAiKeys.userId, userId),
  });
  return {
    available: sealingConfigured(),
    runsATable: await runsATable(userId),
    key: row
      ? {
          provider: row.provider,
          model: row.model,
          hint: row.keyHint,
          lastError: row.lastError,
          updatedAt: row.updatedAt,
        }
      : null,
  };
}

/** Listing models is an outbound call; a settings page should not loop on it. */
function limitListing(userId: string) {
  const hit = rateLimit(`ai-models:${userId}`, 20, 60 * 60_000);
  if (!hit.ok) throw new Error('AI_SLOW_DOWN');
}

/**
 * Check a key against its provider and keep it, sealed.
 *
 * The check is a model listing: a key that cannot list cannot draft, and the
 * list is what the model picker offers next. Returns that list.
 */
export async function saveAiKey(
  provider: AiProvider,
  apiKey: string
): Promise<{ models: string[]; model: string }> {
  const userId = await requireUserId();
  if (!sealingConfigured()) throw new Error('AI_NOT_CONFIGURED');
  limitListing(userId);

  const key = apiKey.trim();
  const models = await listModels(provider, key);
  if (models.length === 0) throw new Error('AI_NO_MODELS');
  const model = defaultModel(provider, models);

  const values = {
    provider,
    model,
    keySealed: seal(key, userId),
    keyHint: key.slice(-4),
    lastError: null,
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(userAiKeys)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userAiKeys.userId, set: values });
  return { models, model };
}

/** The models the saved key can use, asked of the provider now. */
export async function listAiModels(): Promise<string[]> {
  const userId = await requireUserId();
  limitListing(userId);
  const saved = await keyForDrafting(userId);
  return listModels(saved.provider, saved.apiKey);
}

export async function setAiModel(model: string): Promise<void> {
  const userId = await requireUserId();
  const result = await db
    .update(userAiKeys)
    .set({ model, updatedAt: new Date().toISOString() })
    .where(eq(userAiKeys.userId, userId))
    .returning({ userId: userAiKeys.userId });
  if (result.length === 0) throw new Error('AI_NO_KEY');
}

export async function removeAiKey(): Promise<void> {
  const userId = await requireUserId();
  await db.delete(userAiKeys).where(eq(userAiKeys.userId, userId));
}

/** The opened key. Server-side only, and only for the call it is made for. */
export async function keyForDrafting(userId: string): Promise<{
  provider: AiProvider;
  model: string;
  apiKey: string;
}> {
  const row = await db.query.userAiKeys.findFirst({
    where: eq(userAiKeys.userId, userId),
  });
  if (!row) throw new Error('AI_NO_KEY');
  return {
    provider: row.provider,
    model: row.model,
    apiKey: unseal(row.keySealed, userId),
  };
}

/** Kept on the row so the settings card can say why the last draft failed. */
export async function noteAiOutcome(
  userId: string,
  error: string | null
): Promise<void> {
  await db
    .update(userAiKeys)
    .set({ lastError: error })
    .where(eq(userAiKeys.userId, userId));
}
