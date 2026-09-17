'use client';

import { Card, CardBody, CardHeader } from '@heroui/react';
import { type ReactNode } from 'react';

import { LiftCard } from '../motion';
import { usePanelDensity } from './Panel';

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Add gold corner brackets — reserve for "special" surfaces. */
  framed?: boolean;
  /** Opt into the scroll-in mount animation. Off by default (design rule 4). */
  reveal?: boolean;
}

function Corners() {
  const base =
    'pointer-events-none absolute z-10 h-3 w-3 border-gold/70 text-gold';
  return (
    <>
      <span className={`${base} left-1.5 top-1.5 border-l border-t`} />
      <span className={`${base} right-1.5 top-1.5 border-r border-t`} />
      <span className={`${base} bottom-1.5 left-1.5 border-b border-l`} />
      <span className={`${base} bottom-1.5 right-1.5 border-b border-r`} />
    </>
  );
}

/**
 * Themed panel: surface background, hairline border, one soft shadow.
 *
 * Inside a `Panel` it draws none of that. The panel is the frame and its
 * title bar is the heading, so the card keeps only what is function — the
 * actions in its head ("Add the party", "Long rest") — and drops the title,
 * the description, the border and the padding. This used to be done by CSS
 * selector from the screen; asking the panel means a card cannot lose its
 * heading by accident, only by being put in a panel.
 */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  framed,
  reveal,
}: SectionCardProps) {
  const { inPanel, density } = usePanelDensity();

  if (inPanel) {
    return (
      <div data-card className={className}>
        {actions && (
          <div
            data-card-head
            className={`flex flex-wrap justify-end gap-2 ${
              density === 'shelf' ? 'pb-1' : 'pb-1.5'
            }`}
          >
            {actions}
          </div>
        )}
        <div
          className={`${density === 'shelf' ? 'py-1' : 'py-1.5'} ${bodyClassName ?? ''}`}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <LiftCard reveal={reveal} className={`relative ${className ?? ''}`}>
      {framed && <Corners />}
      <Card
        data-card
        shadow="none"
        className="border border-line bg-surface [box-shadow:var(--shadow-card)]"
      >
        {(title || actions) && (
          <CardHeader
            data-card-head
            className="flex items-start justify-between gap-4 border-b border-line px-5 py-4"
          >
            <div data-card-title>
              {title && (
                <h2 className="font-display text-lg text-ink">{title}</h2>
              )}
              {description && (
                <p className="mt-1 text-sm text-ink-muted">{description}</p>
              )}
            </div>
            {actions && (
              <div data-card-actions className="flex shrink-0 flex-wrap gap-2">
                {actions}
              </div>
            )}
          </CardHeader>
        )}
        <CardBody className={`px-5 py-5 ${bodyClassName ?? ''}`}>
          {children}
        </CardBody>
      </Card>
    </LiftCard>
  );
}
