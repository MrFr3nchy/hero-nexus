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

/* ------------------------------------------------------------------ *
 * Custom / homebrew content + provenance
 * ------------------------------------------------------------------ */

export const HOMEBREW_KINDS = [
  'species',
  'class',
  'subclass',
  'background',
  'feat',
  'other',
] as const;
export type HomebrewKind = (typeof HOMEBREW_KINDS)[number];

export const HOMEBREW_KIND_LABELS: Record<HomebrewKind, string> = {
  species: 'Species',
  class: 'Class',
  subclass: 'Subclass',
  background: 'Background',
  feat: 'Feat',
  other: 'Other',
};

const homebrewTrait = z.object({
  name: z.string().trim().min(1, 'Trait needs a name').max(120),
  description: z.string().trim().max(2000).default(''),
  mechanic: z.string().trim().max(400).default(''),
});

const homebrewEntry = z.object({
  /** client-stable id; used to dedupe on the server and reconcile homebrew rows */
  id: z.string().min(1).max(64),
  kind: z.enum(HOMEBREW_KINDS),
  name: z.string().trim().min(1, 'Custom entry needs a name').max(120),
  /** dot-path of the identity field this backs, e.g. `identity.species` */
  field: z.string().max(60).default(''),
  traits: z.array(homebrewTrait).default([]),
});
export type HomebrewEntry = z.infer<typeof homebrewEntry>;
export type HomebrewTrait = z.infer<typeof homebrewTrait>;

