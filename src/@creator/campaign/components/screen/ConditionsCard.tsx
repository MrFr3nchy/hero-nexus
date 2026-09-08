'use client';

import { SectionCard } from '@/@shared/components/ui';
import { CONDITIONS } from '../../lib/conditions';

/**
 * The fifteen conditions, one line each.
 *
 * The one piece of the rules a DM looks up mid-turn more than any other, and
 * the app already holds it — `CONDITIONS` is what the tracker's chips are
 * built from, so this is the same vocabulary rather than a second copy of it.
 */
export function ConditionsCard() {
  return (
    <SectionCard
      title="Conditions"
      description="What it actually does, in one line."
    >
      <dl className="space-y-2">
        {CONDITIONS.map(c => (
          <div key={c.key}>
            <dt
              className={`font-display-alt text-[0.68rem] uppercase tracking-[0.12em] ${
                c.tone === 'danger'
                  ? 'text-danger'
                  : 'text-gold-strong dark:text-gold'
              }`}
            >
              {c.label}
            </dt>
            <dd className="text-sm text-ink-muted">{c.hint}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
