/**
 * What can go on a screen, and where it starts.
 *
 * One table, so adding a panel is one entry rather than a hunt through a
 * switch in the page, a switch in the picker and a label map somewhere else —
 * the same shape as `CONTENT_REGISTRY` and for the same reason.
 *
 * Pure: no React, no server, no database. The server validates stored keys
 * against `SCREEN_PANELS` and the page renders from it, so a panel that no
 * longer exists cannot be stored and cannot be drawn.
 */
import type { GlyphName } from '@/@shared/components/ui/Glyph';

export const SCREEN_PANEL_KEYS = [
  'sitting',
  'board',
  'initiative',
  'mine',
  'vitals',
  'rolls',
  'attacks',
  'spells',
  'statblock',
  'whispers',
  'spotlight',
  'feed',
  'reveals',
  'notebook',
  'quests',
  'handouts',
  'conditions',
  'rules',
  'shop',
  'timers',
  'ledger',
  'canon',
] as const;

export type ScreenPanelKey = (typeof SCREEN_PANEL_KEYS)[number];

export interface ScreenPanelMeta {
  key: ScreenPanelKey;
  /** Two or three words. It is a heading on a crowded page. */
  label: string;
  glyph: GlyphName;
  /** One line, shown when choosing panels. */
  description: string;
  /** False for anything a player has no business keeping open. */
  players: boolean;
}

export const SCREEN_PANELS: Record<ScreenPanelKey, ScreenPanelMeta> = {
  sitting: {
    key: 'sitting',
    label: 'Session',
    glyph: 'person',
    description: 'Whether the evening has been called, and who is looking.',
    players: true,
  },
  board: {
    key: 'board',
    label: 'Battle board',
    glyph: 'map',
    description:
      'The battlefield: a room painted on a grid, with the fight on it.',
    players: true,
  },
  initiative: {
    key: 'initiative',
    label: 'Initiative',
    glyph: 'sword',
    description: 'The order, hit points, conditions, and whose turn it is.',
    players: true,
  },
  mine: {
    key: 'mine',
    label: 'Your hero',
    glyph: 'shield',
    description:
      'Your own gear, prepared spells and conditions, without leaving the table.',
    // Staff have no hero of their own at this table, so the panel would be an
    // empty box for them. It says so rather than being hidden, because a DM
    // who also plays elsewhere will look for it.
    players: true,
  },
  vitals: {
    key: 'vitals',
    label: 'Party',
    glyph: 'person',
    description: 'Every character’s hit points, slots and passive scores.',
    players: true,
  },
  rolls: {
    key: 'rolls',
    label: 'Rolls',
    glyph: 'die',
    description:
      'What the DM has asked for, and every die the table has thrown.',
    // The asking and the dice were two boxes in two columns, and a DM asking
    // for a Perception check watched the answers land somewhere other than
    // where they roll for the sexton's Deception. One box: the ask at the
    // top, the log under it, everybody's dice interleaved.
    players: true,
  },
  attacks: {
    key: 'attacks',
    label: 'Attacks',
    glyph: 'sword',
    description: 'Your weapons in hand, with to-hit and damage ready to roll.',
    players: true,
  },
  spells: {
    key: 'spells',
    label: 'Spells',
    glyph: 'sparkle',
    description:
      'Your prepared spells, cast on the tokens selected or the area lit.',
    players: true,
  },
  statblock: {
    key: 'statblock',
    label: 'Stat block',
    glyph: 'dragon',
    description: 'The selected foe, as the bestiary has it, with its actions.',
    players: false,
  },
  whispers: {
    key: 'whispers',
    label: 'Whispers',
    glyph: 'whisper',
    description:
      'A note passed under the table: to the DM, to a player, from anyone.',
    players: true,
  },
  spotlight: {
    key: 'spotlight',
    label: 'Shared map',
    glyph: 'map',
    description: 'The map the DM has put in front of everybody.',
    players: true,
  },
  feed: {
    key: 'feed',
    label: 'Table log',
    // Not the candle: `reveals` already carries that, and two boxes wearing
    // one mark is the failure the glyph set exists to prevent.
    glyph: 'tankard',
    description: 'Everything the table has been told, in the order it landed.',
    players: true,
  },
  reveals: {
    key: 'reveals',
    label: 'Revealed',
    glyph: 'candle',
    description: 'Everything handed over, in the order it was told.',
    players: true,
  },
  notebook: {
    key: 'notebook',
    label: 'Notebook',
    glyph: 'quill',
    description: 'Your prep, and the control that hands a line of it over.',
    players: false,
  },
  quests: {
    key: 'quests',
    label: 'Quests',
    glyph: 'scroll',
    description: 'What the party is pulling on, and what is still hidden.',
    players: true,
  },
  handouts: {
    key: 'handouts',
    label: 'Handouts',
    glyph: 'letter',
    description: 'What you can push across the table right now.',
    players: true,
  },
  conditions: {
    key: 'conditions',
    label: 'Conditions',
    glyph: 'question',
    description: 'The fifteen conditions, in one line each.',
    players: true,
  },
  shop: {
    key: 'shop',
    label: 'Shop',
    glyph: 'coins',
    description:
      'What the merchant has on the shelf, what it costs, and what they will pay.',
    players: true,
  },
  rules: {
    key: 'rules',
    label: 'Rules',
    glyph: 'gavel',
    description:
      'What this table plays by, its house rules, and the book to search.',
    players: true,
  },
  timers: {
    key: 'timers',
    label: 'Timers',
    glyph: 'hourglass',
    description: 'What is running out, and how long is left of it.',
    players: true,
  },
  ledger: {
    key: 'ledger',
    label: 'Loot',
    glyph: 'coins',
    description: 'Loot, who is carrying it, and the common purse.',
    players: true,
  },
  canon: {
    key: 'canon',
    label: 'Canon',
    glyph: 'tome',
    description: 'The people, places and things this world is made of.',
    players: true,
  },
};

