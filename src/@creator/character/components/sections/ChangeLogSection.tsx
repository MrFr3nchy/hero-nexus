'use client';

import { useState } from 'react';
import { type Control, useWatch } from 'react-hook-form';

import { SectionCard } from '@/@shared/components/ui';

import type { CharacterSheet, ProvenanceKind } from '../../schema';

const KIND_LABEL: Record<ProvenanceKind, string> = {
  field: 'Custom field',
  'stat-manual': 'Manual score',
  'stat-roll': 'Dice roll',
  'stat-pointbuy': 'Point buy',
  'stat-standard': 'Standard array',
  method: 'Method',
  homebrew: 'Homebrew',
};

const KIND_TONE: Record<ProvenanceKind, string> = {
  field: 'border-line text-ink-muted',
  'stat-manual': 'border-warning/40 text-warning',
  'stat-roll': 'border-gold/50 text-gold-strong',
  'stat-pointbuy': 'border-info/40 text-info',
  'stat-standard': 'border-info/40 text-info',
  method: 'border-line text-ink-subtle',
  homebrew: 'border-arcane/40 text-arcane',
};

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChangeLogSection({
  control,
}: {
  control: Control<CharacterSheet>;
}) {
  const [open, setOpen] = useState(false);
  const provenance = (useWatch({ control, name: 'provenance' }) ??
    []) as CharacterSheet['provenance'];

  const ordered = [...provenance].reverse();

  return (
    <SectionCard
      title="Change log"
      description="Shared with the DM when this character joins a campaign."
      actions={
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {open ? 'Hide' : `Show (${provenance.length})`}
        </button>
      }
    >
      {provenance.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          Nothing custom yet. Roll dice, use point buy, type your own species,
          or add homebrew and it shows up here.
        </p>
      ) : !open ? (
        <p className="text-sm text-ink-muted">
          {provenance.length} entr{provenance.length === 1 ? 'y' : 'ies'}{' '}
          recorded.
        </p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {ordered.map(e => (
            <li
              key={e.id}
              className="flex items-start gap-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm"
            >
              <span
                className={`mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] ${KIND_TONE[e.kind]}`}
              >
                {KIND_LABEL[e.kind]}
              </span>
              <span className="flex-1 text-ink-muted">
                {e.detail || e.label}
                {e.rolls && (
                  <span className="ml-1 text-ink-subtle tabular-nums">
                    [{e.rolls.join(', ')}]
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
                {timeLabel(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
