'use client';

import { Button } from '@heroui/react';

import { Glyph } from '@/@shared/components/ui';

/**
 * A refusal the rules made, and the DM's way past it.
 *
 * Shown where the control that was refused lives, not in the header: the
 * person who pressed the button is looking at the button. "Do it anyway"
 * appears only when the server said the caller may — `overridable` on the
 * action's result, decided from the role there — and pressing it re-sends
 * the same call with `{ ruling: true }`. A player sees the message alone.
 */
export interface RefusedState {
  message: string;
  /** Set when the server said this caller may overrule it. */
  ruling?: () => Promise<void> | void;
}

export function Refused({
  refusal,
  onDismiss,
}: {
  refusal: RefusedState;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      <Glyph name="gavel" size={14} className="shrink-0" />
      <span className="min-w-0 flex-1">{refusal.message}</span>
      {refusal.ruling && (
        <Button
          size="sm"
          variant="flat"
          color="danger"
          className="h-7 min-w-0 px-2.5 text-xs"
          onPress={async () => {
            await refusal.ruling?.();
            onDismiss();
          }}
        >
          Do it anyway
        </Button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-danger/70 hover:text-danger"
      >
        <Glyph name="x" size={12} />
      </button>
    </div>
  );
}
