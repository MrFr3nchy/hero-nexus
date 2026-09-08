'use server';

import { revalidatePath } from 'next/cache';

import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  listCharacters,
  RULES_ERROR,
  updateCharacter,
  type CharacterRow,
  type CharacterWithSheet,
} from '@/server/characters';
import { listPickableContent, resolveContentRefs } from '@/server/content';
import type { ContentEntry, ContentRef, ContentType } from '@/@shared/content';
import { loadBuildCatalog, loadClassDef } from './lib/srd/catalog';
import type { BuildCatalog, ClassDef } from './lib/srd/types';
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

  // A rules refusal is already a sentence written for the player — which table
  // and which rule. Mapping it to "Failed to save character." is how the one
  // thing they need to know got thrown away.
  if (code.startsWith(RULES_ERROR)) return code.slice(RULES_ERROR.length);

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
 *
 * The campaign is passed along because a homebrew class may live only in that
 * table's library; without it, a class the player can see in the wizard would
 * resolve to nothing on the way back.
 */
export async function getClassBuildAction(
  key: string,
  campaignId?: string
): Promise<ClassDef | null> {
  if (!key) return null;
  return loadClassDef(key, { campaignId });
}

/**
 * The wizard's options, for one table.
 *
 * The page loads this once for the campaign it opened with, but the campaign
 * picker sits inside the builder — switching tables has to fetch the new
 * table's library, or the player keeps being offered homebrew from the table
 * they just left.
 */
export async function getBuildCatalogAction(
  campaignId?: string
): Promise<BuildCatalog> {
  return loadBuildCatalog({ campaignId });
}

/**
 * Everything a player may add to a sheet, for one content type.
 *
 * Pass the campaign the character is being built for and its library comes
 * along — that is how approved homebrew reaches a character.
 */
export async function listPickableContentAction(
  type: ContentType,
  campaignId?: string
): Promise<ContentEntry[]> {
  return listPickableContent(type, campaignId);
}

/** Stats for the refs already on a sheet, so it can render its own content. */
export async function resolveContentAction(
  refs: ContentRef[]
): Promise<ContentEntry[]> {
  const resolved = await resolveContentRefs(refs);
  return [...resolved.values()];
}
