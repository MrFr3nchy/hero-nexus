import { Tooltip } from '@heroui/react';

import { Pill } from '@/@shared/components/ui';
import type { Encumbrance } from '../lib/derive';

/** The state in words, and what it costs. Empty for `fine`. */
export function loadWords(load: Encumbrance): string {
  switch (load.state) {
    case 'over':
      return 'over capacity · cannot move';
    case 'heavily':
      return `heavily encumbered · −${load.speedPenalty} ft, disadvantage on STR/DEX/CON`;
    case 'encumbered':
      return `encumbered · −${load.speedPenalty} ft`;
    default:
      return '';
  }
}

/**
 * "63 / 225 lb" as a chip (09), coloured by how close to the line the pack
 * is: quiet while fine, warning while slowed, danger when it will not move.
 * The same chip on the builder's equipment step, the sheet, and Your hero,
 * so the number reads the same everywhere it appears.
 */
export function WeightChip({ load }: { load: Encumbrance | null }) {
  if (!load) return null;
  const tone =
    load.state === 'over'
      ? 'danger'
      : load.state === 'fine'
        ? 'default'
        : 'warning';
  const why = loadWords(load);
  const chip = (
    <Pill tone={tone}>
      <span className="tabular-nums normal-case tracking-normal">
        {load.carried} / {load.capacity} lb
      </span>
      {load.state !== 'fine' && (
        <span>
          {' · '}
          {load.state === 'over'
            ? 'over'
            : load.state === 'heavily'
              ? 'heavy'
              : 'laden'}
        </span>
      )}
    </Pill>
  );
  return why ? (
    <Tooltip content={why} className="max-w-xs text-xs">
      <span className="inline-flex cursor-help">{chip}</span>
    </Tooltip>
  ) : (
    chip
  );
}
