import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/db';
import { homebrew } from '@/db/schema';

export type HomebrewType = 'class' | 'spell' | 'item';

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

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error('NOT_AUTHENTICATED');
  return id;
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

export async function listPublicHomebrew(
  type?: HomebrewType
): Promise<HomebrewRow[]> {
  const where = type
    ? and(eq(homebrew.visibility, 'public'), eq(homebrew.type, type))
    : eq(homebrew.visibility, 'public');
  return db
    .select()
    .from(homebrew)
    .where(where)
    .orderBy(desc(homebrew.updatedAt)) as Promise<HomebrewRow[]>;
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
      data: input.data ?? {},
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
  const result = await db
    .update(homebrew)
    .set({ ...input, updatedAt: new Date().toISOString() })
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
