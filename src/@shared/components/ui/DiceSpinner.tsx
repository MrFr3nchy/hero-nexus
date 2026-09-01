import { type ReactNode } from 'react';

interface DiceSpinnerProps {
  size?: number;
  label?: ReactNode;
  className?: string;
}

/** A tumbling d20 — the app's loading indicator. Static under reduced-motion. */
export function DiceSpinner({ size = 40, label, className }: DiceSpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <svg
        className="d20-spin text-gold"
        style={{
          width: size,
          height: size,
          animation: 'd20-tumble 1.6s linear infinite',
        }}
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
      >
        <polygon
          points="50,4 92,28 92,72 50,96 8,72 8,28"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
          className="fill-gold/10"
        />
        <path
          d="M50 4 L50 34 M8 28 L50 34 M92 28 L50 34 M8 72 L50 34 M92 72 L50 34 M50 96 L50 34 M8 28 L8 72 M92 28 L92 72 M8 72 L50 96 M92 72 L50 96"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <text
          x="50"
          y="24"
          textAnchor="middle"
          fontSize="16"
          fontFamily="serif"
          fill="currentColor"
        >
          20
        </text>
      </svg>
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <span className="sr-only">Loading</span>
    </div>
  );
}
