/**
 * Scene-scale illustrations for `EmptyState`'s `scene` slot (design rule 7).
 * Drawn in token colours, one gently-animated element max, and that element
 * carries `.candle-flame` so it stops under `prefers-reduced-motion`.
 */

export function CandleScene({ className }: { className?: string }) {
  return (
    <svg
      width="70"
      height="96"
      viewBox="0 0 70 96"
      aria-hidden="true"
      className={className}
    >
      <ellipse
        className="candle-flame"
        style={{
          animation: 'candle-flicker 2.6s ease-in-out infinite',
          transformOrigin: '50% 100%',
        }}
        cx="35"
        cy="30"
        rx="7"
        ry="15"
        fill="var(--gold)"
        opacity="0.9"
      />
      <ellipse
        className="candle-flame"
        style={{
          animation: 'candle-flicker 2.6s ease-in-out infinite',
          transformOrigin: '50% 100%',
        }}
        cx="35"
        cy="33"
        rx="3.4"
        ry="8"
        fill="var(--gold-strong)"
      />
      <rect
        x="27"
        y="44"
        width="16"
        height="42"
        rx="2"
        fill="var(--surface-2)"
      />
      <rect x="27" y="44" width="16" height="6" rx="2" fill="var(--line)" />
      <ellipse cx="35" cy="88" rx="24" ry="6" fill="var(--surface)" />
      <path
        d="M11 88a24 6 0 0 1 48 0"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1"
        opacity="0.5"
      />
    </svg>
  );
}

export function SealedLetterScene({ className }: { className?: string }) {
  return (
    <svg
      width="96"
      height="72"
      viewBox="0 0 96 72"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="6"
        y="8"
        width="84"
        height="56"
        rx="3"
        fill="var(--surface-2)"
        stroke="var(--line)"
      />
      <path
        d="M6 12l42 30 42-30"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.4"
        opacity="0.6"
      />
      <circle cx="48" cy="46" r="10" fill="var(--danger)" opacity="0.9" />
      <path
        d="M48 39l2.4 5.4 5.6 2.1-5.6 2.1L48 54l-2.4-5.4-5.6-2.1 5.6-2.1z"
        fill="var(--surface)"
        opacity="0.7"
      />
    </svg>
  );
}
