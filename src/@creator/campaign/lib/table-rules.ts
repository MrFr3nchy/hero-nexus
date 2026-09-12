/**
 * Table rules — what the app does about the rules while people are playing.
 *
 * `rules.ts` beside this governs character *building*: which ability method,
 * what level cap, which species. This file governs the *table*: whether the
 * app advises or refuses, and which of the optional rules the book offers are
 * on at this one. Every automation the play surfaces grow — hit or miss,
 * conditions that bite, the movement fence — asks these two questions, and
 * this is the one place that answers them.
 *
 * Pure: no React, no db, no `server-only`. The server reads it to decide, the
 * client reads it to say what the server will decide, and neither
 * re-implements it. `TABLE_RULE_FIELDS` is the registry — the manage form,
 * the fight popover and "Rules at hand" all render from it, so a new rule is
 * one entry here and nothing else has to learn its name.
 */

/**
 * The switch the rest of this hangs on.
 *
 * `advise`: the app says what the rules say and does nothing about it. The
 * board ghosts your reach; you may walk past it. `enforce`: the app refuses,
 * and staff may overrule any one refusal with a ruling.
 */
export type TableMode = 'advise' | 'enforce';

export interface TableRules {
  mode: TableMode;
  /** What drinking a potion costs. 2024 PHB: a bonus action. */
  potionAction: 'bonus' | 'action' | 'free';
  /** off; basic = the STR × 15 cap; variant = the 2014 DMG's 5× / 10× steps. */
  encumbrance: 'off' | 'basic' | 'variant';
  /** Whether a day without food, water or sleep costs anything. */
  survival: { food: boolean; water: boolean; sleep: boolean };
  /** 2014 DMG optional: advantage when an ally is on the far side. */
  flanking: boolean;
  /** 2024 counts every diagonal as 5 ft; 2014's optional rule alternates. */
  diagonals: '5-5-5' | '5-10-5';
  /** A natural 20: roll the dice twice, or take the maximum and roll once. */
  crits: 'double-dice' | 'max-plus-roll';
  /** Whether a potion of healing is rolled or simply gives its maximum. */
  healingPotions: 'rolled' | 'max';
  /** How long a rest takes: the book, a week (gritty), or minutes (heroic). */
  rests: 'standard' | 'gritty' | 'heroic';
  /** 2014 DMG optional: a wound that outlasts the fight. */
  lingeringInjuries: boolean;
  /** Whether a player may type the face off a real die (see 03). */
  physicalDice: 'off' | 'marked' | 'unmarked';
  /** Whether a player may put damage on a foe, or only offer it (see 06). */
  playersApplyDamage: 'never' | 'propose' | 'apply';
  /** How a foe's hit points read to a player: a word, or the number. */
  foeHpShown: 'word' | 'number';
  /** Whether the board refuses a move past your speed. Bites only under enforce. */
  movementFence: boolean;
  /** Who is told whether an attack landed (see 06). */
  showHitMiss: 'staff' | 'everyone';
}

export const DEFAULT_TABLE_RULES: TableRules = {
  mode: 'advise',
  potionAction: 'bonus',
  encumbrance: 'basic',
  survival: { food: false, water: false, sleep: false },
  flanking: false,
  diagonals: '5-5-5',
  crits: 'double-dice',
  healingPotions: 'rolled',
  rests: 'standard',
  lingeringInjuries: false,
  physicalDice: 'off',
  playersApplyDamage: 'propose',
  foeHpShown: 'word',
  movementFence: true,
  showHitMiss: 'everyone',
};

/* --- the registry -------------------------------------------------------- */

export type TableRuleGroup = 'combat' | 'rests' | 'survival' | 'dice' | 'seen';

export const TABLE_RULE_GROUPS: Record<
  TableRuleGroup,
  { label: string; line: string }
> = {
  combat: {
    label: 'Combat',
    line: 'How a fight is scored.',
  },
  rests: {
    label: 'Rests and recovery',
    line: 'How long it takes to get back up.',
  },
  survival: {
    label: 'Survival',
    line: 'Whether the road itself is dangerous.',
  },
  dice: {
    label: 'Dice',
    line: 'Whose dice count.',
  },
  seen: {
    label: 'What players see',
    line: 'How much of the DM’s side of the table is shown.',
  },
};

