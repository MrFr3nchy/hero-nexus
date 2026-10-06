import { describe, expect, it } from 'vitest';

import { heroDarkvision } from './vision';

const hero = (species: string, darkvision?: number | null) => ({
  identity: { species },
  senses: { darkvision },
});

describe('heroDarkvision', () => {
  it('reads the species', () => {
    expect(heroDarkvision(hero('Wood Elf'))).toBe(60);
    expect(heroDarkvision(hero('Mountain Dwarf'))).toBe(120);
    expect(heroDarkvision(hero('Human'))).toBeNull();
    expect(heroDarkvision(hero(''))).toBeNull();
  });

  it('prefers the longest name that matches', () => {
    // "Deep gnome" contains "gnome" (60) but is its own entry (120).
    expect(heroDarkvision(hero('Deep Gnome'))).toBe(120);
    expect(heroDarkvision(hero('Half-Orc'))).toBe(60);
  });

  it('lets the sheet win', () => {
    expect(heroDarkvision(hero('Human', 30))).toBe(30);
    expect(heroDarkvision(hero('Elf', 0))).toBe(60);
  });
});
