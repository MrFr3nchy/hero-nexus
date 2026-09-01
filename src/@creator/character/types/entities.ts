/** Lightweight row type for character lists / cards. */
export interface Character {
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

export interface RPGSystem {
  id: string;
  name: string;
  version: string;
  description: string;
}

// The full sheet shape now lives in the zod schema (single source of truth).
export type { CharacterSheet } from '../schema';
