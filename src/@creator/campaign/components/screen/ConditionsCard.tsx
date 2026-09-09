'use client';

import { CONDITIONS } from '../../lib/conditions';

/**
 * The fifteen conditions, one line each.
 *
 * The one piece of the rules a DM looks up mid-turn more than any other, and
 * the app already holds it — `CONDITIONS` is what the tracker's chips are
 * built from, so this is the same vocabulary rather than a second copy of it.
 *
 * No card of its own: it only ever appears inside a screen box, which already
 * has a frame and a title bar.
 */
export function ConditionsCard() {
  return (
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
  );
}
