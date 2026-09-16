'use client';

import {
  createContext,
  useContext,
  type DragEvent,
  type ReactNode,
} from 'react';

import { Glyph } from './Glyph';
import { StatusBadge, StatusMark, StatusWord, type StatusKind } from './Status';

/**
 * What a panel tells the components inside it.
 *
 * A `SectionCard` on a tab draws its own frame and heading; the same card
 * inside a panel must not, because the panel is the frame and the title bar
 * is the heading. Before this the screen stripped that chrome by CSS
 * selector, which meant a panel could lose its heading without anybody
 * having decided it should. Now the card asks, and the answer is here.
 */
export interface PanelDensity {
  /** Inside a panel at all. */
  inPanel: boolean;
  /** `shelf` is the column beside the sand table: tighter than a box. */
  density: 'box' | 'shelf';
}

const PanelContext = createContext<PanelDensity>({
  inPanel: false,
  density: 'box',
});

export function usePanelDensity(): PanelDensity {
  return useContext(PanelContext);
}

/**
 * The status a panel wears. The six of the status language, plus
 * `reference` for a panel with nothing live in it — the conditions list, the
 * canon — which wears a hollow dot and the word, and never a badge. That is
 * not a seventh state: it is the absence of one, said so the reader does not
 * wait for a dot that is never going to fill.
 */
export type PanelStatus = StatusKind | 'reference';

export interface PanelProps {
  title: string;
  status?: PanelStatus;
  /** Follows the word: "40s" after stale. */
  statusDetail?: ReactNode;
  /** Rows wanting an answer. Absent at zero. */
  badge?: number;
  folded?: boolean;
  onFold?: (folded: boolean) => void;
  /** Arrange mode: the handle replaces the mark, the border goes dashed. */
  arranging?: boolean;
  dragging?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onRemove?: () => void;
  /** Controls that sit in the title bar while arranging (the swap select). */
  arrangeControls?: ReactNode;
  density?: PanelDensity['density'];
  /** Set for a panel that must not scroll its body (the board owns its own). */
  scroll?: boolean;
  /** Off for a body that fills the panel edge to edge (the board). */
  padded?: boolean;
  /** The panel's own `aria-label`, when the title is not enough. */
  label?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * The panel container: one chrome for every box on the screen and every
 * panel on the shelf (design language rule 9).
 *
 * The title bar holds one line at 18rem: the mark, a Cinzel title with an
 * ellipsis, the word if the state has one, the badge, the fold control. The
 * body is the only scroller. `waiting` is the one state that takes a 2px
 * border and a hatched bar; `arranging` is the only time the handle and the
 * dashed border appear.
 */
export function Panel({
  title,
  status = 'reference',
  statusDetail,
  badge,
  folded = false,
  onFold,
  arranging = false,
  dragging = false,
  onDragStart,
  onDragEnd,
  onRemove,
  arrangeControls,
  density = 'box',
  scroll = true,
  padded = true,
  label,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const waiting = status === 'waiting';
  const frame = arranging
    ? 'border border-dashed border-gold'
    : waiting
      ? 'border-2 border-danger'
      : status === 'stale'
        ? 'border border-dotted border-warning'
        : status === 'hidden'
          ? 'border border-line border-l-2 border-l-dotted border-l-ink-muted'
          : status === 'homebrew'
            ? 'border border-line border-l-4 border-l-double border-l-arcane'
            : 'border border-line';
  const bar = waiting
    ? 'status-hatch-danger'
    : status === 'hidden'
      ? 'status-hatch'
      : 'bg-surface-2';

  return (
    <section
      aria-label={label ?? title}
      data-panel
      data-panel-status={status}
      className={`flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface [box-shadow:var(--shadow-card)] ${frame} ${
        dragging ? 'opacity-40' : ''
      } ${className ?? ''}`}
    >
      <header
        draggable={arranging && !!onDragStart}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={`flex shrink-0 items-center gap-[7px] px-[9px] py-[7px] ${bar} ${
          folded ? '' : 'border-b border-line'
        } ${arranging ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {arranging ? (
          <span
            aria-hidden="true"
            className="flex shrink-0 flex-col gap-[2px] rounded-[3px] border border-gold px-[3px] py-[2px]"
          >
            <span className="h-[1.5px] w-2 bg-gold-strong dark:bg-gold" />
            <span className="h-[1.5px] w-2 bg-gold-strong dark:bg-gold" />
            <span className="h-[1.5px] w-2 bg-gold-strong dark:bg-gold" />
          </span>
        ) : status === 'reference' ? (
          <span
            aria-hidden="true"
            className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border-[1.5px] border-ink-subtle"
          />
        ) : (
          <StatusMark kind={status} size={waiting ? 8 : 7} />
        )}

        <h2
          className={`min-w-0 flex-1 truncate font-display-alt text-[0.59rem] uppercase leading-none tracking-[0.13em] ${
            waiting ? 'font-bold text-danger' : 'text-ink'
          }`}
        >
          {title}
        </h2>

        {arranging ? (
          <span className="shrink-0 text-[0.5625rem] font-semibold uppercase leading-none tracking-[0.07em] text-gold-strong dark:text-gold">
            arranging
          </span>
        ) : status === 'reference' ? (
          <span className="shrink-0 text-[0.5625rem] font-medium uppercase leading-none tracking-[0.07em] text-ink-subtle">
            reference
          </span>
        ) : status === 'live' && !statusDetail ? null : (
          <StatusWord kind={status} detail={statusDetail} />
        )}

        {/* A reference panel never wears a count: there is nothing in it that
            could be waiting. */}
        {!arranging && status !== 'reference' && (
          <StatusBadge count={badge} kind={waiting ? 'waiting' : 'live'} />
        )}

        {arranging && arrangeControls}

        {arranging && onRemove ? (
          <button
            type="button"
            aria-label={`Take ${title} off the screen`}
            onClick={onRemove}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-ink-muted hover:text-danger"
          >
            <Glyph name="x" size={11} />
          </button>
        ) : onFold ? (
          <button
            type="button"
            aria-expanded={!folded}
            aria-label={folded ? `Open ${title}` : `Fold ${title}`}
            onClick={() => onFold(!folded)}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border text-ink-muted hover:text-ink ${
              folded ? 'border-ink-subtle' : 'border-line'
            }`}
          >
            <Glyph name={folded ? 'chevron-right' : 'chevron-down'} size={9} />
          </button>
        ) : null}
      </header>

      {!folded && (
        <PanelContext.Provider value={{ inPanel: true, density }}>
          {/* The only scroller. */}
          <div
            data-panel-body
            className={`min-h-0 flex-1 ${scroll ? 'overflow-y-auto' : 'overflow-hidden'} ${
              density === 'shelf' ? 'text-[0.8125rem]' : ''
            } ${
              !padded ? '' : density === 'shelf' ? 'px-2 py-1.5' : 'px-2.5 py-2'
            } ${bodyClassName ?? ''}`}
          >
            {children}
          </div>
        </PanelContext.Provider>
      )}
    </section>
  );
}
