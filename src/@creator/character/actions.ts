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
    const message =
      err instanceof Error ? err.message : 'Failed to save character.';
    return { ok: false, error: message };
  }
}

export async function deleteCharacterAction(id: string): Promise<void> {
  await deleteCharacter(id);
  revalidatePath('/characters');
  revalidatePath('/dashboard');
}
