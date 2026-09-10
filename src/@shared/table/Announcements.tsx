'use client';

/**
 * Word reaching you at the table.
 *
 * A stack of slips in the corner of the window, not a panel on a page. The
 * dice tray is the precedent design language rule 4 already names: a moment
 * over the whole window rather than a page's one toy. This is the same kind of
 * thing and is allowed for the same reason — see `docs/design-language.md`
 * rule 4, amended alongside this work.
 *
 * What it may not do, and each of these is a rule from that document:
 *
 * - No emoji. Every mark is a `Glyph` (rule 8).
 * - The title is load-bearing, so it is never the hand face (rule 5). The
 *   detail line is straight too — a scrawl that carries the only copy of what
 *   the DM said would be marginalia doing a job.
 * - Gold is the table's own voice. `--danger` is for something dangerous, not
 *   for "your turn" (rule 6).
 * - Nothing behind it moves. The slip arriving is the whole animation, and
 *   under `prefers-reduced-motion` even that is only an appearance.
 */
import { AnimatePresence } from 'framer-motion';

import { motion, useReducedMotion } from '@/@shared/components/motion';
import { Glyph } from '@/@shared/components/ui';
import type { EventTone } from './events';
import { useTable, type Announcement } from './TableProvider';

/**
 * The spine down the left edge, as a real element.
 *
 * Not `border-l-gold` on the card: the card also carries `border-line`, which
 * sets all four sides and wins on stylesheet order, so the tone silently
 * disappeared and every slip read the same. A spine element is the same shape
 * `HeroCard` uses for its class colour and cannot be overridden by a
 * neighbouring border utility.
 */
const TONE_SPINE: Record<EventTone, string> = {
  gold: 'bg-gold',
  danger: 'bg-danger',
  success: 'bg-success',
  arcane: 'bg-arcane',
};

const TONE_INK: Record<EventTone, string> = {
  gold: 'text-gold-strong dark:text-gold',
  danger: 'text-danger',
  success: 'text-success',
  arcane: 'text-arcane',
};

function Slip({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss: () => void;
}) {
  const reduce = useReducedMotion();
  const { reading } = announcement;

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 1 } : { opacity: 0, x: 28 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 28 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto flex w-full items-stretch gap-0 overflow-hidden border border-line bg-surface [border-radius:var(--radius-card)] [box-shadow:var(--shadow-card)] sm:w-80"
    >
      <span
        aria-hidden="true"
        className={`w-[3px] shrink-0 ${TONE_SPINE[reading.tone]}`}
      />
      <div className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5">
        <Glyph
          name={reading.glyph}
          size={16}
          className={`mt-0.5 shrink-0 ${TONE_INK[reading.tone]}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug text-ink">{reading.title}</p>
          {reading.detail && (
            <p className="mt-0.5 truncate text-xs text-ink-muted">
              {reading.detail}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded p-1 text-ink-subtle transition-colors hover:text-ink"
        >
          <Glyph name="x" size={13} />
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Mounted once at the root.
 *
 * Bottom-right on a desk and along the bottom on a phone, because that is the
 * one region of this app no panel claims — the sidebar is left, page actions
 * are top-right, and a slip over either of those covers the control somebody
 * is reaching for.
 */
export function Announcements() {
  const { announcements, dismiss } = useTable();

  return (
    <div
      // `polite` throughout: a request addressed at the reader is loud enough
      // by staying put, and an assertive region that fires on every roll would
      // interrupt a screen reader mid-sentence all session.
      aria-live="polite"
      aria-relevant="additions"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
    >
      <AnimatePresence initial={false}>
        {announcements.map(a => (
          <Slip key={a.id} announcement={a} onDismiss={() => dismiss(a.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}
