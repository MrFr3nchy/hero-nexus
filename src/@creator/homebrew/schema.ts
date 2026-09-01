import { z } from 'zod';

export const HOMEBREW_TYPES = [
  { id: 'class', name: 'Class', icon: '⚔️', description: 'Character classes' },
  { id: 'spell', name: 'Spell', icon: '🔮', description: 'Magical spells' },
  { id: 'item', name: 'Item', icon: '🛡️', description: 'Equipment and items' },
] as const;

export const homebrewSchema = z.object({
  type: z.enum(['class', 'spell', 'item']),
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(4000).default(''),
  visibility: z.enum(['private', 'public']).default('private'),
  rpgSystem: z.string().max(40).default('dnd5e2024'),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type HomebrewFormValues = z.infer<typeof homebrewSchema>;
