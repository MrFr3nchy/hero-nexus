import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/db';
import { characters } from '@/db/schema';
import {
  characterSheetSchema,
  type CharacterSheet,
} from '@/@creator/character/schema';

export interface CharacterRow {
  id: string;
  name: string;
  class: string;
  species: string;
  level: number;
  background: string;
  rpgSystem: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterWithSheet extends CharacterRow {
  sheet: CharacterSheet;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error('NOT_AUTHENTICATED');
  return id;
}

const listColumns = {
  id: characters.id,
  name: characters.name,
  class: characters.class,
  species: characters.species,
  level: characters.level,
  background: characters.background,
  rpgSystem: characters.rpgSystem,
  createdAt: characters.createdAt,
  updatedAt: characters.updatedAt,
};

export async function listCharacters(): Promise<CharacterRow[]> {
  const userId = await requireUserId();
  return db
    .select(listColumns)
    .from(characters)
    .where(eq(characters.ownerId, userId))
    .orderBy(desc(characters.updatedAt));
}

export async function getCharacter(
  id: string
): Promise<CharacterWithSheet | null> {
  const userId = await requireUserId();
  const row = await db.query.characters.findFirst({
    where: and(eq(characters.id, id), eq(characters.ownerId, userId)),
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    class: row.class,
    species: row.species,
    level: row.level,
    background: row.background,
    rpgSystem: row.rpgSystem,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sheet: characterSheetSchema.parse(row.sheet),
  };
}

function denormalize(sheet: CharacterSheet) {
  return {
    name: sheet.identity.name,
    class: sheet.identity.class,
    species: sheet.identity.species,
    level: sheet.identity.level,
    background: sheet.identity.background,
    rpgSystem: sheet.rpgSystem,
  };
}

export async function createCharacter(input: unknown): Promise<string> {
  const userId = await requireUserId();
  const sheet = characterSheetSchema.parse(input);
  const [row] = await db
    .insert(characters)
    .values({ ownerId: userId, ...denormalize(sheet), sheet })
    .returning({ id: characters.id });
  return row.id;
}

export async function updateCharacter(
  id: string,
  input: unknown
): Promise<void> {
  const userId = await requireUserId();
  const sheet = characterSheetSchema.parse(input);
  const result = await db
    .update(characters)
    .set({
      ...denormalize(sheet),
      sheet,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(characters.id, id), eq(characters.ownerId, userId)))
    .returning({ id: characters.id });
  if (result.length === 0) throw new Error('NOT_FOUND');
}

export async function deleteCharacter(id: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(characters)
    .where(and(eq(characters.id, id), eq(characters.ownerId, userId)));
}
