type SealVariant = 'approved' | 'denied' | 'pending';

const wax: Record<SealVariant, string> = {
  approved: 'var(--success)',
  denied: 'var(--danger)',
  pending: 'var(--warning)',
};

const label: Record<SealVariant, string> = {
  approved: 'Approved',
  denied: 'Denied',
  pending: 'Pending',
};

/** A wax-seal badge for approval status. */
export function Seal({
  variant,
  showLabel = true,
  size = 22,
}: {
  variant: SealVariant;
  showLabel?: boolean;
  size?: number;
}) {
  const color = wax[variant];
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        style={{ color }}
      >
        {/* wax blob */}
        <path
          d="M12 1.5c1.6 1.2 3.6.4 4.6 2s.2 3.4 1.6 4.6 3.2 1 3.8 2.9-1 3.2-.7 5 .9 3-.6 4.3-3.3.2-4.9 1.2-1.8 2.7-3.8 2.7-2.3-1.7-4-2.7-3.6.2-4.9-1.2.1-3.2.4-5-1.5-3-.9-4.9 3-1.7 4.1-2.9 0-3.1 1.4-4.7S10.4 2.6 12 1.5Z"
          fill="currentColor"
          opacity="0.9"
        />
        {variant === 'denied' ? (
          <path
            d="M12 3.5v17"
            stroke="var(--bg)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        ) : variant === 'approved' ? (
          <path
            d="M8.2 12.4l2.6 2.6 4.8-5.4"
            stroke="var(--bg)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : (
          <circle cx="12" cy="12" r="2.4" fill="var(--bg)" opacity="0.7" />
        )}
      </svg>
      {showLabel && (
        <span className="text-xs font-medium" style={{ color }}>
          {label[variant]}
        </span>
      )}
    </span>
  );
}
