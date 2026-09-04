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

export function ChronicleScene({ className }: { className?: string }) {
  return (
    <svg
      width="104"
      height="80"
      viewBox="0 0 104 80"
      aria-hidden="true"
      className={className}
    >
      {/* an open ledger, both leaves blank */}
      <path
        d="M6 16c14-5 28-5 46 2v52c-18-7-32-7-46-2z"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <path
        d="M98 16c-14-5-28-5-46 2v52c18-7 32-7 46-2z"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <path
        d="M52 18v52"
        stroke="var(--gold)"
        strokeWidth="1.6"
        opacity="0.55"
      />
      {[28, 36, 44, 52].map(y => (
        <g key={y} stroke="var(--line)" strokeWidth="1.4" opacity="0.75">
          <path d={`M14 ${y}h30`} />
          <path d={`M60 ${y}h30`} />
        </g>
      ))}
      {/* the ribbon marker, the one bit of colour */}
      <path d="M46 8h6v22l-3-4-3 4z" fill="var(--danger)" opacity="0.85" />
    </svg>
  );
}

export function QuestScene({ className }: { className?: string }) {
  return (
    <svg
      width="96"
      height="82"
      viewBox="0 0 96 82"
      aria-hidden="true"
      className={className}
    >
      {/* a pinned notice, corners curling */}
      <path
        d="M16 12h64v58l-8-6-8 6-8-6-8 6-8-6-8 6-8-6z"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      {[26, 34, 42, 50].map((y, i) => (
        <g key={y}>
          <circle cx="26" cy={y} r="2.4" fill="var(--gold)" opacity="0.8" />
          <path
            d={`M34 ${y}h${i === 3 ? 22 : 36}`}
            stroke="var(--line)"
            strokeWidth="1.6"
          />
        </g>
      ))}
      <circle cx="48" cy="12" r="5" fill="var(--danger)" opacity="0.9" />
      <circle cx="48" cy="12" r="2" fill="var(--surface)" opacity="0.7" />
    </svg>
  );
}

export function HoardScene({ className }: { className?: string }) {
  return (
    <svg
      width="98"
      height="76"
      viewBox="0 0 98 76"
      aria-hidden="true"
      className={className}
    >
      {/* an open, empty chest */}
      <path
        d="M14 34a35 35 0 0 1 70 0v4H14z"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <rect
        x="14"
        y="38"
        width="70"
        height="28"
        rx="2"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <rect
        x="42"
        y="42"
        width="14"
        height="14"
        rx="2"
        fill="var(--gold)"
        opacity="0.85"
      />
      <circle cx="49" cy="48" r="2" fill="var(--surface)" opacity="0.8" />
      <path d="M14 66h70" stroke="var(--line)" strokeWidth="1.4" />
      <ellipse cx="49" cy="71" rx="34" ry="3.5" fill="var(--surface-2)" />
    </svg>
  );
}

export function BattlefieldScene({ className }: { className?: string }) {
  return (
    <svg
      width="92"
      height="84"
      viewBox="0 0 92 84"
      aria-hidden="true"
      className={className}
    >
      {/* two blades crossed over a quiet field */}
      <path
        d="M22 70L64 16"
        stroke="var(--ink-subtle)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M70 70L28 16"
        stroke="var(--ink-subtle)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M58 12l8 2 2 8"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M34 12l-8 2-2 8"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="46" cy="43" r="5" fill="var(--danger)" opacity="0.85" />
      <ellipse cx="46" cy="76" rx="30" ry="4" fill="var(--surface-2)" />
    </svg>
  );
}
