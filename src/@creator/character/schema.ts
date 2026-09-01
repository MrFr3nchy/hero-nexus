import { z } from 'zod';

/**
 * The character sheet schema is the single source of truth for the sheet shape.
 * `CharacterSheet` is inferred from it; the DB stores this JSON in
 * `characters.sheet`. Derived values (ability modifiers, proficiency bonus,
 * passive perception, spell save DC, spell attack bonus, initiative) are NOT
 * stored here — compute them with `./lib/derive`.
 */

export const ABILITY_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const SKILL_KEYS = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

/** skill -> governing ability */
export const SKILL_ABILITY: Record<SkillKey, AbilityKey> = {
  acrobatics: 'dexterity',
  animalHandling: 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  religion: 'intelligence',
  sleightOfHand: 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom',
};

export const SKILL_LABELS: Record<SkillKey, string> = {
  acrobatics: 'Acrobatics',
  animalHandling: 'Animal Handling',
  arcana: 'Arcana',
  athletics: 'Athletics',
  deception: 'Deception',
  history: 'History',
  insight: 'Insight',
  intimidation: 'Intimidation',
  investigation: 'Investigation',
  medicine: 'Medicine',
  nature: 'Nature',
  perception: 'Perception',
  performance: 'Performance',
  persuasion: 'Persuasion',
  religion: 'Religion',
  sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth',
  survival: 'Survival',
};

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

const abilityScore = z.object({
  score: z.number().int().min(1).max(30),
  proficientSave: z.boolean(),
});

const abilities = z.object({
  strength: abilityScore,
  dexterity: abilityScore,
  constitution: abilityScore,
  intelligence: abilityScore,
  wisdom: abilityScore,
  charisma: abilityScore,
});

const skills = z.object({
  acrobatics: z.boolean(),
  animalHandling: z.boolean(),
  arcana: z.boolean(),
  athletics: z.boolean(),
  deception: z.boolean(),
  history: z.boolean(),
  insight: z.boolean(),
  intimidation: z.boolean(),
  investigation: z.boolean(),
  medicine: z.boolean(),
  nature: z.boolean(),
  perception: z.boolean(),
  performance: z.boolean(),
  persuasion: z.boolean(),
  religion: z.boolean(),
  sleightOfHand: z.boolean(),
  stealth: z.boolean(),
  survival: z.boolean(),
});

const spellSlot = z.object({
  total: z.number().int().min(0).max(9),
  expended: z.number().int().min(0).max(9),
});

export const characterSheetSchema = z.object({
  rpgSystem: z.literal('dnd5e2024').default('dnd5e2024'),

  identity: z.object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    class: z.string().trim().max(80).default(''),
    subclass: z.string().trim().max(80).default(''),
    species: z.string().trim().max(80).default(''),
    background: z.string().trim().max(80).default(''),
    alignment: z.string().trim().max(40).default(''),
    level: z.number().int().min(1).max(20).default(1),
    xp: z.number().int().min(0).default(0),
    size: z.string().trim().max(20).default('Medium'),
  }),

  combat: z.object({
    armorClass: z.number().int().min(0).max(40).default(10),
    speed: z.number().int().min(0).max(200).default(30),
    hitPointsMax: z.number().int().min(0).default(0),
    hitPointsCurrent: z.number().int().default(0),
    hitPointsTemp: z.number().int().min(0).default(0),
    hitDiceMax: z.number().int().min(0).default(1),
    hitDiceSpent: z.number().int().min(0).default(0),
    hitDieSize: z.number().int().min(4).max(12).default(8),
    deathSaveSuccesses: z.number().int().min(0).max(3).default(0),
    deathSaveFailures: z.number().int().min(0).max(3).default(0),
  }),

  abilities,
  skills,

  proficiencies: z.object({
    armor: z.string().trim().max(300).default(''),
    weapons: z.string().trim().max(300).default(''),
    tools: z.string().trim().max(300).default(''),
    languages: z.string().trim().max(300).default(''),
  }),

  spellcasting: z.object({
    ability: z
      .enum([
        '',
        'strength',
        'dexterity',
        'constitution',
        'intelligence',
        'wisdom',
        'charisma',
      ])
      .default(''),
    slots: z.object({
      level1: spellSlot,
      level2: spellSlot,
      level3: spellSlot,
      level4: spellSlot,
      level5: spellSlot,
      level6: spellSlot,
      level7: spellSlot,
      level8: spellSlot,
      level9: spellSlot,
    }),
  }),

  details: z.object({
    appearance: z.string().max(4000).default(''),
    backstory: z.string().max(8000).default(''),
    personality: z.string().max(4000).default(''),
    classFeatures: z.string().max(8000).default(''),
    speciesTraits: z.string().max(8000).default(''),
    feats: z.string().max(4000).default(''),
  }),

  equipment: z.object({
    items: z.string().max(8000).default(''),
    magicItems: z.string().max(4000).default(''),
    attunedCount: z.number().int().min(0).max(3).default(0),
  }),

  currency: z.object({
    cp: z.number().int().min(0).default(0),
    sp: z.number().int().min(0).default(0),
    ep: z.number().int().min(0).default(0),
    gp: z.number().int().min(0).default(0),
    pp: z.number().int().min(0).default(0),
  }),
});

export type CharacterSheet = z.infer<typeof characterSheetSchema>;
export type SpellSlotLevel = keyof CharacterSheet['spellcasting']['slots'];

const emptySlot = { total: 0, expended: 0 };

/**
 * Default values for a brand-new character. Deliberately NOT run through
 * `characterSheetSchema.parse()` — the schema requires a non-empty name,
 * which a blank form doesn't have yet. Validation happens on submit.
 */
export function makeEmptySheet(): CharacterSheet {
  return {
    rpgSystem: 'dnd5e2024',
    identity: {
      name: '',
      class: '',
      subclass: '',
      species: '',
      background: '',
      alignment: '',
      level: 1,
      xp: 0,
      size: 'Medium',
    },
    combat: {
      armorClass: 10,
      speed: 30,
      hitPointsMax: 0,
      hitPointsCurrent: 0,
      hitPointsTemp: 0,
      hitDiceMax: 1,
      hitDiceSpent: 0,
      hitDieSize: 8,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
    },
    abilities: {
      strength: { score: 10, proficientSave: false },
      dexterity: { score: 10, proficientSave: false },
      constitution: { score: 10, proficientSave: false },
      intelligence: { score: 10, proficientSave: false },
      wisdom: { score: 10, proficientSave: false },
      charisma: { score: 10, proficientSave: false },
    },
    skills: {
      acrobatics: false,
      animalHandling: false,
      arcana: false,
      athletics: false,
      deception: false,
      history: false,
      insight: false,
      intimidation: false,
      investigation: false,
      medicine: false,
      nature: false,
      perception: false,
      performance: false,
      persuasion: false,
      religion: false,
      sleightOfHand: false,
      stealth: false,
      survival: false,
    },
    proficiencies: { armor: '', weapons: '', tools: '', languages: '' },
    spellcasting: {
      ability: '',
      slots: {
        level1: { ...emptySlot },
        level2: { ...emptySlot },
        level3: { ...emptySlot },
        level4: { ...emptySlot },
        level5: { ...emptySlot },
        level6: { ...emptySlot },
        level7: { ...emptySlot },
        level8: { ...emptySlot },
        level9: { ...emptySlot },
      },
    },
    details: {
      appearance: '',
      backstory: '',
      personality: '',
      classFeatures: '',
      speciesTraits: '',
      feats: '',
    },
    equipment: { items: '', magicItems: '', attunedCount: 0 },
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  };
}
