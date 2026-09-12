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
  'dice',
  'checks',
  'attacks',
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
  'timers',
  'ledger',
  'canon',
  'chronicle',
  'downtime',
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
    label: 'The table',
    glyph: 'person',
    description: 'Whether the evening has been called, and who is looking.',
    players: true,
  },
  board: {
    key: 'board',
    label: 'The sand table',
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
    label: 'The party',
    glyph: 'person',
    description: 'Every character’s hit points, slots and passive scores.',
    players: true,
  },
  dice: {
    key: 'dice',
    label: 'Dice',
    glyph: 'die',
    description:
      'The shared roll log, and rolling in the open or behind the screen.',
    players: true,
  },
  checks: {
    key: 'checks',
    label: 'The asking',
    glyph: 'target',
    description: 'Rolls the DM has put to the table, and what came back.',
    // A player needs to see what they were asked at least as much as the DM
    // needs to see who has answered.
    players: true,
  },
  attacks: {
    key: 'attacks',
    label: 'Attacks',
    glyph: 'sword',
    description: 'Your weapons in hand, with to-hit and damage ready to roll.',
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
    label: 'On the table',
    glyph: 'map',
    description: 'The map the DM has put in front of everybody.',
    players: true,
  },
  feed: {
    key: 'feed',
    label: 'The evening',
    // Not the candle: `reveals` already carries that, and two boxes wearing
    // one mark is the failure the glyph set exists to prevent.
    glyph: 'tankard',
    description: 'Everything the table has been told, in the order it landed.',
    players: true,
  },
  reveals: {
    key: 'reveals',
    label: 'What they know',
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
    label: 'Threads',
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
  rules: {
    key: 'rules',
    label: 'Rules at hand',
    glyph: 'gavel',
    description:
      'What this table plays by, its house rules, and the book to search.',
    players: true,
  },
  timers: {
    key: 'timers',
    label: 'The hourglass',
    glyph: 'hourglass',
    description: 'What is running out, and how long is left of it.',
    players: true,
  },
  ledger: {
    key: 'ledger',
    label: 'The haul',
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
  chronicle: {
    key: 'chronicle',
    label: 'Sittings',
    glyph: 'notebook',
    description: 'Sessions, prep, recaps and who was there.',
    players: true,
  },
  downtime: {
    key: 'downtime',
    label: 'Downtime',
    glyph: 'hourglass',
    description: 'What the party is doing between sittings.',
    players: true,
  },
};

/**
 * How many columns of boxes the screen is built from.
 *
 * Two is a phone-sized desk, four is a real one. More than four and a box is
 * too narrow to read a stat block in, which is the thing this page exists to
 * stop you doing in another window.
 */
export const SCREEN_COLUMN_COUNTS = [2, 3, 4] as const;
export type ScreenColumnCount = (typeof SCREEN_COLUMN_COUNTS)[number];

/**
 * The screen: a fixed number of columns, each holding an ordered stack of
 * boxes.
 *
 * Columns rather than the old `{ main, rail }` because a DM screen is not a
 * page with a sidebar — it is a row of panels of equal standing, creased
 * between each pair, and the thing that made the first version tiring was that
 * everything below the fold of a long left column needed scrolling to reach.
 */
export interface ScreenLayout {
  columns: ScreenPanelKey[][];
}

/**
 * What a screen looks like before anyone has arranged one.
 *
 * A DM opens on the fight and their own prep; a player on their party and what
 * they have been told. Neither default is empty, because an empty screen with
 * a "choose some panels" prompt is a worse first impression than a sensible
 * one somebody then edits.
 *
 * Two boxes per column, not three: three thirds of a laptop screen is a box
 * eight lines tall, and a box you have to scroll is the thing this replaced.
 *
 * Both defaults now carry `checks` and `feed`, which is the whole reason the
 * room works out of the box: `checks` is where a player answers the DM without
 * hunting for it, and `feed` is where anybody finding the corner too busy goes
 * to turn it down. A player also opens on their own hero rather than on the
 * party's hit points — they have the party in the corner now, and what they
 * did not have was their own spell slots.
 *
 * A player's table opens on `whispers` where it used to open on the
 * spotlight: the table is where "I pocket the key" gets said, and a lit map
 * announces itself and can be added back. The DM's default is unchanged —
 * every whisper reaches them in the corner and the feed regardless.
 */
export function defaultLayout(isStaff: boolean): ScreenLayout {
  return isStaff
    ? {
        columns: [
          ['initiative', 'vitals'],
          ['notebook', 'checks'],
          ['dice', 'feed'],
        ],
      }
    : {
        columns: [
          ['mine', 'initiative'],
          ['checks', 'whispers'],
          ['handouts', 'feed'],
        ],
      };
}

/* --- the three tables ---------------------------------------------------- */

/**
 * Which of the three tables a campaign is at. **Derived, never stored.**
 * A sitting and an active fight
 * already say which; a column would only drift from them.
 */
export type TableKind = 'desk' | 'table' | 'battle';

export const TABLE_KINDS: readonly TableKind[] = ['desk', 'table', 'battle'];

export function isTableKind(value: unknown): value is TableKind {
  return (TABLE_KINDS as readonly unknown[]).includes(value);
}

/** How each table reads, in one word, and the glyph the ribbon wears. */
export const TABLE_META: Record<
  TableKind,
  { label: string; glyph: GlyphName; line: string }
> = {
  desk: {
    label: 'The desk',
    glyph: 'quill',
    line: 'Between sittings. Notes, canon, the chronicle.',
  },
  table: {
    label: 'The table',
    glyph: 'tankard',
    line: 'Sitting. Talk, search, trade, roll.',
  },
  battle: {
    label: 'The sand table',
    glyph: 'sword',
    line: 'A fight is running. The board in front.',
  },
};

/**
 * The battle arrangement is a different shape from the other two: not
 * columns of equal standing but one main region — the board — and one shelf
 * beside it holding the panels the viewer chose, collapsible to a strip.
 */
export interface BattleLayout {
  shelf: ScreenPanelKey[];
  shelfOpen: boolean;
}

/** Everything one person has arranged at one campaign. */
export interface ScreenLayouts {
  desk: ScreenLayout;
  table: ScreenLayout;
  battle: BattleLayout;
  /**
   * Pin the screen to one table regardless of what the campaign is at: a
   * player who wants the board up between fights, a DM checking a note
   * mid-sitting. A preference, not a fact about the campaign — which is why it
   * lives here and not on `campaigns`.
   */
  pin: TableKind | null;
}

/**
 * The desk is the app as it stood before any of this: prep and record. Its
 * screen leads with the notebook and the chronicle for a DM, and with what
 * the party knows for a player.
 */
export function defaultDeskLayout(isStaff: boolean): ScreenLayout {
  return isStaff
    ? {
        columns: [
          ['notebook', 'quests'],
          ['chronicle', 'canon'],
          ['downtime', 'ledger'],
        ],
      }
    : {
        columns: [
          ['reveals', 'quests'],
          ['chronicle', 'canon'],
          ['ledger', 'downtime'],
        ],
      };
}

/**
 * What sits beside the board before anybody has arranged it.
 *
 * A DM gets the order and the foe in hand; a player gets their own numbers and
 * their weapons. Both get the dice and the asking, because a fight is mostly
 * rolling, and the evening, because the corner is easy to miss with a board
 * in front.
 */
export function defaultBattleLayout(isStaff: boolean): BattleLayout {
  return {
    shelf: isStaff
      ? ['initiative', 'statblock', 'dice', 'checks', 'whispers', 'feed']
      : ['mine', 'attacks', 'dice', 'checks', 'whispers', 'feed'],
    shelfOpen: true,
  };
}

export function defaultLayouts(isStaff: boolean): ScreenLayouts {
  return {
    desk: defaultDeskLayout(isStaff),
    table: defaultLayout(isStaff),
    battle: defaultBattleLayout(isStaff),
    pin: null,
  };
}

/**
 * Coerce whatever was stored into the three arrangements.
 *
 * Reads the shape before this work — one arrangement, `{ columns }` or the
 * older `{ main, rail }` — as the **table** arrangement, so a screen somebody
 * arranged when there was only one survives as the one they will see most.
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

  const battleRaw = (src.battle ?? {}) as Partial<BattleLayout>;
  const seen = new Set<string>();
  const shelf: ScreenPanelKey[] = [];
  for (const item of Array.isArray(battleRaw.shelf) ? battleRaw.shelf : []) {
    const key = String(item);
    if (!isScreenPanelKey(key)) continue;
    if (!isStaff && !SCREEN_PANELS[key].players) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    shelf.push(key);
  }

  return {
    desk: src.desk ? normalizeLayout(src.desk, isStaff) : base.desk,
    table: src.table ? normalizeLayout(src.table, isStaff) : base.table,
    battle: {
      shelf: shelf.length > 0 ? shelf : base.battle.shelf,
      shelfOpen: battleRaw.shelfOpen ?? true,
    },
    pin: isTableKind(src.pin) ? src.pin : null,
  };
}

export function isScreenPanelKey(value: string): value is ScreenPanelKey {
  return (SCREEN_PANEL_KEYS as readonly string[]).includes(value);
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
export function normalizeLayout(raw: unknown, isStaff: boolean): ScreenLayout {
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
      const key = String(item);
      if (!isScreenPanelKey(key)) continue;
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
  if (columns.every(c => c.length === 0)) return defaultLayout(isStaff);
  return { columns: columns.length > 0 ? columns : [[]] };
}