/**
 * How many columns of boxes the screen is built from.
 *
 * Two is a phone-sized screen, four is a real one. More than four and a box
 * is too narrow to read a stat block in, which is the thing this page exists
 * to stop you doing in another window.
 */
export const SCREEN_COLUMN_COUNTS = [2, 3, 4] as const;
export type ScreenColumnCount = (typeof SCREEN_COLUMN_COUNTS)[number];

/**
 * A screen state built from columns: a fixed number, each holding an ordered
 * stack of boxes.
 *
 * Columns rather than `{ main, rail }` because a session screen is not a page
 * with a sidebar — it is a row of panels of equal standing, creased between
 * each pair.
 */
export interface ScreenLayout {
  columns: ScreenPanelKey[][];
}

/**
 * What the session screen looks like before anyone has arranged one.
 *
 * A DM opens on the order and their own prep; a player on their own hero and
 * what they have been asked. Neither default is empty, because an empty
 * screen with a "choose some panels" prompt is a worse first impression than
 * a sensible one somebody then edits.
 */
export function defaultLayout(isStaff: boolean): ScreenLayout {
  return isStaff
    ? {
        columns: [
          ['initiative', 'vitals'],
          ['notebook', 'rolls'],
          ['rolls', 'feed'],
        ],
      }
    : {
        columns: [
          ['mine', 'initiative'],
          ['rolls', 'whispers'],
          ['handouts', 'feed'],
        ],
      };
}

/* --- the two states of the session screen -------------------------------- */

/**
 * Which of the three tables a campaign is at. **Derived, never stored.** A
 * session and an active fight already say which; a column would only drift
 * from them.
 *
 * `desk` means nobody is sitting. It is a fact about the campaign, not a
 * screen state: managing a campaign happens on the campaign page, and the
 * session screen at the desk shows the door in rather than a second record.
 */
export type TableKind = 'desk' | 'table' | 'battle';

export const TABLE_KINDS: readonly TableKind[] = ['desk', 'table', 'battle'];

export function isTableKind(value: unknown): value is TableKind {
  return (TABLE_KINDS as readonly unknown[]).includes(value);
}

/**
 * The two states the session screen actually draws. The desk is not one:
 * there is nothing to run.
 */
