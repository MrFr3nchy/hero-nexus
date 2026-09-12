/**
 * The book, at hand.
 *
 * The rules a table looks up mid-turn — what an action is, what cover does,
 * how far a jump goes — as short entries that can be searched from the
 * "Rules at hand" panel. SRD 5.2 (2024) text, condensed, each entry citing
 * the section it comes from so a table that wants the whole paragraph knows
 * where it is.
 *
 * Pure data. Conditions are not here: `conditions.ts` already holds them and
 * the panel reads that, so there is one vocabulary for the chips and the
 * reference.
 */

export interface RuleEntry {
  key: string;
  title: string;
  /** The SRD section the entry condenses. */
  cite: string;
  body: string;
}

export interface RuleSection {
  key: string;
  title: string;
  entries: RuleEntry[];
}

export const RULES_REFERENCE: RuleSection[] = [
  {
    key: 'actions',
    title: 'Actions in combat',
    entries: [
      {
        key: 'attack',
        title: 'Attack',
        cite: 'Actions',
        body: 'Make one attack with a weapon or an Unarmed Strike. Some features let you make more than one attack with this action.',
      },
      {
        key: 'dash',
        title: 'Dash',
        cite: 'Actions',
        body: 'Gain extra movement for the turn equal to your Speed, after any modifiers. Difficult terrain still costs double.',
      },
      {
        key: 'disengage',
        title: 'Disengage',
        cite: 'Actions',
        body: 'Your movement does not provoke Opportunity Attacks for the rest of the turn.',
      },
      {
        key: 'dodge',
        title: 'Dodge',
        cite: 'Actions',
        body: 'Until the start of your next turn, attack rolls against you have Disadvantage if you can see the attacker, and you make Dexterity saving throws with Advantage. You lose the benefit if you are Incapacitated or your Speed is 0.',
      },
      {
        key: 'help',
        title: 'Help',
        cite: 'Actions',
        body: 'Either give an ally Advantage on their next ability check with a skill or tool you are also proficient in, made before the start of your next turn; or distract a creature within 5 feet so the next attack roll against it by one of your allies has Advantage, if made before the start of your next turn.',
      },
      {
        key: 'hide',
        title: 'Hide',
        cite: 'Actions',
        body: 'Make a DC 15 Dexterity (Stealth) check while Heavily Obscured or behind Three-Quarters or Total Cover, out of any enemy’s line of sight. On a success you have the Invisible condition until you make a sound louder than a whisper, an enemy finds you, you attack, or you cast a spell with a verbal component. The check total is the DC for a creature to find you.',
      },
      {
        key: 'influence',
        title: 'Influence',
        cite: 'Actions',
        body: 'Urge a monster to do something. The DM sets the DC (10 for Indifferent, 15 for Friendly with a request it would balk at, 20 for Hostile); a Charisma (Deception, Intimidation, Performance or Persuasion) or Wisdom (Animal Handling) check decides it. A failed attempt cannot be tried again for 24 hours.',
      },
      {
        key: 'magic',
        title: 'Magic',
        cite: 'Actions',
        body: 'Cast a spell with a casting time of an action, use a magic item that takes an action, or use a magical feature that does.',
      },
      {
        key: 'ready',
        title: 'Ready',
        cite: 'Actions',
        body: 'Choose a trigger and a response — an action, or a move up to your Speed. When the trigger occurs, take the response as a Reaction, or ignore it. A readied spell is cast now and held; holding it takes Concentration until the trigger, and the slot is spent either way.',
      },
      {
        key: 'search',
        title: 'Search',
        cite: 'Actions',
        body: 'Make a Wisdom check to find something: Insight for a creature’s intent, Medicine for what ails it, Perception for what is there, Survival for tracks.',
      },
      {
        key: 'study',
        title: 'Study',
        cite: 'Actions',
        body: 'Make an Intelligence check to recall or learn something: Arcana, History, Investigation, Nature or Religion.',
      },
      {
        key: 'utilize',
        title: 'Utilize',
        cite: 'Actions',
        body: 'Use a nonmagical object — pull a lever, drink a potion when the table says it takes an action, open a chest. Interacting with one object is otherwise free once on your turn.',
      },
      {
        key: 'opportunity',
        title: 'Opportunity attack',
        cite: 'Making an Attack',
        body: 'When a creature you can see leaves your reach, you can use your Reaction to make one melee attack against it. Teleporting, being moved without using your own movement or action, and the Disengage action do not provoke.',
      },
      {
        key: 'unarmed',
        title: 'Unarmed strike',
        cite: 'Making an Attack',
        body: 'Punch, kick, headbutt: on a hit, 1 + your Strength modifier bludgeoning damage. Instead of damage, a creature within 5 ft can be Grappled or shoved 5 ft or Prone — it avoids the effect with a Strength or Dexterity save against DC 8 + your Strength modifier + your Proficiency Bonus.',
      },
      {
        key: 'two-weapon',
        title: 'Two-weapon fighting',
        cite: 'Making an Attack',
        body: 'When you attack with a Light weapon, you can make one extra attack as a Bonus Action later in the turn with a different Light weapon. You do not add your ability modifier to the extra attack’s damage unless it is negative.',
      },
    ],
  },
  {
    key: 'cover',
    title: 'Cover',
    entries: [
      {
        key: 'half',
        title: 'Half cover',
        cite: 'Cover',
        body: '+2 to AC and Dexterity saving throws. An obstacle blocks at least half of the target — a low wall, a piece of furniture, another creature.',
      },
      {
        key: 'three-quarters',
        title: 'Three-quarters cover',
        cite: 'Cover',
        body: '+5 to AC and Dexterity saving throws. About three-quarters of the target is covered — a portcullis, an arrow slit, a thick tree trunk.',
      },
      {
        key: 'total',
        title: 'Total cover',
        cite: 'Cover',
        body: 'Cannot be targeted directly by an attack or a spell, though some spells reach it by including it in an area. The target is completely concealed.',
      },
    ],
  },
  {
    key: 'movement',
    title: 'Movement',
    entries: [
      {
        key: 'difficult',
        title: 'Difficult terrain',
        cite: 'Movement and Position',
        body: 'Every foot of movement in difficult terrain costs 1 extra foot. Rubble, undergrowth, ice, shallow water, and a creature’s space all count.',
      },
      {
        key: 'long-jump',
        title: 'Long jump',
        cite: 'Movement and Position',
        body: 'With a 10-foot run-up, you jump a number of feet up to your Strength score. From a standstill, half that. Each foot cleared costs a foot of movement. Landing in difficult terrain needs a DC 10 Dexterity (Acrobatics) check or you land Prone.',
      },
      {
        key: 'high-jump',
        title: 'High jump',
        cite: 'Movement and Position',
        body: 'With a 10-foot run-up, you leap 3 + your Strength modifier feet into the air (minimum 0). From a standstill, half that. You can reach up 1½ times your height plus the jump.',
      },
      {
        key: 'climb-swim',
        title: 'Climbing and swimming',
        cite: 'Movement and Position',
        body: 'Each foot of climbing or swimming costs 1 extra foot (2 in difficult terrain) unless you have a Climb or Swim Speed. The DM may ask for a Strength (Athletics) check on a slippery or sheer surface.',
      },
      {
        key: 'crawl',
        title: 'Crawling',
        cite: 'Movement and Position',
        body: 'Each foot of crawling costs 1 extra foot (2 in difficult terrain). Standing up from Prone costs half your Speed, rounded down, and you cannot stand if your Speed is 0.',
      },
      {
        key: 'falling',
        title: 'Falling',
        cite: 'Hazards',
        body: '1d6 bludgeoning damage per 10 feet fallen, to a maximum of 20d6, and you land Prone unless you avoid the damage. A creature that falls into water or another liquid can use its Reaction to make a DC 15 Strength (Athletics) or Dexterity (Acrobatics) check to halve the damage.',
      },
      {
        key: 'squeezing',
        title: 'Squeezing',
        cite: 'Movement and Position',
        body: 'A creature can squeeze through a space one size smaller than it is. Each foot costs 1 extra foot, and while squeezed the creature has Disadvantage on attack rolls and Dexterity saves, and attacks against it have Advantage.',
      },
    ],
  },
  {
    key: 'senses',
    title: 'Light and vision',
    entries: [
      {
        key: 'bright',
        title: 'Bright light',
        cite: 'Vision and Light',
        body: 'Most creatures see normally. Daylight, a torch out to 20 feet, a lantern to 30, a candle to 5.',
      },
      {
        key: 'dim',
        title: 'Dim light',
        cite: 'Vision and Light',
        body: 'Lightly Obscured: Disadvantage on Wisdom (Perception) checks that rely on sight. The edge of a light source, twilight, a bright moon.',
      },
      {
        key: 'darkness',
        title: 'Darkness',
        cite: 'Vision and Light',
        body: 'Heavily Obscured: a creature effectively has the Blinded condition when trying to see something there. Darkvision lets you see dim light as bright and darkness as dim, in shades of gray, out to its range.',
      },
      {
        key: 'unseen',
        title: 'Unseen attackers and targets',
        cite: 'Making an Attack',
        body: 'Attacking a target you cannot see: Disadvantage. Attacking from where the target cannot see you: Advantage. When you attack an unseen target, you guess its location; a miss is a miss.',
      },
    ],
  },
  {
    key: 'environment',
    title: 'The environment',
    entries: [
      {
        key: 'mounted',
        title: 'Mounted combat',
        cite: 'Mounted Combat',
        body: 'Mounting or dismounting a willing creature one size larger costs half your Speed. A controlled mount acts on your turn and can only Dash, Disengage or Dodge; an independent mount keeps its own initiative. If your mount is knocked Prone you can use a Reaction to land on your feet, else you fall Prone beside it. When an effect would move your mount, you make a DC 10 Dexterity save to stay on.',
      },
      {
        key: 'underwater',
        title: 'Underwater combat',
        cite: 'Underwater Combat',
        body: 'A melee weapon attack has Disadvantage unless the weapon is a dagger, javelin, shortsword, spear or trident, or the attacker has a Swim Speed. A ranged attack misses automatically past normal range and has Disadvantage inside it, unless the weapon is a crossbow, net, or thrown like a javelin. Creatures fully underwater have Resistance to fire damage.',
      },
      {
        key: 'suffocating',
        title: 'Suffocating',
        cite: 'Hazards',
        body: 'A creature can hold its breath for 1 + its Constitution modifier minutes (minimum 30 seconds). When it runs out, it can survive a number of rounds equal to its Constitution modifier (minimum 1), then drops to 0 Hit Points and is dying at the start of its next turn. Hit points cannot be regained while suffocating.',
      },
      {
        key: 'burning',
        title: 'Burning',
        cite: 'Hazards',
        body: 'A burning creature or object takes 1d4 fire damage at the start of each of its turns. It can take an action to put itself out by dropping Prone and rolling, or be doused by a Utilize action or immersion in water.',
      },
      {
        key: 'dehydration',
        title: 'Dehydration and malnutrition',
        cite: 'Hazards',
        body: 'A creature needs 1 gallon of water and 1 pound of food a day. Each day without enough water, or after a number of days without food equal to 3 + its Constitution modifier, it gains 1 Exhaustion level. Exhaustion from either cannot be removed until it eats and drinks a full day’s worth.',
      },
      {
        key: 'sleep',
        title: 'Sleep',
        cite: 'Rests',
        body: 'A long rest needs at least 8 hours, of which at least 6 are spent asleep and the rest in light activity. A creature that goes 24 hours without one must make a DC 10 Constitution save at the end of the 24 hours and every 24 hours after, gaining 1 Exhaustion level on a failure; the DC rises by 5 each time.',
      },
    ],
  },
  {
    key: 'rests',
    title: 'Rests and dying',
    entries: [
      {
        key: 'short-rest',
        title: 'Short rest',
        cite: 'Rests',
        body: 'At least 1 hour of light activity. Spend any number of Hit Point Dice, rolling each and adding your Constitution modifier. A rest interrupted by an hour of strenuous activity, a fight, or a spell does not count.',
      },
      {
        key: 'long-rest',
        title: 'Long rest',
        cite: 'Rests',
        body: 'At least 8 hours, 6 of them asleep. Regain all Hit Points, half your total Hit Point Dice (minimum 1), spent spell slots and features, and lose 1 Exhaustion level. Once per 24 hours. One hour of fighting or casting breaks it; a walk does not.',
      },
      {
        key: 'death-saves',
        title: 'Death saving throws',
        cite: 'Damage and Healing',
        body: 'At 0 Hit Points and not dead, roll a d20 at the start of each of your turns, no modifiers. 10 or higher is a success; 9 or lower a failure. Three successes: stable. Three failures: dead. A natural 1 counts as two failures; a natural 20 restores 1 Hit Point. Any damage while at 0 is a failure, a critical hit two.',
      },
      {
        key: 'instant-death',
        title: 'Instant death',
        cite: 'Damage and Healing',
        body: 'Damage that drops you to 0 with enough left over to equal or exceed your Hit Point maximum kills you outright.',
      },
      {
        key: 'temp-hp',
        title: 'Temporary hit points',
        cite: 'Damage and Healing',
        body: 'A buffer, not healing: they take damage first, do not stack — you keep the higher — and cannot be restored by rests or healing. They last until depleted or until you finish a Long Rest.',
      },
    ],
  },
];

/** Every entry in the reference, flat, for searching. */
export function searchRules(query: string): RuleSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return RULES_REFERENCE;
  return RULES_REFERENCE.map(section => ({
    ...section,
    entries: section.entries.filter(
      e =>
        e.title.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        section.title.toLowerCase().includes(q)
    ),
  })).filter(section => section.entries.length > 0);
}
