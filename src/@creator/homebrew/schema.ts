import { z } from 'zod';

import {
  CONTENT_REGISTRY,
  CONTENT_TYPES,
  CONTENT_TYPE_ORDER,
  contentGlyph,
} from '@/@shared/content';
import type { GlyphName } from '@/@shared/components/ui/Glyph';

/**
 * Every kind of homebrew the Forge can author.
 *
 * This used to be three (class, spell, item) beside a wider `HOMEBREW_GLYPHS`
 * map, because the approval queue could receive a species the Forge could not
 * make. Both lists now come from `@/@shared/content`, so the Forge, the queue
 * and the character sheet cannot disagree about what types exist.
 */
export const HOMEBREW_TYPES = CONTENT_TYPE_ORDER.map(id => ({
  id,
  name: CONTENT_REGISTRY[id].label,
  glyph: CONTENT_REGISTRY[id].glyph,
  description: CONTENT_REGISTRY[id].description,
})) satisfies readonly {
  id: string;
  name: string;
  glyph: GlyphName;
  description: string;
}[];

/** The glyph for a homebrew kind, falling back for anything unrecognised. */
export const homebrewGlyph = contentGlyph;

export const homebrewSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(8000).default(''),
  visibility: z.enum(['private', 'public']).default('private'),
  rpgSystem: z.string().max(40).default('dnd5e2024'),
  /** Validated against the type's own schema server-side, on write. */
  data: z.unknown().default({}),
});

export type HomebrewFormValues = z.infer<typeof homebrewSchema>;
