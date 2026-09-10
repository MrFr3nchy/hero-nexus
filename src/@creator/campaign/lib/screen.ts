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
  'initiative',
  'mine',
  'vitals',
  'dice',
  'checks',
  'spotlight',
  'feed',
  'reveals',
  'notebook',
  'quests',
  'handouts',
  'conditions',
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
          ['checks', 'spotlight'],
          ['handouts', 'feed'],
        ],
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
