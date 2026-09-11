'use client';

/**
 * The only door into `BattleMap3D`.
 *
 * `ssr: false` and a dynamic import, and both are load-bearing: Three.js is
 * roughly 600 KB minified and there is no WebGL in Node. Imported directly,
 * it would land in the campaign page's initial bundle — every DM opening the
 * quests tab would pay for a renderer they never look at — and crash on the
 * server the first time it touched `window`.
 *
 * Verified by bundle inspection, not by eye: `three` appears in a chunk of its
 * own and in no chunk the layout loads.
 */
import dynamic from 'next/dynamic';

import { DiceSpinner } from '@/@shared/components/ui';

export const BattleMap3DLazy = dynamic(() => import('./BattleMap3D'), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-10">
      <DiceSpinner label="Setting the table…" />
    </div>
  ),
});