export type ScreenState = 'table' | 'battle';
export const SCREEN_STATES: readonly ScreenState[] = ['table', 'battle'];
export function isScreenState(value: unknown): value is ScreenState {
  return (SCREEN_STATES as readonly unknown[]).includes(value);
}

/** How each state reads, in one word, and the glyph the segment wears. */
export const TABLE_META: Record<
  TableKind,
  { label: string; glyph: GlyphName; line: string }
> = {
  desk: {
    label: 'Not sitting',
    glyph: 'quill',
    line: 'Nobody is at the table. Prep happens on the campaign page.',
  },
  table: {
    label: 'At the table',
    glyph: 'tankard',
    line: 'A session is running. Talk, search, trade, roll.',
  },
  battle: {
    label: 'In a fight',
    glyph: 'sword',
    line: 'A fight is running. The battle board in front.',
  },
};

/**
 * The fight is a different shape from the table: not columns of equal
 * standing but one board in the middle with panels around it.
 *
 * Three regions rather than one shelf, because one column beside the board
 * was never enough for a DM — the order, the stat block, the dice and the
 * party do not fit in a stack you have to scroll mid-round. Left and right
 * flank the board; the rail runs under it, for the short wide panels (the
 * order as a strip, the timers, the dice).
 */
export interface BattleLayout {
  left: ScreenPanelKey[];
  right: ScreenPanelKey[];
  /** Under the board, full width. Short panels only, by convention. */
  rail: ScreenPanelKey[];
  /**
   * Whether the flanks are drawn at all. Folded away, the board takes the
   * window and the panels become a strip of marks.
   */
  open: boolean;
  /**
   * Panels folded to their title bar. Remembered with the layout: a fold
   * was component state, and a DM who folded the whispers away lost the
   * fold on every reload, which is how a screen starts to feel cluttered.
   */
  folded: ScreenPanelKey[];
}

/** Everything one person has arranged at one campaign. */
export interface ScreenLayouts {
  /** A session with no fight running. */
  table: ScreenLayout;
  /** A fight, on a battle board. */
  battle: BattleLayout;
  /**
   * A fight at a table with a real map (`rules.board` is `'in-person'`):
   * columns, because there is no board to lead with, and the order leads
   * instead.
   */
  battleInPerson: ScreenLayout;
  /**
   * Hold the screen in one state regardless of what the campaign is at: a
   * player who wants the board up between fights, a DM checking a note
   * mid-session. A preference, not a fact about the campaign — which is why
   * it lives here and not on `campaigns`.
   */
  pin: ScreenState | null;
}

/**
 * What sits around the board before anybody has arranged it.
 *
 * A DM gets the order and the party on the left, the selected foe and the
 * dice on the right, and the timers under the board. A player gets their own
 * hero and the order on the left, their weapons and spells on the right.
 * Nothing here is a stack you scroll before the first round.
 */
export function defaultBattleLayout(isStaff: boolean): BattleLayout {
  return isStaff
    ? {
        left: ['initiative', 'vitals'],
        right: ['statblock', 'rolls'],
        rail: ['timers'],
        open: true,
        folded: [],
      }
    : {
        left: ['initiative', 'mine'],
        right: ['attacks', 'rolls'],
        rail: ['rolls'],
        open: true,
        folded: [],
      };
}

/** Every panel on a battle layout, in reading order. */
export function panelsAround(layout: BattleLayout): ScreenPanelKey[] {
  return [...layout.left, ...layout.right, ...layout.rail];
}

/**
 * The fight at a table with a real map: the order and the party's numbers
 * lead, with the timers, the checks and what the party has been shown beside
 * them. Explicitly not the board — nobody at this table is looking at one.
 */
export function defaultInPersonBattleLayout(isStaff: boolean): ScreenLayout {
  return isStaff
    ? {
        columns: [
          ['initiative', 'vitals'],
          ['statblock', 'rolls'],
          ['timers', 'reveals'],
        ],
      }
    : {
        columns: [
          ['initiative', 'mine'],
          ['attacks', 'rolls'],
          ['timers', 'reveals'],
        ],
      };
}

export function defaultLayouts(isStaff: boolean): ScreenLayouts {
  return {
    table: defaultLayout(isStaff),
    battle: defaultBattleLayout(isStaff),
    battleInPerson: defaultInPersonBattleLayout(isStaff),
    pin: null,
  };
}

