import { describe, expect, it } from 'vitest';

import {
  defaultLayouts,
  normalizeLayouts,
  panelsAround,
  panelsOn,
  SCREEN_PANELS,
  SCREEN_PRESETS,
  type ScreenLayouts,
  type ScreenPanelKey,
} from './screen';

const repeats = (keys: ScreenPanelKey[]): ScreenPanelKey[] =>
  keys.filter((k, i) => keys.indexOf(k) !== i);

/**
 * Every arrangement a person can land on without arranging anything: the
 * defaults, a screen with nothing stored, and each preset. A repeat in any of
 * them is the same box drawn twice — which is what a DM who had never pressed
 * Arrange used to get, with Rolls in two columns.
 */
function arrangements(
  isStaff: boolean
): [string, Omit<ScreenLayouts, 'pin'>][] {
  return [
    ['defaults', defaultLayouts(isStaff)],
    ['nothing stored', normalizeLayouts(undefined, isStaff)],
    ...SCREEN_PRESETS.map(
      p => [`preset ${p.key}`, p.layouts(isStaff)] as [string, ScreenLayouts]
    ),
  ];
}

describe.each([
  ['staff', true],
  ['player', false],
])('the %s screen', (_, isStaff) => {
  it.each(arrangements(isStaff))('%s draws no panel twice', (_n, layouts) => {
    expect(repeats(panelsOn(layouts.table))).toEqual([]);
    expect(repeats(panelsOn(layouts.battleInPerson))).toEqual([]);
    expect(repeats(panelsAround(layouts.battle))).toEqual([]);
  });

  it.each(arrangements(isStaff))(
    '%s holds only panels this reader may have',
    (_n, layouts) => {
      const all = [
        ...panelsOn(layouts.table),
        ...panelsOn(layouts.battleInPerson),
        ...panelsAround(layouts.battle),
      ];
      for (const key of all) {
        expect(isStaff || SCREEN_PANELS[key].players).toBe(true);
      }
    }
  );
});

describe('normalizeLayouts', () => {
  it('drops a repeat that was stored', () => {
    const out = normalizeLayouts(
      {
        table: { columns: [['rolls'], ['rolls', 'feed']] },
        battle: { left: ['rolls'], right: ['rolls'], rail: [] },
      },
      true
    );
    expect(out.table.columns).toEqual([['rolls'], ['feed']]);
    expect(panelsAround(out.battle)).toEqual(['rolls']);
  });
});
