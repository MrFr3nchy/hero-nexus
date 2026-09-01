/**
 * Back-compat shim. The real implementation is server actions in
 * `../actions.ts` backed by `src/server/characters.ts` (SQLite via Drizzle).
 */
import {
  deleteCharacterAction,
  getCharacterAction,
  listCharactersAction,
  saveCharacterAction,
} from '../actions';
import type { CharacterSheet } from '../schema';

export const characterService = {
  getCharacters: () => listCharactersAction(),
  getCharacter: (id: string) => getCharacterAction(id),
  createCharacter: (sheet: CharacterSheet) => saveCharacterAction(sheet),
  updateCharacter: (id: string, sheet: CharacterSheet) =>
    saveCharacterAction(sheet, id),
  deleteCharacter: (id: string) => deleteCharacterAction(id),
};

export type CharacterService = typeof characterService;
