import 'server-only';

import { and, desc, eq, inArray, or } from 'drizzle-orm';

import {
  fromHomebrew,
  parseContentData,
  type ContentEntry,
} from '@/@shared/content';

import { requireUserId } from './session-user';
import { db } from '@/db';
import {
  adoptions,
  campaignHomebrew,
  campaignMembers,
  campaigns,
  characterHomebrew,
  characters,
  homebrew,
} from '@/db/schema';

/**
 * Homebrew rows are typed content, not free text.
 *
 * `HomebrewType` covers every kind the `homebrew.type` enum declares — it used
 * to be three, which left `species`, `subclass`, `background` and `feat`
 * authorable nowhere even though the approval queue could receive them.
 * `data` is validated against that type's schema in `@/@shared/content` on
 * every write, so a malformed blob never reaches a stat block.
 */
export type HomebrewType =
  | 'class'
  | 'subclass'
  | 'species'
  | 'background'
  | 'feat'
  | 'spell'
  | 'item'
  | 'creature'
  | 'rule';

/**
 * There is deliberately no `listPublicHomebrew` here.
 *
 * `visibility` used to be the whole of "shared", read by nothing — the market
 * was a placeholder. Since the Wandering Library landed, a listing in
 * `publications` is what makes content public, and `@/server/library` is the one
 * place that answers "what has been shared". A second answer that reads the flag
 * alone would list a row whose listing was withdrawn, which is the bug this
 * comment exists to stop somebody re-adding.
 */
export interface HomebrewRow {
  id: string;
  ownerId: string;
  type: HomebrewType;
  name: string;
  description: string;
  data: unknown;
  visibility: 'private' | 'public';
  rpgSystem: string;
  createdAt: string;
  updatedAt: string;
}

export interface HomebrewInput {
  type: HomebrewType;
  name: string;
  description?: string;
  data?: unknown;
  visibility?: 'private' | 'public';
  rpgSystem?: string;
}

/** A homebrew row as content the rest of the app can render and attach. */
export function toContentEntry(row: HomebrewRow): ContentEntry | null {
  return fromHomebrew(row);
}

export function toContentEntries(rows: HomebrewRow[]): ContentEntry[] {
  return rows.map(toContentEntry).filter((e): e is ContentEntry => e !== null);
}

export async function listHomebrew(
  type?: HomebrewType
): Promise<HomebrewRow[]> {
  const userId = await requireUserId();
  const where = type
    ? and(eq(homebrew.ownerId, userId), eq(homebrew.type, type))
    : eq(homebrew.ownerId, userId);
  return db
    .select()
    .from(homebrew)
    .where(where)
    .orderBy(desc(homebrew.updatedAt)) as Promise<HomebrewRow[]>;
}

/** Several rows by id, for resolving the refs a sheet or a library holds. */
export async function getHomebrewByIds(ids: string[]): Promise<HomebrewRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(homebrew).where(inArray(homebrew.id, ids)) as Promise<
    HomebrewRow[]
  >;
}

/**
 * Which of these homebrew rows a user may read.
 *
 * `getHomebrewByIds` does not check, because most of its callers have already
 * authorized the character or campaign they are reading for. A caller that
 * takes refs straight from the browser has authorized nothing, so it asks
 * here first. A user can read a row when:
 *
 * - they own it, or it is public;
 * - they adopted it linked from the Wandering Library;
 * - it is in play at a campaign they run or are an active member of;
 * - a character they own uses it.
 */
export async function readableHomebrewIds(
  userId: string,
  ids: string[]
): Promise<Set<string>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Set();

  const [direct, adopted, inPlay, onSheets] = await Promise.all([
    db
      .select({ id: homebrew.id })
      .from(homebrew)
      .where(
        and(
          inArray(homebrew.id, wanted),
          or(eq(homebrew.ownerId, userId), eq(homebrew.visibility, 'public'))
        )
      ),
    db
      .select({ id: adoptions.homebrewId })
      .from(adoptions)
      .where(
        and(
          eq(adoptions.userId, userId),
          eq(adoptions.mode, 'linked'),
          inArray(adoptions.homebrewId, wanted)
        )
      ),
    db
      .selectDistinct({ id: campaignHomebrew.homebrewId })
      .from(campaignHomebrew)
      .innerJoin(campaigns, eq(campaigns.id, campaignHomebrew.campaignId))
      .leftJoin(
        campaignMembers,
        and(
          eq(campaignMembers.campaignId, campaignHomebrew.campaignId),
          eq(campaignMembers.userId, userId),
          eq(campaignMembers.status, 'active')
        )
      )
      .where(
        and(
          inArray(campaignHomebrew.homebrewId, wanted),
          or(eq(campaigns.gmId, userId), eq(campaignMembers.userId, userId))
        )
      ),
    db
      .selectDistinct({ id: characterHomebrew.homebrewId })
      .from(characterHomebrew)
      .innerJoin(characters, eq(characters.id, characterHomebrew.characterId))
      .where(
        and(
          eq(characters.ownerId, userId),
          inArray(characterHomebrew.homebrewId, wanted)
        )
      ),
  ]);

  const out = new Set<string>();
  for (const row of [...direct, ...adopted, ...inPlay, ...onSheets])
    if (row.id) out.add(row.id);
  return out;
}

export async function createHomebrew(input: HomebrewInput): Promise<string> {
  const userId = await requireUserId();
  const [row] = await db
    .insert(homebrew)
    .values({
      ownerId: userId,
      type: input.type,
      name: input.name,
      description: input.description ?? '',
      data: parseContentData(input.type, input.data),
      visibility: input.visibility ?? 'private',
      rpgSystem: input.rpgSystem ?? 'dnd5e2024',
    })
    .returning({ id: homebrew.id });
  return row.id;
}

export async function updateHomebrew(
  id: string,
  input: Partial<HomebrewInput>
): Promise<void> {
  const userId = await requireUserId();

  // `data` is validated against the row's *final* type, which may be changing
  // in this same update — a spell edited into an item must not keep spell data.
  const patch: Record<string, unknown> = { ...input };
  if (input.data !== undefined) {
    const existing = await db.query.homebrew.findFirst({
      where: and(eq(homebrew.id, id), eq(homebrew.ownerId, userId)),
      columns: { type: true },
    });
    const type = input.type ?? (existing?.type as HomebrewType | undefined);
    if (!type) throw new Error('NOT_FOUND');
    patch.data = parseContentData(type, input.data);
  }

  const result = await db
    .update(homebrew)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(and(eq(homebrew.id, id), eq(homebrew.ownerId, userId)))
    .returning({ id: homebrew.id });
  if (result.length === 0) throw new Error('NOT_FOUND');
}

export async function deleteHomebrew(id: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(homebrew)
    .where(and(eq(homebrew.id, id), eq(homebrew.ownerId, userId)));
}