export interface TableRuleOption {
  value: string;
  label: string;
  /** Where it comes from: the 2024 book, the 2014 one, or the table. */
  note: string;
}

/**
 * One control on the manage page.
 *
 * `read` and `write` exist because `survival` is nested: the registry stays
 * flat so a form can map over it, and the two accessors hide the shape.
 */
export interface TableRuleField {
  key: string;
  group: TableRuleGroup;
  label: string;
  /** One line under the control: the rule it defaults to. */
  hint: string;
  options: readonly TableRuleOption[];
  read: (rules: TableRules) => string;
  write: (rules: TableRules, value: string) => TableRules;
  /** One line for `describeTableRules` when the value is not the default. */
  describe: (value: string) => string;
  /** Worth flipping mid-fight, so offered on the initiative box. */
  perFight?: boolean;
}

const ON_OFF = (
  onNote: string,
  offNote: string
): readonly TableRuleOption[] => [
  { value: 'on', label: 'On', note: onNote },
  { value: 'off', label: 'Off', note: offNote },
];

const flagField = (
  key: keyof TableRules,
  input: Omit<TableRuleField, 'key' | 'read' | 'write' | 'describe'> & {
    describe: Record<'on' | 'off', string>;
  }
): TableRuleField => ({
  key,
  ...input,
  read: rules => (rules[key] ? 'on' : 'off'),
  write: (rules, value) => ({ ...rules, [key]: value === 'on' }),
  describe: value => input.describe[value === 'on' ? 'on' : 'off'],
});

const survivalField = (
  part: keyof TableRules['survival'],
  label: string,
  describeOn: string
): TableRuleField => ({
  key: `survival.${part}`,
  group: 'survival',
  label,
  hint: 'Off in the book unless the DM says the journey matters.',
  options: ON_OFF(
    'A day without it costs a level of exhaustion.',
    'Not tracked.'
  ),
  read: rules => (rules.survival[part] ? 'on' : 'off'),
  write: (rules, value) => ({
    ...rules,
    survival: { ...rules.survival, [part]: value === 'on' },
  }),
  describe: value => (value === 'on' ? describeOn : `${label} is not tracked.`),
});

const choiceField = <K extends keyof TableRules>(
  key: K,
  input: Omit<TableRuleField, 'key' | 'read' | 'write' | 'describe'> & {
    describe: Record<TableRules[K] & string, string>;
  }
): TableRuleField => ({
  key,
  ...input,
  read: rules => String(rules[key]),
  write: (rules, value) => ({ ...rules, [key]: value }),
  describe: value =>
    input.describe[value as TableRules[K] & string] ??
    `${input.label}: ${value}.`,
});

/**
 * Every rule, in the order the manage page shows them. The mode is first
 * because it is the one everything else reads through.
 */
