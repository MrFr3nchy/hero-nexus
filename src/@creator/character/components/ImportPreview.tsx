'use client';

import { Button } from '@heroui/react';

import { SectionCard } from '@/@shared/components/ui';
import type { DdbPreview } from '@/server/ddb-import';

/**
 * A hero that was not built in the builder, before it is one: what came
 * across, what matched the SRD and what still needs a match. Shared by the
 * D&D Beyond import and the AI draft, which both arrive as the same facts
 * and both become a character the same way — a draft opened in the builder.
 */
export function ImportPreview({
  preview,
  source,
  busy,
  onCreate,
}: {
  preview: DdbPreview;
  /** Where the facts came from, for the one line that differs. */
  source: 'ddb' | 'ai';
  busy: boolean;
  onCreate: () => void;
}) {
  const matchedItems = preview.items.filter(i => i.match);
  const loneItems = preview.items.filter(i => !i.match);
  const matchedSpells = preview.spells.filter(s => s.match);
  const loneSpells = preview.spells.filter(s => !s.match);

  return (
    <SectionCard
      title={preview.facts.name}
      description={[
        preview.facts.classes
          .map(
            c => `${c.name} ${c.level}${c.subclass ? ` (${c.subclass})` : ''}`
          )
          .join(' / '),
        preview.facts.species,
        preview.facts.background,
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink">
          Level {preview.facts.level} · {preview.facts.hitPointsMax ?? '?'} hit
          points ·{' '}
          {Object.entries(preview.facts.abilities)
            .map(([k, v]) => `${k.slice(0, 3).toUpperCase()} ${v}`)
            .join(' · ')}
        </p>

        <ul className="space-y-1 text-ink-muted">
          {preview.facts.warnings.map(w => (
            <li key={w}>{w}</li>
          ))}
        </ul>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-gold/80">
              Found in the SRD
            </h3>
            <p className="mt-1 text-ink-muted">
              {[...matchedItems, ...matchedSpells]
                .map(x => x.match!.name)
                .join(', ') || 'Nothing matched.'}
            </p>
          </div>
          <div>
            <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-warning">
              Needs a match
            </h3>
            <p className="mt-1 text-ink-muted">
              {[...loneItems, ...loneSpells].map(x => x.name).join(', ') ||
                'Nothing — everything matched.'}
            </p>
            {(loneItems.length > 0 || loneSpells.length > 0) && (
              <p className="mt-1 text-xs text-ink-subtle">
                Items come in by name, marked to be matched; spells are listed
                in the class features.{' '}
                {source === 'ddb'
                  ? 'Nothing is turned into homebrew — most of it is from books, and homebrew can be shared.'
                  : 'The draft named something the SRD does not have; swap it in the builder, or forge it.'}
              </p>
            )}
          </div>
        </div>

        <Button color="primary" isLoading={busy} onPress={onCreate}>
          Create the draft and open the builder
        </Button>
      </div>
    </SectionCard>
  );
}
