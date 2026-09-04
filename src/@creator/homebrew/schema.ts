import { z } from 'zod';

import type { GlyphName } from '@/@shared/components/ui/Glyph';

export const HOMEBREW_TYPES = [
  {
    id: 'class',
    name: 'Class',
    glyph: 'crossed-swords',
    description: 'Character classes',
  },
  { id: 'spell', name: 'Spell', glyph: 'orb', description: 'Magical spells' },
  {
    id: 'item',
    name: 'Item',
    glyph: 'shield',
    description: 'Equipment and items',
  },
] as const satisfies readonly {
  id: string;
  name: string;
  glyph: GlyphName;
  description: string;
}[];

/**
 * Every kind of homebrew a campaign can be asked to approve. Wider than
 * `HOMEBREW_TYPES`, which is only what the Forge can author today — an
 * approval row can still carry a species or a feat submitted elsewhere.
 */
export const HOMEBREW_GLYPHS: Record<string, GlyphName> = {
  class: 'crossed-swords',
  spell: 'orb',
  item: 'shield',
  species: 'helix',
  subclass: 'crown',
  background: 'scroll',
  feat: 'star',
};

/** The glyph for a homebrew kind, falling back for anything unrecognised. */
export function homebrewGlyph(type: string): GlyphName {
  return HOMEBREW_GLYPHS[type] ?? 'notebook';
}

export const homebrewSchema = z.object({
  type: z.enum(['class', 'spell', 'item']),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(4000).default(''),
  visibility: z.enum(['private', 'public']).default('private'),
  rpgSystem: z.string().max(40).default('dnd5e2024'),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type HomebrewFormValues = z.infer<typeof homebrewSchema>;