export const PROVENANCE_KINDS = [
  'field',
  'stat-manual',
  'stat-roll',
  'stat-pointbuy',
  'stat-standard',
  'method',
  'homebrew',
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

const provenanceEntry = z.object({
  id: z.string().min(1).max(64),
  at: z.string().min(1).max(40),
  kind: z.enum(PROVENANCE_KINDS),
  label: z.string().max(160).default(''),
  detail: z.string().max(1200).default(''),
  rolls: z.array(z.number().int()).optional(),
});
export type ProvenanceEntry = z.infer<typeof provenanceEntry>;

export const ABILITY_METHODS = [
  'manual',
  'pointbuy',
  'standard',
  'roll',
] as const;
export type AbilityMethod = (typeof ABILITY_METHODS)[number];

/* ------------------------------------------------------------------ *
 * Guided build — the choices the wizard makes, kept separately from the
 * sheet values they produce.
 *
 * The sheet stays the source of truth for what a character *is*; `build`
 * records how the player got there, so changing class or level can recompute
 * the derived fields (`lib/compose`) instead of leaving stale text behind.
 * A sheet written before the wizard existed simply has an empty build and
 * stays fully editable by hand.
 * ------------------------------------------------------------------ */

export const HP_MODES = ['average', 'roll', 'manual'] as const;
export type HpMode = (typeof HP_MODES)[number];

/** An Ability Score Improvement taken as +2/+1+1, or traded for a feat. */
const asiChoice = z.object({
  mode: z.enum(['ability', 'feat']).default('ability'),
  /** '' until chosen; otherwise an AbilityKey. */
  plusTwo: z.string().max(20).default(''),
  plusOnes: z.array(z.string().max(20)).max(2).default([]),
  featKey: z.string().max(80).default(''),
  featName: z.string().max(120).default(''),
});
export type AsiChoice = z.infer<typeof asiChoice>;

/** One row of the level-up log: what this level cost and what it granted. */
const levelEntry = z.object({
  level: z.number().int().min(1).max(20),
  hpMode: z.enum(HP_MODES).default('average'),
  /** Hit points gained before the Constitution modifier. */
  hpGain: z.number().int().min(0).max(30).default(0),
  /** Raw hit-die result when `hpMode` is 'roll'. */
  hpRoll: z.number().int().min(0).max(12).default(0),
  subclassKey: z.string().max(80).default(''),
  subclassName: z.string().max(120).default(''),
  asi: asiChoice.optional(),
  note: z.string().trim().max(400).default(''),
});
export type LevelEntry = z.infer<typeof levelEntry>;

const traitChoice = z.object({
  trait: z.string().max(120),
  option: z.string().max(160),
  detail: z.string().max(600).default(''),
});

export const buildSchema = z
  .object({
    /** 'guided' = the wizard owns the derived fields; 'manual' = hands off. */
    mode: z.enum(['guided', 'manual']).default('manual'),

    classKey: z.string().max(80).default(''),
    className: z.string().max(120).default(''),
    subclassKey: z.string().max(80).default(''),
    subclassName: z.string().max(120).default(''),
    speciesKey: z.string().max(80).default(''),
    speciesName: z.string().max(120).default(''),
    backgroundKey: z.string().max(80).default(''),
    backgroundName: z.string().max(120).default(''),

    /** Scores before background increases and ASIs. */
    baseAbilities: z
      .object({
        strength: z.number().int().min(1).max(30).default(10),
        dexterity: z.number().int().min(1).max(30).default(10),
        constitution: z.number().int().min(1).max(30).default(10),
        intelligence: z.number().int().min(1).max(30).default(10),
        wisdom: z.number().int().min(1).max(30).default(10),
        charisma: z.number().int().min(1).max(30).default(10),
      })
      .default({
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }),

    /** The 2024 background ability increase: +2/+1 or +1/+1/+1. */
    backgroundBoost: z
      .object({
        mode: z.enum(['two-one', 'three']).default('two-one'),
        plusTwo: z.string().max(20).default(''),
        plusOnes: z.array(z.string().max(20)).max(3).default([]),
      })
      .default({ mode: 'two-one', plusTwo: '', plusOnes: [] }),

    /** Skill keys picked from the class list. */
    classSkills: z.array(z.string().max(30)).max(8).default([]),
    /** Free skill picks a species grants (Elf Keen Senses, Human Skillful). */
    bonusSkills: z.array(z.string().max(30)).max(4).default([]),
    /** Lineage / ancestry / legacy picks made inside species traits. */
    speciesChoices: z.array(traitChoice).max(12).default([]),

    equipment: z
      .object({
        classOption: z.string().max(2).default(''),
        backgroundOption: z.string().max(2).default(''),
      })
      .default({ classOption: '', backgroundOption: '' }),

    levels: z.array(levelEntry).max(20).default([]),

    /** Dot-paths the player edited by hand; recompute leaves these alone. */
    overrides: z.array(z.string().max(60)).max(60).default([]),
  })
  .default({
    mode: 'manual',
    classKey: '',
    className: '',
    subclassKey: '',
    subclassName: '',
    speciesKey: '',
    speciesName: '',
    backgroundKey: '',
    backgroundName: '',
    baseAbilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    backgroundBoost: { mode: 'two-one', plusTwo: '', plusOnes: [] },
    classSkills: [],
    bonusSkills: [],
    speciesChoices: [],
    equipment: { classOption: '', backgroundOption: '' },
    levels: [],
    overrides: [],
  });

export type CharacterBuild = z.infer<typeof buildSchema>;

export const characterSheetSchema = z.object({
  rpgSystem: z.literal('dnd5e2024').default('dnd5e2024'),

  generation: z
    .object({
      abilityMethod: z.enum(ABILITY_METHODS).default('manual'),
      rollMode: z.enum(['3d6', '4d6kh3']).default('3d6'),
    })
    .default({ abilityMethod: 'manual', rollMode: '3d6' }),

  homebrew: z
    .object({
      isHomebrew: z.boolean().default(false),
      entries: z.array(homebrewEntry).default([]),
    })
    .default({ isHomebrew: false, entries: [] }),

  provenance: z.array(provenanceEntry).max(1000).default([]),

  build: buildSchema,

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

/** A blank guided-build record; every field is inert until the wizard runs. */
export function makeEmptyBuild(): CharacterBuild {
  return buildSchema.parse(undefined);
}

/**
 * Default values for a brand-new character. Deliberately NOT run through
 * `characterSheetSchema.parse()` — the schema requires a non-empty name,
 * which a blank form doesn't have yet. Validation happens on submit.
 */
export function makeEmptySheet(): CharacterSheet {
  return {
    rpgSystem: 'dnd5e2024',
    generation: { abilityMethod: 'manual', rollMode: '3d6' },
    homebrew: { isHomebrew: false, entries: [] },
    provenance: [],
    build: makeEmptyBuild(),
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
