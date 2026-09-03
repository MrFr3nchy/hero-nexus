/**
 * Sheet sections a DM comment can hang under, and the visibility levels notes
 * and secrets use.
 *
 * Kept out of `@/server/sheet-notes` so client components can import these
 * without reaching into a `server-only` module: the DM's view, the player's
 * view and the server all address a section by the same string.
 */

export const NOTE_SECTIONS = [
  'identity',
  'combat',
  'abilities',
  'skills',
  'spellcasting',
  'proficiencies',
  'details',
  'equipment',
] as const;

export type NoteSection = (typeof NOTE_SECTIONS)[number];

export const SECTION_LABEL: Record<NoteSection, string> = {
  identity: 'Identity',
  combat: 'Combat',
  abilities: 'Ability scores',
  skills: 'Skills',
  spellcasting: 'Spellcasting',
  proficiencies: 'Proficiencies & languages',
  details: 'Details',
  equipment: 'Equipment & currency',
};

/** 'shared' = the owning player sees the note; 'dm' = staff only. */
export type NoteVisibility = 'shared' | 'dm';

/** How far a secret has been let out: staff, that player, or the whole table. */
export type SecretVisibility = 'dm' | 'player' | 'party';

export interface SheetNoteRow {
  id: string;
  section: NoteSection;
  body: string;
  visibility: NoteVisibility;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecretRow {
  id: string;
  body: string;
  visibility: SecretVisibility;
  authorRole: 'gm' | 'player';
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when the viewer may remove it: their own player-written entry. */
  canDelete: boolean;
}
