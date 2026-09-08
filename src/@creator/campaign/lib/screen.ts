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
  'initiative',
  'vitals',
  'dice',
  'reveals',
  'notebook',
  'quests',
  'handouts',
  'conditions',
  'ledger',
  'canon',
  'chronicle',
  'downtime',
] as const;

export type ScreenPanelKey = (typeof SCREEN_PANEL_KEYS)[number];

export type ScreenRail = 'main' | 'rail';

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
  initiative: {
    key: 'initiative',
    label: 'Initiative',
    glyph: 'sword',
    description: 'The order, hit points, conditions, and whose turn it is.',
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

export interface ScreenLayout {
  main: ScreenPanelKey[];
  rail: ScreenPanelKey[];
}

/**
 * What a screen looks like before anyone has arranged one.
 *
 * A DM opens on the fight; a player opens on their own party and what they
 * have been told. Neither default is empty, because an empty screen with a
 * "choose some panels" prompt is a worse first impression than a sensible one
 * somebody then edits.
 */
export function defaultLayout(isStaff: boolean): ScreenLayout {
  return isStaff
    ? {
        main: ['initiative', 'vitals', 'dice'],
        rail: ['reveals', 'quests', 'conditions'],
      }
    : {
        main: ['vitals', 'initiative', 'dice'],
        rail: ['reveals', 'quests', 'handouts'],
      };
}

export function isScreenPanelKey(value: string): value is ScreenPanelKey {
  return (SCREEN_PANEL_KEYS as readonly string[]).includes(value);
}

/**
 * Coerce whatever was stored into a layout this build can draw.
 *
 * Unknown keys are dropped rather than migrated — a layout is a preference,
 * and the price of a panel that no longer exists is that it stops appearing.
 * A panel a player may not have is dropped here too, so a demoted co-DM does
 * not keep the notebook on their screen.
 */
export function normalizeLayout(raw: unknown, isStaff: boolean): ScreenLayout {
  const source = (raw ?? {}) as Partial<Record<ScreenRail, unknown>>;

  // One pass, not chained filters: `Array.prototype.filter` runs to completion
  // before the next one starts, so a `seen` set populated in a later filter is
  // still empty while the earlier one is deciding — which let the same panel
  // through twice in the same rail.
  const clean = (value: unknown, seen: Set<string>): ScreenPanelKey[] => {
    const out: ScreenPanelKey[] = [];
    for (const raw of Array.isArray(value) ? value : []) {
      const key = String(raw);
      if (!isScreenPanelKey(key)) continue;
      if (!isStaff && !SCREEN_PANELS[key].players) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  };

  // One `seen` across both rails: the same panel twice on one screen is two
  // copies of one poller, and the second one is never what anybody wanted.
  const seen = new Set<string>();
  const main = clean(source.main, seen);
  const rail = clean(source.rail, seen);

  if (main.length === 0 && rail.length === 0) return defaultLayout(isStaff);
  return { main, rail };
}
