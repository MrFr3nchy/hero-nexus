/**
 * How far a hero sees in the dark (improvements 08).
 *
 * The sheet has no vision field of its own — darkvision lives in species
 * prose — so a small map of the SRD species that have it, keyed the way
 * `identity.species` is written, gives a token its default `vision_feet` on
 * placement. A feat or a homebrew species sets `senses.darkvision` on the
 * sheet instead, and that wins. The same shape as `FOOTPRINT_BY_SIZE`: a
 * lookup, not a rule.
 *
 * Pure — no React, no DB.
 */

/** Feet of darkvision by species name, lower-cased. 2024 SRD. */
const DARKVISION_BY_SPECIES: Record<string, number> = {
  dwarf: 120,
  elf: 60,
  gnome: 60,
  orc: 120,
  tiefling: 60,
  drow: 120,
  'deep gnome': 120,
  duergar: 120,
  'half-elf': 60,
  'half-orc': 60,
  aasimar: 60,
  goliath: 0,
  dragonborn: 60,
};

/**
 * A hero's darkvision in feet, or null for normal sight: the sheet's own
 * `senses.darkvision` when set, else the species' default. "Wood Elf" and
 * "High Elf" both read as elf.
 */
export function heroDarkvision(sheet: {
  identity: { species: string };
  senses?: { darkvision?: number | null };
}): number | null {
  const own = sheet.senses?.darkvision;
  if (typeof own === 'number' && own > 0) return own;
  const species = sheet.identity.species.trim().toLowerCase();
  if (!species) return null;
  for (const [name, feet] of Object.entries(DARKVISION_BY_SPECIES)) {
    if (feet > 0 && new RegExp(`\\b${name}\\b`).test(species)) return feet;
  }
  return null;
}