export const TABLE_RULE_FIELDS: readonly TableRuleField[] = [
  choiceField('mode', {
    group: 'combat',
    label: 'The app',
    hint: 'Advise by default: the app says what the rules say and does nothing about it.',
    perFight: true,
    options: [
      {
        value: 'advise',
        label: 'Advises',
        note: 'Reach is ghosted, caps are named, and nothing is refused.',
      },
      {
        value: 'enforce',
        label: 'Enforces',
        note: 'The app refuses what the rules refuse. Staff can overrule any one refusal.',
      },
    ],
    describe: {
      advise: 'The app advises and refuses nothing.',
      enforce: 'The app enforces the rules. The DM can overrule any refusal.',
    },
  }),
  choiceField('potionAction', {
    group: 'combat',
    label: 'Drinking a potion',
    hint: '2024: a bonus action. 2014: an action.',
    options: [
      { value: 'bonus', label: 'Bonus action', note: '2024 PHB.' },
      { value: 'action', label: 'Action', note: '2014 PHB.' },
      { value: 'free', label: 'Free', note: 'A house rule: it costs nothing.' },
    ],
    describe: {
      bonus: 'Drinking a potion is a bonus action.',
      action: 'Drinking a potion is an action.',
      free: 'Drinking a potion is free.',
    },
  }),
  choiceField('crits', {
    group: 'combat',
    label: 'Critical hits',
    hint: '2024: roll the damage dice twice.',
    options: [
      { value: 'double-dice', label: 'Double the dice', note: '2024 PHB.' },
      {
        value: 'max-plus-roll',
        label: 'Max, plus a roll',
        note: 'A house rule: the maximum of the dice, then roll them once more.',
      },
    ],
    describe: {
      'double-dice': 'A critical hit rolls the dice twice.',
      'max-plus-roll': 'A critical hit takes the maximum and rolls once more.',
    },
  }),
  flagField('flanking', {
    group: 'combat',
    label: 'Flanking',
    hint: 'Off in 2024. The 2014 DMG offered it as an option.',
    perFight: true,
    options: ON_OFF(
      'Advantage on melee attacks when an ally is on the far side. 2014 DMG.',
      'Not in play. 2024 PHB.'
    ),
    describe: {
      on: 'Flanking gives advantage.',
      off: 'No flanking.',
    },
  }),
  choiceField('diagonals', {
    group: 'combat',
    label: 'Diagonal movement',
    hint: '2024: every square is 5 ft, diagonals included.',
    options: [
      { value: '5-5-5', label: '5 ft each', note: '2024 PHB.' },
      {
        value: '5-10-5',
        label: '5, then 10',
        note: 'Every second diagonal costs 10 ft. 2014 DMG.',
      },
    ],
    describe: {
      '5-5-5': 'Diagonals cost 5 ft.',
      '5-10-5': 'Every second diagonal costs 10 ft.',
    },
  }),
  flagField('movementFence', {
    group: 'combat',
    label: 'The movement fence',
    hint: 'Only bites when the app enforces. Advising, the reach is ghosted and that is all.',
    perFight: true,
    options: ON_OFF(
      'A move past your speed is refused.',
      'The board shows your reach and lets you walk past it.'
    ),
    describe: {
      on: 'A move past your speed is refused.',
      off: 'Moves past your speed are allowed.',
    },
  }),
  flagField('lingeringInjuries', {
    group: 'combat',
    label: 'Lingering injuries',
    hint: 'Off in the book. The 2014 DMG offered a table of wounds.',
    options: ON_OFF(
      'A critical hit or going down can leave a wound that outlasts the fight. 2014 DMG.',
      'Not in play.'
    ),
    describe: {
      on: 'Lingering injuries are in play.',
      off: 'No lingering injuries.',
    },
  }),
  choiceField('encumbrance', {
    group: 'rests',
    label: 'Carrying weight',
    hint: '2024: you can carry STR × 15 lb, and that is the rule.',
    options: [
      { value: 'basic', label: 'The cap', note: 'STR × 15 lb. 2024 PHB.' },
      {
        value: 'variant',
        label: 'Variant',
        note: 'Slowed at 5 × STR, slowed and hindered at 10 ×. 2014 PHB.',
      },
      { value: 'off', label: 'Off', note: 'Nobody weighs anything.' },
    ],
    describe: {
      basic: 'Carrying capacity is STR × 15 lb.',
      variant: 'Variant encumbrance: slowed at 5 × STR, hindered at 10 ×.',
      off: 'Weight is not tracked.',
    },
  }),
  choiceField('healingPotions', {
    group: 'rests',
    label: 'Healing potions',
    hint: '2024: rolled.',
    options: [
      { value: 'rolled', label: 'Rolled', note: '2024 PHB.' },
      {
        value: 'max',
        label: 'Maximum',
        note: 'A common house rule: a potion always heals its most.',
      },
    ],
    describe: {
      rolled: 'Healing potions are rolled.',
      max: 'Healing potions heal their maximum.',
    },
  }),
  choiceField('rests', {
    group: 'rests',
    label: 'Rests',
    hint: '2024: a short rest is an hour, a long rest is eight.',
    options: [
      { value: 'standard', label: 'By the book', note: '2024 PHB.' },
      {
        value: 'gritty',
        label: 'Gritty',
        note: 'A short rest is a night; a long rest is a week. 2014 DMG.',
      },
      {
        value: 'heroic',
        label: 'Heroic',
        note: 'A short rest is five minutes; a long rest is an hour. 2014 DMG.',
      },
    ],
    describe: {
      standard: 'Rests are as the book has them.',
      gritty: 'Gritty rests: a short rest is a night, a long rest a week.',
      heroic:
        'Heroic rests: a short rest is five minutes, a long rest an hour.',
    },
  }),
  survivalField('food', 'Food', 'A day without food costs exhaustion.'),
  survivalField('water', 'Water', 'A day without water costs exhaustion.'),
  survivalField('sleep', 'Sleep', 'A night without sleep costs exhaustion.'),
  choiceField('physicalDice', {
    group: 'dice',
    label: 'Real dice',
    hint: 'Off: every roll is the app’s. The total is always the app’s, whatever the die.',
    options: [
      { value: 'off', label: 'Not allowed', note: 'The app rolls everything.' },
      {
        value: 'marked',
        label: 'Allowed, marked',
        note: 'A player may type the face they rolled; the log says so.',
      },
      {
        value: 'unmarked',
        label: 'Allowed',
        note: 'A typed face reads like any other roll.',
      },
    ],
    describe: {
      off: 'Only the app’s dice count.',
      marked: 'Real dice are allowed, and marked in the log.',
      unmarked: 'Real dice are allowed.',
    },
  }),
  choiceField('playersApplyDamage', {
    group: 'dice',
    label: 'Players and damage',
    hint: 'Propose by default: a hit offers the DM the number to apply.',
    options: [
      {
        value: 'propose',
        label: 'Propose it',
        note: 'A player’s hit offers the damage; the DM applies it.',
      },
      {
        value: 'apply',
        label: 'Apply it',
        note: 'A player’s hit puts the damage on the foe themselves.',
      },
      {
        value: 'never',
        label: 'Neither',
        note: 'The DM reads the roll and does the arithmetic.',
      },
    ],
    describe: {
      propose: 'Players propose damage; the DM applies it.',
      apply: 'Players apply their own damage to foes.',
      never: 'The DM applies all damage.',
    },
  }),
  choiceField('foeHpShown', {
    group: 'seen',
    label: 'A foe’s hit points',
    hint: 'A word by default: Bloodied, not 23 of 45.',
    options: [
      {
        value: 'word',
        label: 'A word',
        note: 'Unhurt, Bloodied, Nearly down.',
      },
      { value: 'number', label: 'The number', note: 'Current of maximum.' },
    ],
    describe: {
      word: 'Players see a foe’s hit points as a word.',
      number: 'Players see a foe’s hit points as a number.',
    },
  }),
  choiceField('showHitMiss', {
    group: 'seen',
    label: 'Hit or miss',
    hint: 'Everyone by default: the roll line says whether it landed.',
    options: [
      {
        value: 'everyone',
        label: 'Everyone',
        note: 'The roll line says Hit or Miss to the table.',
      },
      {
        value: 'staff',
        label: 'Staff only',
        note: 'Players see the total; the DM says whether it landed.',
      },
    ],
    describe: {
      everyone: 'Everyone is told whether an attack landed.',
      staff: 'Only the DM is told whether an attack landed.',
    },
  }),
];

