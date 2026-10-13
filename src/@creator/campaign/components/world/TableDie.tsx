'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@heroui/react';
import { useEffect, useState } from 'react';

import { Glyph } from '@/@shared/components/ui';
import type { RandomTableRow } from '../../lib/random-tables';
import { drawFromTableAction } from '../../random-table-actions';

/** A name drawn from a random table, and where to strike it if it is kept. */
export interface Drawn {
  tableId: string;
  index: number;
  text: string;
}

const remembered = (purpose: string) => `hero-nexus:table-die:${purpose}`;

function readRemembered(purpose: string): string | null {
  try {
    return window.localStorage.getItem(remembered(purpose));
  } catch {
    return null;
  }
}

function remember(purpose: string, tableId: string) {
  try {
    window.localStorage.setItem(remembered(purpose), tableId);
  } catch {
    // A private window: the die asks which table again next time.
  }
}

/**
 * The die beside a field: roll it on one of the DM's random tables.
 *
 * The first press asks which table (and remembers, per field — the name die
 * keeps its names table, the personality die its quirks); after that a press
 * rolls again on the same one, and the small "from" link changes it. A draw
 * is only a suggestion: nothing is struck through until the NPC it named is
 * kept.
 */
export function TableDie({
  tables,
  purpose,
  label,
  onDrawn,
  onError,
}: {
  tables: RandomTableRow[];
  /** Which field this die is for, so each remembers its own table. */
  purpose: string;
  label: string;
  onDrawn: (drawn: Drawn) => void;
  onError: (message: string) => void;
}) {
  const [tableId, setTableId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = readRemembered(purpose);
    if (id && tables.some(t => t.id === id)) setTableId(id);
  }, [purpose, tables]);

  const roll = async (id: string) => {
    setBusy(true);
    const res = await drawFromTableAction(id, 1);
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    const [hit] = res.data;
    if (!hit) {
      onError('Every entry on that random table has been used.');
      return;
    }
    onDrawn({ tableId: id, index: hit.index, text: hit.text });
  };

  if (tables.length === 0) {
    return (
      <Tooltip content="Make a random table (under Random tables) and this die rolls on it.">
        <span className="inline-flex h-8 w-8 items-center justify-center text-ink-subtle opacity-50">
          <Glyph name="die" size={16} />
        </span>
      </Tooltip>
    );
  }

  const current = tables.find(t => t.id === tableId) ?? null;

  const picker = (
    <ul className="max-h-64 overflow-y-auto py-1 text-sm">
      {tables.map(t => {
        const left = t.entries.filter(e => !e.struck).length;
        return (
          <li key={t.id}>
            <button
              type="button"
              disabled={left === 0}
              className="flex w-full items-baseline justify-between gap-3 rounded px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-50"
              onClick={() => {
                setTableId(t.id);
                remember(purpose, t.id);
                setOpen(false);
                void roll(t.id);
              }}
            >
              <span className="text-ink">{t.title}</span>
              <span className="text-xs tabular-nums text-ink-subtle">
                {left} left
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  const die = (
    <Button
      isIconOnly
      size="sm"
      variant="flat"
      aria-label={
        current
          ? `${label}: roll on ${current.title}`
          : `${label}: pick a table`
      }
      isDisabled={busy}
      onPress={current ? () => void roll(current.id) : undefined}
    >
      <Glyph name="die" size={16} />
    </Button>
  );
  const name = (
    <button
      type="button"
      className="max-w-[8rem] truncate text-[0.65rem] text-ink-subtle hover:text-ink"
      title="Which random table this die rolls on"
    >
      {current ? current.title : 'which table?'}
    </button>
  );

  // Before a table is chosen the die asks which; after, the die rolls and
  // the table's name beside it is what changes the table.
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {current && die}
      <Popover
        isOpen={open}
        onOpenChange={setOpen}
        placement="bottom-end"
        shouldBlockScroll={false}
      >
        <PopoverTrigger>{current ? name : die}</PopoverTrigger>
        <PopoverContent className="w-60 p-1">
          <p className="px-2 pt-1 text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
            Roll on
          </p>
          {picker}
        </PopoverContent>
      </Popover>
    </span>
  );
}
