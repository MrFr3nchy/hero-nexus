interface FleuronProps {
  /** `full` spans the container; `short` is a centred ~8rem accent. */
  variant?: 'full' | 'short';
  className?: string;
}

/** A hairline rule broken by a centred ornament. Draws in on mount. */
export function Fleuron({ variant = 'full', className }: FleuronProps) {
  return (
    <div
      className={`fleuron-rule flex items-center gap-3 ${
        variant === 'short' ? 'mx-auto w-32' : 'w-full'
      } ${className ?? ''}`}
      style={{
        animation: 'fleuron-draw 0.5s ease-out both',
        transformOrigin: 'center',
      }}
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-line to-gold/50" />
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="shrink-0 text-gold"
      >
        <path
          d="M8 1 L11 5 L15 8 L11 11 L8 15 L5 11 L1 8 L5 5 Z"
          fill="currentColor"
          opacity="0.9"
        />
        <circle cx="8" cy="8" r="1.6" className="fill-bg" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-line to-gold/50" />
    </div>
  );
}