export const TABLE_RULE_KEYS: readonly string[] = TABLE_RULE_FIELDS.map(
  f => f.key
);

export function tableRuleField(key: string): TableRuleField | undefined {
  return TABLE_RULE_FIELDS.find(f => f.key === key);
}

/* --- reading and writing ------------------------------------------------- */

/**
 * The stored shape, flattened onto the registry's keys.
 *
 * Reads both shapes a value arrives in: the stored one (`survival.food` is
 * nested, flags are booleans) and the control's (a flat registry key, 'on'
 * or 'off'), so a form and a row go through the same door.
 */
function rawValue(
  raw: Record<string, unknown>,
  field: TableRuleField
): unknown {
  const flat = raw[field.key];
  if (typeof flat === 'boolean') return flat ? 'on' : 'off';
  if (flat !== undefined) return flat;
  if (field.key.startsWith('survival.')) {
    const survival = raw.survival;
    if (!survival || typeof survival !== 'object') return undefined;
    const part = field.key.slice('survival.'.length);
    const v = (survival as Record<string, unknown>)[part];
    return typeof v === 'boolean' ? (v ? 'on' : 'off') : undefined;
  }
  return undefined;
}

/**
 * Fold a stored (possibly partial, possibly garbage) blob over the defaults.
 *
 * One field at a time, like `parseContentData`: an unknown value for one rule
 * costs that rule its default and nothing else, so a row written before a
 * rule existed still reads as a whole table.
 */
