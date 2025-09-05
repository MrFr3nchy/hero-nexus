import { HomebrewItem } from '@/app/creator/entities';
import {
  addDocument,
  deleteDocument,
  getDocument,
  getDocuments,
  subscribeToCollection,
  updateDocument,
} from '@/lib/firestore';

export class ClassService {
  // Add a new class
  async createClass(classData: HomebrewItem) {
    return addDocument('classes', classData);
  }

  // Get all classes
  async getClasses() {
    return getDocuments('classes');
  }

  // Get a class by ID
  async getClass(classId: string) {
    return getDocument('classes', classId);
  }

  // Update a class
  async updateClass(classId: string, classData: HomebrewItem) {
    return updateDocument('classes', classId, classData);
  }

  // Delete a class
  async deleteClass(classId: string) {
    return deleteDocument('classes', classId);
  }

  // Listen to class changes
  subscribeToClasses(
    callback: (_classes: Array<{ id: string; [key: string]: unknown }>) => void
  ) {
    return subscribeToCollection('classes', callback);
  }
}

// Export a singleton instance
export const classService = new ClassService();
