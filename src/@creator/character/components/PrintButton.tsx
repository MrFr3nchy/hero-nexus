'use client';

/** Opens the browser's print dialog, where "Save as PDF" lives too. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-gold/60 bg-gold/10 px-3 py-1.5 text-sm text-ink hover:border-gold"
    >
      Print, or save as PDF
    </button>
  );
}
