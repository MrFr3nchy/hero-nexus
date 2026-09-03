'use server';

import { revalidatePath } from 'next/cache';

import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
  type CharacterRow,
  type CharacterWithSheet,
} from '@/server/characters';
import { loadClassDef } from './lib/srd/catalog';
import type { ClassDef } from './lib/srd/types';
import type { CharacterSheet } from './schema';

export async function listCharactersAction(): Promise<CharacterRow[]> {
  return listCharacters();
}

export async function getCharacterAction(
  id: string
): Promise<CharacterWithSheet | null> {
  return getCharacter(id);
}

export interface SaveCharacterResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const SAVE_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: 'You are not signed in.',
  SESSION_STALE: 'Your session is out of date. Sign in again.',
  NOT_FOUND: 'That character no longer exists.',
  FORBIDDEN: 'That character is not yours.',
};

/**
 * Raw driver errors used to reach the client verbatim, which is how a stale
 * session showed up in the UI as "FOREIGN KEY constraint failed".
 */
function saveError(err: unknown): string {
  const code = err instanceof Error ? err.message : '';
  const mapped = SAVE_ERRORS[code];
  if (!mapped) console.error('[action] Failed to save character.', err);
  return mapped ?? 'Failed to save character.';
}

export async function saveCharacterAction(
  sheet: CharacterSheet,
  id?: string
): Promise<SaveCharacterResult> {
  try {
    if (id) {
      await updateCharacter(id, sheet);
      revalidatePath('/characters');
      revalidatePath('/dashboard');
      return { ok: true, id };
    }
    const newId = await createCharacter(sheet);
    revalidatePath('/characters');
    revalidatePath('/dashboard');
    return { ok: true, id: newId };
  } catch (err) {
    return { ok: false, error: saveError(err) };
  }
}

export async function deleteCharacterAction(id: string): Promise<void> {
  await deleteCharacter(id);
  revalidatePath('/characters');
  revalidatePath('/dashboard');
}

/**
 * One class in full — features by level, spell slots, subclasses. Fetched when
 * the player picks a class rather than shipped with the page: the raw class
 * rows are ~280 KB of JSON and the builder only ever needs one of them.
 */
export async function getClassBuildAction(
  key: string
): Promise<ClassDef | null> {
  if (!key) return null;
  return loadClassDef(key);
}
