'use client';

import { Select, SelectItem } from '@heroui/react';
import { type ReactNode } from 'react';

import { Glyph } from '@/@shared/components/ui';
import { SCREEN_PANELS, type ScreenPanelKey } from '../../lib/screen';

/**
 * One box on the screen.
 *
 * A box owns its own height and its own scrollbar. That is the whole point of
 * the rebuild: the page never scrolls, so nothing you put on the screen can
 * hide below the fold of a long column, and glancing down at initiative while
 * the party argues does not cost you your place in the notebook.
 *
 * The title bar is also the drag handle. Making the whole box draggable meant
 * every attempt to select a line of prep started dragging the panel instead.
 */
export function ScreenBox({
  id,
  title,
  glyph,
  available,
  onSwap,
  onRemove,
  onDragStart,
  onDragEnd,
  dragging,
  arranging,
  children,
}: {
  id: ScreenPanelKey;
  title: string;
  glyph: ReactNode;
  /** Panels this box may be swapped for: the unused ones, plus its own. */
  available: ScreenPanelKey[];
  onSwap: (next: ScreenPanelKey) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  /** Arrange mode shows the controls; otherwise the bar is just a label. */
  arranging: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface [box-shadow:var(--shadow-card)] ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <header
        draggable={arranging}
        onDragStart={event => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={`flex shrink-0 items-center gap-2 border-b border-line bg-surface-2/60 px-3 py-1.5 ${
          arranging ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
      >
        {arranging && (
          <Glyph
            name="compass"
            size={13}
            className="shrink-0 text-ink-subtle"
            label="Drag to move this box"
          />
        )}
        <span className="shrink-0 text-gold">{glyph}</span>
        <h2 className="min-w-0 flex-1 truncate font-display-alt text-[0.68rem] uppercase tracking-[0.14em] text-ink">
          {title}
        </h2>

        {arranging && (
          <>
            <Select
              aria-label={`Swap ${title} for another panel`}
              size="sm"
              variant="flat"
              className="w-36"
              classNames={{ trigger: 'h-7 min-h-7' }}
              selectedKeys={[id]}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                if (key && key !== id) onSwap(String(key) as ScreenPanelKey);
              }}
            >
              {available.map(key => (
                <SelectItem key={key} textValue={SCREEN_PANELS[key].label}>
                  {SCREEN_PANELS[key].label}
                </SelectItem>
              ))}
            </Select>
            <button
              type="button"
              aria-label={`Take ${title} off the screen`}
              onClick={onRemove}
              className="shrink-0 text-ink-subtle transition-colors hover:text-danger"
            >
              <Glyph name="question" size={13} className="rotate-45" />
            </button>
          </>
        )}
      </header>

      {/* The only scroller on the page. */}
      <div className="screen-box-body min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {children}
      </div>
    </section>
  );
}
