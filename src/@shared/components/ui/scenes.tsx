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

export function ForgeScene({ className }: { className?: string }) {
  return (
    <svg
      width="98"
      height="80"
      viewBox="0 0 98 80"
      aria-hidden="true"
      className={className}
    >
      {/* a cold anvil, hammer resting across it */}
      <path
        d="M18 30h34l12 10h12l-4 12H36c-10 0-18-8-18-18z"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <path d="M42 52v10" stroke="var(--line)" strokeWidth="3" />
      <path
        d="M28 72h28l-5-10H33z"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <path
        d="M56 18h18v8H56z"
        fill="var(--ink-subtle)"
        opacity="0.55"
        transform="rotate(-18 65 22)"
      />
      <path
        d="M56 24 34 34"
        stroke="var(--ink-subtle)"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* two cooling sparks — the only colour */}
      <circle cx="70" cy="12" r="2.6" fill="var(--gold)" opacity="0.85" />
      <circle cx="80" cy="20" r="1.6" fill="var(--gold)" opacity="0.6" />
      <ellipse cx="42" cy="76" rx="26" ry="3.5" fill="var(--surface-2)" />
    </svg>
  );
}

export function HourglassScene({ className }: { className?: string }) {
  return (
    <svg
      width="76"
      height="90"
      viewBox="0 0 76 90"
      aria-hidden="true"
      className={className}
    >
      {/* an hourglass with the sand already run through */}
      <path d="M16 8h44M16 82h44" stroke="var(--line)" strokeWidth="3.4" />
      <path
        d="M22 8v12c0 10 16 17 16 25s-16 15-16 25v12"
        fill="none"
        stroke="var(--line)"
        strokeWidth="1.6"
      />
      <path
        d="M54 8v12c0 10-16 17-16 25s16 15 16 25v12"
        fill="none"
        stroke="var(--line)"
        strokeWidth="1.6"
      />
      <path
        d="M24 82c0-9 14-15 14-15s14 6 14 15z"
        fill="var(--gold)"
        opacity="0.75"
      />
    </svg>
  );
}

export function TomeScene({ className }: { className?: string }) {
  return (
    <svg
      width="100"
      height="78"
      viewBox="0 0 100 78"
      aria-hidden="true"
      className={className}
    >
      {/* a shut, clasped book — nothing in the archive yet */}
      <path
        d="M14 10h58a8 8 0 0 1 8 8v46a8 8 0 0 1-8 8H14z"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.4"
      />
      <path
        d="M14 10h8v62h-8z"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <rect
        x="34"
        y="26"
        width="32"
        height="30"
        rx="2"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.4"
        opacity="0.6"
      />
      <path
        d="M50 30l3.4 7.6 7.6 3.4-7.6 3.4L50 52l-3.4-7.6L39 41l7.6-3.4z"
        fill="var(--gold)"
        opacity="0.55"
      />
      <path d="M80 34h6v14h-6z" fill="var(--danger)" opacity="0.8" />
    </svg>
  );
}

export function HandoutScene({ className }: { className?: string }) {
  return (
    <svg
      width="96"
      height="76"
      viewBox="0 0 96 76"
      aria-hidden="true"
      className={className}
    >
      {/* a rolled scroll lying flat, never unrolled */}
      <rect
        x="20"
        y="18"
        width="56"
        height="40"
        rx="2"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <ellipse
        cx="20"
        cy="38"
        rx="7"
        ry="21"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <ellipse
        cx="76"
        cy="38"
        rx="7"
        ry="21"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <path
        d="M20 21v34M76 21v34"
        stroke="var(--gold)"
        strokeWidth="1"
        opacity="0.45"
      />
      {[30, 38, 46].map((y, i) => (
        <path
          key={y}
          d={`M32 ${y}h${i === 2 ? 20 : 32}`}
          stroke="var(--line)"
          strokeWidth="1.6"
        />
      ))}
      <path d="M64 62l4-8 4 8-4 3z" fill="var(--gold)" opacity="0.7" />
      <ellipse cx="48" cy="70" rx="30" ry="3.5" fill="var(--surface-2)" />
    </svg>
  );
}

export function QuietDeskScene({ className }: { className?: string }) {
  return (
    <svg
      width="96"
      height="80"
      viewBox="0 0 96 80"
      aria-hidden="true"
      className={className}
    >
      {/* an inkwell and a resting quill — the review queue is clear */}
      <path
        d="M30 44h24l-3 22a4 4 0 0 1-4 4H37a4 4 0 0 1-4-4z"
        fill="var(--surface-2)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <ellipse
        cx="42"
        cy="44"
        rx="12"
        ry="4"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <path
        d="M86 8C60 14 46 28 44 44c10-2 24-12 42-36z"
        fill="var(--surface)"
        stroke="var(--line)"
        strokeWidth="1.2"
      />
      <path
        d="M46 42 34 54"
        stroke="var(--ink-subtle)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle cx="42" cy="44" r="3.4" fill="var(--arcane)" opacity="0.6" />
      <path d="M14 74h68" stroke="var(--line)" strokeWidth="1.6" />
    </svg>
  );
}