/* --- presets ------------------------------------------------------------- */

/**
 * A preset is a named `ScreenLayouts` value and nothing more: applying one is
 * an ordinary save, and it round-trips through `normalizeLayouts` unchanged
 * (asserted, not assumed — see `scripts/`). A DM mid-session wants a choice,
 * not a canvas; arranging by hand is the escape hatch behind it.
 *
 * The pin is left alone: it is the viewer's, and a preset is about what the
 * boxes hold, not which state the screen is held at.
 */
export interface ScreenPreset {
  key: string;
  label: string;
  /** One line, like `TABLE_META`. */
  line: string;
  layouts: (isStaff: boolean) => Omit<ScreenLayouts, 'pin'>;
}

const withoutPin = (layouts: ScreenLayouts): Omit<ScreenLayouts, 'pin'> => {
  const { table, battle, battleInPerson } = layouts;
  return { table, battle, battleInPerson };
};

export const SCREEN_PRESETS: readonly ScreenPreset[] = [
  {
    key: 'default',
    label: 'The house screen',
    line: 'Where every screen starts. The room at the table, the board in a fight.',
    layouts: isStaff => withoutPin(defaultLayouts(isStaff)),
  },
  {
    key: 'combat',
    label: 'Combat forward',
    line: 'The order, the foe and the numbers up front, in and out of a fight.',
    layouts: isStaff => ({
      table: isStaff
        ? {
            columns: [
              ['initiative', 'vitals'],
              ['statblock', 'rolls'],
              ['rolls', 'whispers'],
            ],
          }
        : {
            columns: [['initiative', 'mine'], ['attacks', 'spells'], ['rolls']],
          },
      battle: isStaff
        ? {
            left: ['initiative', 'vitals'],
            right: ['statblock', 'attacks'],
            rail: ['rolls', 'timers'],
            open: true,
            folded: [],
          }
        : {
            left: ['initiative', 'mine'],
            right: ['attacks', 'spells'],
            rail: ['rolls'],
            open: true,
            folded: [],
          },
      battleInPerson: isStaff
        ? {
            columns: [
              ['initiative', 'vitals'],
              ['statblock', 'conditions'],
              ['rolls'],
            ],
          }
        : {
            columns: [['initiative', 'mine'], ['attacks', 'spells'], ['rolls']],
          },
    }),
  },
  {
    key: 'roleplay',
    label: 'Roleplay forward',
    line: 'Whispers, what the party has been shown and the notebook lead; the dice wait their turn.',
    layouts: isStaff => ({
      table: isStaff
        ? {
            columns: [
              ['notebook', 'whispers'],
              ['spotlight', 'reveals'],
              ['rolls', 'feed'],
            ],
          }
        : {
            columns: [
              ['whispers', 'reveals'],
              ['spotlight', 'rolls'],
              ['handouts', 'feed'],
            ],
          },
      battle: isStaff
        ? {
            left: ['initiative', 'notebook'],
            right: ['whispers', 'rolls'],
            rail: ['feed'],
            open: true,
            folded: [],
          }
        : {
            left: ['initiative', 'mine'],
            right: ['whispers', 'rolls'],
            rail: ['feed'],
            open: true,
            folded: [],
          },
      battleInPerson: isStaff
        ? {
            columns: [
              ['initiative', 'whispers'],
              ['notebook', 'rolls'],
              ['timers', 'reveals'],
            ],
          }
        : {
            columns: [
              ['initiative', 'mine'],
              ['whispers', 'rolls'],
              ['timers', 'reveals'],
            ],
          },
    }),
  },
  {
    key: 'in-person',
    label: 'Around a real map',
    line: 'Built for a table with a physical board: the order and the timers lead, and nothing draws a grid.',
    layouts: isStaff => ({
      table: isStaff
        ? {
            columns: [
              ['initiative', 'vitals'],
              ['notebook', 'rolls'],
              ['timers', 'reveals'],
            ],
          }
        : {
            columns: [
              ['mine', 'initiative'],
              ['rolls', 'whispers'],
              ['timers', 'reveals'],
            ],
          },
      battle: isStaff
        ? {
            left: ['initiative', 'vitals'],
            right: ['timers', 'rolls'],
            rail: [],
            open: true,
            folded: [],
          }
        : {
            left: ['initiative', 'mine'],
            right: ['timers', 'rolls'],
            rail: [],
            open: true,
            folded: [],
          },
      battleInPerson: defaultInPersonBattleLayout(isStaff),
    }),
  },
  {
    key: 'everything',
    label: 'Everything',
    line: 'Every box you may have, four columns at the table and both flanks in a fight. For a big monitor.',
    layouts: isStaff => {
      const keys = SCREEN_PANEL_KEYS.filter(
        k => (isStaff || SCREEN_PANELS[k].players) && k !== 'board'
      );
      const four = (order: readonly ScreenPanelKey[]): ScreenLayout => {
        const columns: ScreenPanelKey[][] = [[], [], [], []];
        order.forEach((k, i) => columns[i % 4].push(k));
        return { columns };
      };
      const lead = (first: readonly ScreenPanelKey[]) => [
        ...first.filter(k => keys.includes(k)),
        ...keys.filter(k => !first.includes(k)),
      ];
      const around = lead(['initiative', 'statblock', 'mine', 'rolls']);
      return {
        table: four(lead(['sitting', 'initiative', 'vitals', 'rolls'])),
        battle: {
          left: around.filter((_, i) => i % 2 === 0),
          right: around.filter((_, i) => i % 2 === 1),
          rail: [],
          open: true,
          folded: [],
        },
        battleInPerson: four(
          lead(['initiative', 'vitals', 'statblock', 'timers'])
        ),
      };
    },
  },
];

