/**
 * Homebrew service shim. Replaces the old identical class/item/spell Firestore
 * services with one module over server actions (SQLite via Drizzle).
 */
import {
  deleteHomebrewAction,
  listHomebrewAction,
  saveHomebrewAction,
} from '../actions';
import type { HomebrewType } from '@/server/homebrew';

export const homebrewService = {
  list: (type?: HomebrewType) => listHomebrewAction(type),
  save: (input: unknown, id?: string) => saveHomebrewAction(input, id),
  remove: (id: string) => deleteHomebrewAction(id),
};

export type HomebrewService = typeof homebrewService;
