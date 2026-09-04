'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';

import {
  CONDITIONS,
  conditionDef,
  parseConditions,
} from '@/@creator/campaign/lib/conditions';

/** The chips a combatant is currently under. Read-only; the picker edits. */
export function ConditionChips({ stored }: { stored: string }) {
  const keys = parseConditions(stored);
  if (keys.length === 0) return null;

  return (
    <>
      {keys.map(key => {
        const def = conditionDef(key);
        if (!def) return null;
        const skin =
          def.tone === 'danger'
            ? 'border-danger/40 bg-danger/10 text-danger'
            : 'border-warning/40 bg-warning/10 text-warning';
        return (
          <span
            key={key}
            title={def.hint}
            className={`rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] ${skin}`}
          >
            {def.label}
          </span>
        );
      })}
    </>
  );
}

/**
 * Toggle conditions from the fixed 2024 list.
 *
 * Each row carries the one line a DM needs mid-turn, because the question at
 * the table is never "is it restrained" — it is "so does that attack have
 * advantage", and the answer should not be in another tab.
 */
export function ConditionPicker({
  stored,
  onChange,
}: {
  stored: string;
  onChange: (keys: string[]) => void;
}) {
  const active = new Set(parseConditions(stored));

  const toggle = (key: string) => {
    const next = new Set(active);
    if (next.has(key as never)) next.delete(key as never);
    else next.add(key as never);
    onChange(Array.from(next));
  };

  return (
    <Popover placement="bottom-end">
      <PopoverTrigger>
        <Button size="sm" variant="flat" className="min-w-0 px-2">
          {active.size > 0 ? `${active.size} cond.` : 'Conditions'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-80 w-72 overflow-y-auto border border-line bg-surface p-2">
        <ul className="w-full space-y-0.5">
          {CONDITIONS.map(c => {
            const on = active.has(c.key);
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => toggle(c.key)}
                  className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                    on
                      ? 'bg-gold/12 text-ink'
                      : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 rounded-full ${
                        on
                          ? c.tone === 'danger'
                            ? 'bg-danger'
                            : 'bg-warning'
                          : 'bg-line'
                      }`}
                    />
                    {c.label}
                  </span>
                  <span className="mt-0.5 block pl-4 text-xs leading-snug text-ink-subtle">
                    {c.hint}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
