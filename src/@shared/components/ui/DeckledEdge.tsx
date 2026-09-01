/** A torn-parchment bottom edge. Place as the last child of a relative box. */
export function DeckledEdge({ className }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-x-0 bottom-0 h-3 w-full translate-y-[98%] text-bg ${className ?? ''}`}
      viewBox="0 0 1200 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 0 H1200 V6 C1150 20 1120 4 1075 12 C1030 22 1000 6 950 14 C900 22 870 4 820 12 C770 20 740 6 690 12 C640 20 610 2 560 12 C510 22 480 4 430 12 C380 20 350 6 300 12 C250 20 220 2 170 12 C120 22 90 4 40 12 C20 16 8 10 0 8 Z"
        fill="currentColor"
      />
      <path
        d="M0 8 C8 10 20 16 40 12 C90 4 120 22 170 12 C220 2 250 20 300 12 C350 6 380 20 430 12 C480 4 510 22 560 12 C610 2 640 20 690 12 C740 6 770 20 820 12 C870 4 900 22 950 14 C1000 6 1030 22 1075 12 C1120 4 1150 20 1200 6"
        fill="none"
        stroke="var(--gold)"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
    </svg>
  );
}
