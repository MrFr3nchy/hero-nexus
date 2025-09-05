import {
  addDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  subscribeToCollection,
  updateDocument,
} from '@/lib/firestore';
import { CharacterSheet } from '../types';

export class CharacterService {
  // Add a new character
  async createCharacter(characterData: CharacterSheet) {
    return addDocument('characters', characterData);
  }

  // Get all characters
  async getCharacters() {
    return getDocuments('characters');
  }

  // Get a character by ID
  async getCharacter(characterId: string) {
    return getDocument('characters', characterId);
  }

  // Update a character
  async updateCharacter(characterId: string, characterData: CharacterSheet) {
    return updateDocument('characters', characterId, characterData);
  }

  // Delete a character
  async deleteCharacter(characterId: string) {
    return deleteDocument('characters', characterId);
  }

  // Listen to character changes
  subscribeToCharacters(
    callback: (
      _characters: Array<{ id: string; [key: string]: unknown }>
    ) => void
  ) {
    return subscribeToCollection('characters', callback);
  }
}

// Export a singleton instance
export const characterService = new CharacterService();