export function screenPreset(key: string): ScreenPreset | undefined {
  return SCREEN_PRESETS.find(p => p.key === key);
}

/**
 * Coerce whatever was stored into the arrangements this build draws.
 *
 * Three shapes have been stored over time and all three still read: the
 * original single `{ columns }` (or `{ main, rail }`) arrangement, the
 * desk/table/battle triple with a one-sided `shelf`, and this one. A `desk`
 * arrangement is dropped rather than migrated: the session screen no longer
 * has a desk, and the panels that only made sense there are gone with it.
 */
export function normalizeLayouts(
  raw: unknown,
  isStaff: boolean
): ScreenLayouts {
  const src = (raw ?? {}) as Record<string, unknown>;
  const base = defaultLayouts(isStaff);

  // The old single-arrangement shape.
  if ('columns' in src || 'main' in src || 'rail' in src) {
    return { ...base, table: normalizeLayout(src, isStaff) };
  }

  return {
    table: src.table ? normalizeLayout(src.table, isStaff) : base.table,
    battleInPerson: src.battleInPerson
      ? normalizeLayout(src.battleInPerson, isStaff, base.battleInPerson)
      : base.battleInPerson,
    battle: normalizeBattleLayout(src.battle, isStaff),
    // A pin at the desk was a pin at a state that no longer draws; it reads
    // as no pin, which is what following the campaign means.
    pin: isScreenState(src.pin) ? src.pin : null,
  };
}

/**
 * Coerce a stored battle arrangement into three regions.
 *
 * Reads the one-shelf shape that came before — `{ shelf, shelfSide }` — by
 * putting the shelf on the right, or splitting it between the flanks when it
 * was set to `both`, which is what `both` drew.
 */
