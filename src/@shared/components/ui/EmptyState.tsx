'use client';

import { type ReactNode } from 'react';

import { Float } from '../motion';

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-12 text-center">
      {/* compass-rose watermark */}
      <svg
        className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 text-gold/[0.06]"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          d="M50 4 L58 42 L96 50 L58 58 L50 96 L42 58 L4 50 L42 42 Z"
          fill="currentColor"
        />
      </svg>

      {icon && <Float className="mb-3 text-3xl opacity-80">{icon}</Float>}
      <h3 className="font-display-alt text-base text-ink">{title}</h3>
      {description && (
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