export function mergeTableRules(raw: unknown): TableRules {
  return applyTableRulesPatch(DEFAULT_TABLE_RULES, raw);
}

/**
 * Lay a patch — a manage-page save, or a fight's overrides — over a base.
 * Only registry keys with a legal value take; everything else is ignored.
 */
export function applyTableRulesPatch(
  base: TableRules,
  raw: unknown
): TableRules {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let out = base;
  for (const field of TABLE_RULE_FIELDS) {
    const v = rawValue(obj, field);
    if (typeof v !== 'string') continue;
    if (!field.options.some(o => o.value === v)) continue;
    out = field.write(out, v);
  }
  return out;
}

/**
 * A fight's overrides, kept as the subset of a rules object that differs
 * from what it is laid over. Stored on the encounter, so a fight with no
 * flanking says only `{ flanking: false }` and inherits the rest live.
 */
export type TableRulesPatch = Partial<
  Omit<TableRules, 'survival'> & { survival: Partial<TableRules['survival']> }
>;

/**
 * Keep only the registry keys of a patch that carry a legal value, in the
 * stored (nested) shape. What `setEncounterRuleOverrides` writes.
 */
export function sanitizeTableRulesPatch(raw: unknown): TableRulesPatch {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  const survival: Record<string, boolean> = {};
  for (const field of TABLE_RULE_FIELDS) {
    const v = rawValue(obj, field);
    if (typeof v !== 'string') continue;
    if (!field.options.some(o => o.value === v)) continue;
    if (field.key.startsWith('survival.')) {
      survival[field.key.slice('survival.'.length)] = v === 'on';
      continue;
    }
    const isFlag = field.options.every(
      o => o.value === 'on' || o.value === 'off'
    );
    out[field.key] = isFlag ? v === 'on' : v;
  }
  if (Object.keys(survival).length) out.survival = survival;
  return out as TableRulesPatch;
}

/** The registry keys a patch touches, for an announcement's `changed`. */
export function patchedRuleKeys(patch: TableRulesPatch): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'survival' && v && typeof v === 'object') {
      for (const part of Object.keys(v)) keys.push(`survival.${part}`);
    } else if (v !== undefined) {
      keys.push(k);
    }
  }
  return keys.filter(k => TABLE_RULE_KEYS.includes(k));
}

/**
 * One line per rule that is not the 2024 default. Empty means the table
 * plays it as printed — and the caller says so, rather than showing nothing.
 */
export function describeTableRules(
  rules: TableRules,
  opts: { omit?: string[] } = {}
): string[] {
  const lines: string[] = [];
  for (const field of TABLE_RULE_FIELDS) {
    // A surface that already wears the mode as a pill leaves it out here.
    if (opts.omit?.includes(field.key)) continue;
    const value = field.read(rules);
    if (value === field.read(DEFAULT_TABLE_RULES)) continue;
    lines.push(field.describe(value));
  }
  return lines;
}

/** The lines for the keys a fight overrides, whatever their value. */
export function describeRuleKeys(rules: TableRules, keys: string[]): string[] {
  return keys
    .map(k => tableRuleField(k))
    .filter((f): f is TableRuleField => f !== undefined)
    .map(f => f.describe(f.read(rules)));
}

/* --- the fence ------------------------------------------------------------ */

/** What the log says after a line the DM overruled the app to write. */
export const RULING_SUFFIX = " · DM's ruling";

/**
 * Whether a refusal stands.
 *
 * Pure so a control can say in advance what the server will do: advising,
 * nothing is refused; enforcing, a refusal stands unless staff are ruling
 * past it. The server throws a `RuleRefusal` when this says `true`.
 */
export function refuses(
  rules: Pick<TableRules, 'mode'>,
  opts: { ruling?: boolean; isStaff: boolean }
): boolean {
  if (rules.mode !== 'enforce') return false;
  return !(opts.ruling && opts.isStaff);
}
