'use client';

import { Card, CardBody, CardHeader } from '@heroui/react';
import { type ReactNode } from 'react';

interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Themed panel: surface background, hairline border, one soft shadow. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <Card
      shadow="none"
      className={`border border-line bg-surface [box-shadow:var(--shadow-card)] ${className ?? ''}`}
    >
      {(title || actions) && (
        <CardHeader className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && (
              <h2 className="font-display text-lg text-ink">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardBody className={`px-5 py-5 ${bodyClassName ?? ''}`}>
        {children}
      </CardBody>
    </Card>
  );
}
