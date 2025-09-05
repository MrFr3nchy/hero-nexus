import { RPGSystem } from '.';

export const RPG_SYSTEMS: RPGSystem[] = [
  {
    id: 'dnd5e2024',
    name: 'Dungeons & Dragons',
    version: '5th Edition 2024',
    description: "The latest version of the world's most popular tabletop RPG",
  },
];

export const ABILITY_SCORES = [
  { key: 'strength', name: 'Strength', skills: ['Athletics'] },
  {
    key: 'dexterity',
    name: 'Dexterity',
    skills: ['Acrobatics', 'Sleight of Hand', 'Stealth'],
  },
  { key: 'constitution', name: 'Constitution', skills: [] },
  {
    key: 'intelligence',
    name: 'Intelligence',
    skills: ['Arcana', 'History', 'Investigation', 'Nature', 'Religion'],
  },
  {
    key: 'wisdom',
    name: 'Wisdom',
    skills: [
      'Animal Handling',
      'Insight',
      'Medicine',
      'Perception',
      'Survival',
    ],
  },
  {
    key: 'charisma',
    name: 'Charisma',
    skills: ['Deception', 'Intimidation', 'Performance', 'Persuasion'],
  },
];
