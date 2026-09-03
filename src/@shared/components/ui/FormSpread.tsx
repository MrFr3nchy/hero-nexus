import { type ReactNode } from 'react';

import { DeckledEdge } from './DeckledEdge';
import { Marginalia } from './Marginalia';
import { SectionCard } from './SectionCard';

interface FormSpreadProps {
  title: ReactNode;
  /** One in-world line under the title, in the margin voice. */
  blurb?: ReactNode;
  /** Scene-scale illustration for the left panel. */
  scene?: ReactNode;
  /** The form (or prose). Rendered inside a framed sheet. */
  children: ReactNode;
  /** Small print under the sheet — "already have an account?", back links. */
  footer?: ReactNode;
}

/**
 * Full-screen layout for form / utility pages (design language: "Form / utility"
 * archetype). An in-world scene on one side, the form as a framed sheet on the
 * other. Stacks on small screens with the scene on top.
 */
export function FormSpread({
  title,
  blurb,
  scene,
  children,
  footer,
}: FormSpreadProps) {
  return (
    <div className="grid min-h-screen bg-bg lg:grid-cols-2">
      <aside className="flex flex-col items-center justify-center gap-5 border-b border-line bg-surface px-6 py-12 text-center lg:border-b-0 lg:border-r">
        {scene}
        <div>
          <h1 className="font-display text-3xl text-ink">{title}</h1>
          {blurb && <Marginalia className="mt-2">{blurb}</Marginalia>}
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="relative">
            <SectionCard>{children}</SectionCard>
            <DeckledEdge />
          </div>
          {footer && (
            <div className="mt-5 text-center text-sm text-ink-muted">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
