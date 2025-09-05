export interface Character {
  id: string;
  name: string;
  class: string;
  level: number;
  createdAt: Date;
}

export interface CharacterSheet {
  // Basic Info
  characterName: string;
  background: string;
  species: string;
  class: string;
  subclass: string;
  level: number;
  xp: number;

  // Combat Stats
  armorClass: number;
  shield: number;
  hitPoints: {
    current: number;
    temp: number;
    max: number;
  };
  hitDice: {
    spent: number;
    max: number;
  };
  deathSaves: {
    successes: number;
    failures: number;
  };

  // Core Stats
  proficiencyBonus: number;
  initiative: number;
  speed: number;
  size: string;
  passivePerception: number;

  // Ability Scores
  abilities: {
    strength: { score: number; modifier: number; savingThrow: boolean };
    dexterity: { score: number; modifier: number; savingThrow: boolean };
    constitution: { score: number; modifier: number; savingThrow: boolean };
    intelligence: { score: number; modifier: number; savingThrow: boolean };
    wisdom: { score: number; modifier: number; savingThrow: boolean };
    charisma: { score: number; modifier: number; savingThrow: boolean };
  };

  // Skills
  skills: {
    athletics: boolean;
    acrobatics: boolean;
    sleightOfHand: boolean;
    stealth: boolean;
    arcana: boolean;
    history: boolean;
    investigation: boolean;
    nature: boolean;
    religion: boolean;
    animalHandling: boolean;
    insight: boolean;
    medicine: boolean;
    perception: boolean;
    survival: boolean;
    deception: boolean;
    intimidation: boolean;
    performance: boolean;
    persuasion: boolean;
  };

  // Equipment & Proficiencies
  armorTraining: {
    light: boolean;
    medium: boolean;
    heavy: boolean;
    shields: boolean;
  };
  weapons: string;
  tools: string;

  // Spells
  spellcastingAbility: string;
  spellSaveDC: number;
  spellAttackBonus: number;
  spellSlots: {
    level1: { total: number; expended: number };
    level2: { total: number; expended: number };
    level3: { total: number; expended: number };
    level4: { total: number; expended: number };
    level5: { total: number; expended: number };
    level6: { total: number; expended: number };
    level7: { total: number; expended: number };
    level8: { total: number; expended: number };
    level9: { total: number; expended: number };
  };

  // Character Details
  appearance: string;
  backstory: string;
  alignment: string;
  languages: string;
  equipment: string;

  // Features
  classFeatures: string;
  speciesTraits: string;
  feats: string;

  // Currency
  currency: {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  };

  // Magic Items
  magicItemAttunement: number;

  // RPG System
  rpgSystem: 'dnd5e2024';
}

export interface RPGSystem {
  id: string;
  name: string;
  version: string;
  description: string;
}
