'use client';

import { type ReactNode } from 'react';

import { Reveal } from '../motion';
import { Fleuron } from './Fleuron';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Show the fleuron rule below the header. Off for pages that lead with an object. */
  rule?: boolean;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  rule = true,
  className,
}: PageHeaderProps) {
  return (
    <header className={`mb-8 ${className ?? ''}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Reveal>
          <h1 className="font-display-alt text-2xl text-ink sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-ink-muted">{description}</p>
          )}
        </Reveal>
        {actions && (
          <Reveal delay={0.06} className="flex shrink-0 flex-wrap gap-2">
            {actions}
          </Reveal>
        )}
      </div>
      {rule && (
        <div className="mt-5">
          <Fleuron />
        </div>
      )}
    </header>
  );
}
