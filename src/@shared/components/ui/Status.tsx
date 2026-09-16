import { type ReactNode } from 'react';

/**
 * The status language (design language rule 9).
 *
 * Six states an operating surface may be in, each owning a mark shape, an
 * edge treatment and a word — so that greyscaled, all six still separate:
 *
 * | state      | mark            | edge                   | word           |
 * | ---------- | --------------- | ---------------------- | -------------- |
 * | `live`     | filled dot      | none                   | live           |
 * | `stale`    | slashed dot     | dotted, dimmed         | stale 40s      |
 * | `yours`    | none            | solid ink bar, bold    | yours          |
 * | `waiting`  | filled lozenge  | 2px danger, hatched    | waiting on you |
 * | `hidden`   | grey lozenge    | dotted, hatched ground | only you       |
 * | `homebrew` | hollow square   | double arcane edge     | homebrew       |
 *
 * The states use different channels — the left edge, the ground, the mark and
 * the right-hand word — so two can stack on one row (yours + waiting) without
 * either being lost. A seventh state is not added here without a row in that
 * table; a state said any other way is the failure this file exists to stop.
 *
 * Colours are the tokens and nothing else: `success` for live, `warning` for
 * stale, `ink` for yours, `danger` for waiting, `ink-muted` for hidden,
 * `arcane` for homebrew. The hatched ground is `.status-hatch` in
 * `globals.css`, mixed from the same tokens.
 */
export type StatusKind =
  | 'live'
  | 'stale'
  | 'yours'
  | 'waiting'
  | 'hidden'
  | 'homebrew';

export const STATUS_WORD: Record<StatusKind, string> = {
  live: 'live',
  stale: 'stale',
  yours: 'yours',
  waiting: 'waiting on you',
  hidden: 'only you',
  homebrew: 'homebrew',
};

/** The text colour each state's word and mark take. */
const INK: Record<StatusKind, string> = {
  live: 'text-success',
  stale: 'text-warning',
  yours: 'text-ink',
  waiting: 'text-danger',
  hidden: 'text-ink-muted',
  homebrew: 'text-arcane',
};

/**
 * The mark alone: a dot, a slashed dot, a lozenge, a hollow square. `yours`
 * has no mark — its channel is the edge and the weight of the name — so it
 * renders nothing, and a caller that wants a mark beside a "yours" row is
 * asking for a state it does not have.
 */
export function StatusMark({
  kind,
  size = 8,
  className,
}: {
  kind: StatusKind;
  /** The box in px. The wireframe draws these at 7–9. */
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  const base = `inline-block shrink-0 ${INK[kind]} ${className ?? ''}`;
  switch (kind) {
    case 'live':
      return (
        <span
          aria-hidden="true"
          className={`${base} rounded-full bg-current`}
          style={box}
        />
      );
    case 'stale':
      return (
        <span
          aria-hidden="true"
          className={`${base} relative rounded-full border-[1.5px] border-current`}
          style={box}
        >
          <span
            className="absolute left-1/2 top-1/2 h-[1.5px] w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-current"
            aria-hidden="true"
          />
        </span>
      );
    case 'waiting':
    case 'hidden':
      return (
        <span
          aria-hidden="true"
          className={`${base} rotate-45 bg-current`}
          style={box}
        />
      );
    case 'homebrew':
      return (
        <span
          aria-hidden="true"
          className={`${base} border-[1.5px] border-current`}
          style={box}
        />
      );
    case 'yours':
      return null;
  }
}

/**
 * The edge and ground a row, a chip or a title bar takes in a state. Tailwind
 * classes, so the caller adds them to whatever it is drawing; the mark and
 * the word still have to be there — an edge alone is a coloured bar with no
 * meaning behind it (rule 6).
 */
export function statusEdge(kind: StatusKind | null | undefined): string {
  switch (kind) {
    case 'stale':
      return 'border-dotted border-warning opacity-70';
    case 'yours':
      return 'border-l-4 border-l-ink bg-surface-2';
    case 'waiting':
      return 'border-2 border-danger status-hatch-danger';
    case 'hidden':
      return 'border-l-2 border-l-ink-muted border-l-dotted status-hatch';
    case 'homebrew':
      return 'border-l-4 border-l-arcane border-l-double';
    case 'live':
    default:
      return '';
  }
}

/**
 * The word, set small and tracked, in the state's ink. `detail` follows the
 * word — "stale 40s", "asked · waiting" — and is the only free text a state
 * carries.
 */
export function StatusWord({
  kind,
  detail,
  className,
}: {
  kind: StatusKind;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 text-[0.5625rem] uppercase leading-none tracking-[0.07em] ${
        kind === 'waiting' || kind === 'yours' ? 'font-bold' : 'font-semibold'
      } ${INK[kind]} ${className ?? ''}`}
    >
      {STATUS_WORD[kind]}
      {detail ? <> {detail}</> : null}
    </span>
  );
}

/**
 * A count worn on a title bar or a row. Absent at zero: it never renders a 0,
 * because a badge is the reason to open something and zero is not a reason.
 * `waiting` badges are danger; every other count is the table's own voice.
 */
export function StatusBadge({
  count,
  kind = 'live',
  label,
}: {
  count: number | undefined | null;
  kind?: StatusKind;
  /** For a screen reader: "3 waiting". */
  label?: string;
}) {
  if (!count || count <= 0) return null;
  return (
    <span
      aria-label={label ?? `${count} waiting`}
      className={`inline-block h-4 min-w-4 shrink-0 rounded-full px-1 text-center text-[0.59rem] font-bold leading-4 tabular-nums text-bg ${
        kind === 'waiting' ? 'bg-danger' : 'bg-warning'
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * The state as a chip: mark, word, edge, in one inline element. For a row
 * that is not a panel — a combatant in a list, a check in the asking, a
 * source mark on a stat block.
 */
export function StatusChip({
  kind,
  detail,
  count,
  className,
}: {
  kind: StatusKind;
  detail?: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[5px] border border-line px-2 py-1 ${statusEdge(
        kind
      )} ${className ?? ''}`}
    >
      <StatusMark kind={kind} size={kind === 'waiting' ? 9 : 7} />
      <StatusWord kind={kind} detail={detail} />
      {kind === 'waiting' && <StatusBadge count={count} kind="waiting" />}
    </span>
  );
}

/** "40s" / "3m" — how long ago, for the stale word. */
export function staleFor(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}
