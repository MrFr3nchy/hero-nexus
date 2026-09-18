import { Fragment, type ReactNode } from 'react';

interface LedgerItem {
  value: ReactNode;
  /** The label beside the count, in the plural. */
  label: string;
  /** The label when the count is exactly one — "1 hero", not "1 heroes". */
  one?: string;
}

interface LedgerProps {
  items: LedgerItem[];
  className?: string;
}

function isEmptyValue(value: ReactNode): boolean {
  return (
    value === 0 ||
    value === '0' ||
    value === '—' ||
    value === '' ||
    value === null ||
    value === undefined
  );
}

/**
 * A count line set as prose, not tiles (design rule 2). Use for numbers that
 * aren't the point of the page — e.g. "3 heroes / 2 campaigns / 11 homebrew".
 *
 * When every value is empty (0 / —) the whole line drops to the subtle ink so
 * it reads as one quiet fact rather than a row of broken-looking zeroes.
 */
export function Ledger({ items, className }: LedgerProps) {
  const allEmpty = items.every(item => isEmptyValue(item.value));

  return (
    <p
      className={`text-sm ${allEmpty ? 'text-ink-subtle' : 'text-ink-muted'} ${className ?? ''}`}
    >
      {items.map((item, i) => (
        <Fragment key={item.label}>
          {i > 0 && <span className="mx-2 text-gold/50">/</span>}
          <span className={allEmpty ? undefined : 'text-ink tabular-nums'}>
            {item.value}
          </span>{' '}
          {item.one && (item.value === 1 || item.value === '1')
            ? item.one
            : item.label}
        </Fragment>
      ))}
    </p>
  );
}
