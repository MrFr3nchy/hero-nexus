import Link from 'next/link';

import { DeckledEdge, Fleuron } from '@/@shared/components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-16">
      <div className="relative w-full max-w-md overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center [box-shadow:var(--shadow-card)]">
        <svg
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 text-gold/[0.06]"
          viewBox="0 0 100 100"
          aria-hidden="true"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M50 2 L57 43 L98 50 L57 57 L50 98 L43 57 L2 50 L43 43 Z"
            fill="currentColor"
          />
        </svg>

        <p className="mb-2 font-display-alt text-xs uppercase tracking-[0.24em] text-gold">
          Off the edge of the map
        </p>
        <h1 className="font-display-alt text-2xl text-ink">
          You wandered off the map
        </h1>
        <div className="my-4">
          <Fleuron variant="short" />
        </div>
        <p className="text-sm text-ink-muted">
          There&apos;s nothing here — the trail runs out. Head back to safer
          roads.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md bg-gold px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Return home
        </Link>
        <DeckledEdge />
      </div>
    </div>
  );
}
