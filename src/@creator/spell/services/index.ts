import { HomebrewItem } from '@/app/creator/entities';
import {
  addDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  subscribeToCollection,
  updateDocument,
} from '@/lib/firestore';

export class SpellService {
  // Add a new spell
  async createSpell(spellData: HomebrewItem) {
    return addDocument('spells', spellData);
  }

  // Get all spells
  async getSpells() {
    return getDocuments('spells');
  }

  // Get a spell by ID
  async getSpell(spellId: string) {
    return getDocument('spells', spellId);
  }

  // Update a spell
  async updateSpell(spellId: string, spellData: HomebrewItem) {
    return updateDocument('spells', spellId, spellData);
  }

  // Delete a spell
  async deleteSpell(spellId: string) {
    return deleteDocument('spells', spellId);
  }

  // Listen to spell changes
  subscribeToSpells(
    callback: (_spells: Array<{ id: string; [key: string]: unknown }>) => void
  ) {
    return subscribeToCollection('spells', callback);
  }
}

// Export a singleton instance
export const spellService = new SpellService();