export function normalizeBattleLayout(
  raw: unknown,
  isStaff: boolean
): BattleLayout {
  const base = defaultBattleLayout(isStaff);
  const src = (raw ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();

  const clean = (value: unknown): ScreenPanelKey[] => {
    const out: ScreenPanelKey[] = [];
    for (const item of Array.isArray(value) ? value : []) {
      const key = readKey(String(item));
      if (!key) continue;
      if (!isStaff && !SCREEN_PANELS[key].players) continue;
      // The board is the middle; it is never a panel around itself.
      if (key === 'board') continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  };

  let left: ScreenPanelKey[];
  let right: ScreenPanelKey[];
  let rail: ScreenPanelKey[];

  if ('shelf' in src) {
    const shelf = clean(src.shelf);
    if (src.shelfSide === 'both') {
      // `both` put the odd panels on the left, which is what it drew.
      left = shelf.filter((_, i) => i % 2 === 1);
      right = shelf.filter((_, i) => i % 2 === 0);
    } else {
      left = [];
      right = shelf;
    }
    rail = [];
  } else {
    left = clean(src.left);
    right = clean(src.right);
    rail = clean(src.rail);
  }

  if (left.length === 0 && right.length === 0 && rail.length === 0) {
    return { ...base, open: src.open === false ? false : base.open };
  }

  const kept = new Set<ScreenPanelKey>([...left, ...right, ...rail]);
  const folded: ScreenPanelKey[] = [];
  for (const item of Array.isArray(src.folded) ? src.folded : []) {
    const key = String(item);
    if (!isScreenPanelKey(key) || !kept.has(key)) continue;
    if (!folded.includes(key)) folded.push(key);
  }

  return {
    left,
    right,
    rail,
    // `shelfOpen` was the old name for the same switch.
    open:
      typeof src.open === 'boolean'
        ? src.open
        : typeof src.shelfOpen === 'boolean'
          ? src.shelfOpen
          : true,
    folded,
  };
}

export function isScreenPanelKey(value: string): value is ScreenPanelKey {
  return (SCREEN_PANEL_KEYS as readonly string[]).includes(value);
}

/**
 * Keys that were two panels and are now one.
 *
 * A layout is a preference and an unknown key is ordinarily dropped, but
 * `dice` and `checks` were not removed — they were merged into `rolls`, and
 * dropping them would silently take the dice off a screen somebody arranged.
 * The dedup in `clean` turns the pair into one box wherever both were on.
 */
const MERGED: Record<string, ScreenPanelKey> = {
  dice: 'rolls',
  checks: 'rolls',
};

/** What a stored key means today, or null when nothing draws it any more. */
function readKey(raw: string): ScreenPanelKey | null {
  if (isScreenPanelKey(raw)) return raw;
  return MERGED[raw] ?? null;
}

/** Every panel on a layout, in reading order. */
export function panelsOn(layout: ScreenLayout): ScreenPanelKey[] {
  return layout.columns.flat();
}

/**
 * Coerce whatever was stored into a layout this build can draw.
 *
 * Unknown keys are dropped rather than migrated — a layout is a preference,
 * and the price of a panel that no longer exists is that it stops appearing.
 * A panel a player may not have is dropped here too, so a demoted co-DM does
 * not keep the notebook on their screen.
 *
 * Also reads the original `{ main, rail }` shape, so a screen somebody
 * arranged before this became a column grid survives as its first two columns
 * rather than being silently reset to the default.
 */
export function normalizeLayout(
  raw: unknown,
  isStaff: boolean,
  /** What an arrangement with nothing left on it becomes. */
  fallback: ScreenLayout = defaultLayout(isStaff)
): ScreenLayout {
  const source = (raw ?? {}) as {
    columns?: unknown;
    main?: unknown;
    rail?: unknown;
  };

  // One pass, not chained filters: `Array.prototype.filter` runs to completion
  // before the next one starts, so a `seen` set populated in a later filter is
  // still empty while the earlier one is deciding — which let the same panel
  // through twice in the same column.
  const seen = new Set<string>();
  const clean = (value: unknown): ScreenPanelKey[] => {
    const out: ScreenPanelKey[] = [];
    for (const item of Array.isArray(value) ? value : []) {
      const key = readKey(String(item));
      if (!key) continue;
      if (!isStaff && !SCREEN_PANELS[key].players) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  };

  const stored = Array.isArray(source.columns)
    ? source.columns.map(clean)
    : [clean(source.main), clean(source.rail)];

  // Empty columns are kept: a column you emptied on purpose is a space you are
  // about to drop something into, and closing it up would move every box on
  // the screen while you were looking away.
  const columns = stored.slice(0, Math.max(...SCREEN_COLUMN_COUNTS));
  if (columns.every(c => c.length === 0)) return fallback;
  return { columns: columns.length > 0 ? columns : [[]] };
}
