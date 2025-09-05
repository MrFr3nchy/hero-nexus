import { HomebrewItem } from '@/app/creator/entities';
import {
  addDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  subscribeToCollection,
  updateDocument,
} from '@/lib/firestore';

export class ItemService {
  // Add a new item
  async createItem(itemData: HomebrewItem) {
    return addDocument('items', itemData);
  }

  // Get all items
  async getItems() {
    return getDocuments('items');
  }

  // Get an item by ID
  async getItem(itemId: string) {
    return getDocument('items', itemId);
  }

  // Update an item
  async updateItem(itemId: string, itemData: HomebrewItem) {
    return updateDocument('items', itemId, itemData);
  }

  // Delete an item
  async deleteItem(itemId: string) {
    return deleteDocument('items', itemId);
  }

  // Listen to item changes
  subscribeToItems(
    callback: (_items: Array<{ id: string; [key: string]: unknown }>) => void
  ) {
    return subscribeToCollection('items', callback);
  }
}

// Export a singleton instance
export const itemService = new ItemService();
