'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { DieGlyph } from './Die';

/**
 * "I rolled it": the faces off real dice, one box per die.
 *
 * Sits beside a roll button. Opened, it asks for exactly the dice the roll
 * would throw — `sides` comes from `notationSides`, so `2d20kh1` asks for
 * two — and sends the faces as a claim about the dice. The modifier and the
 * total are still the server's; nothing typed here is a number the table
 * takes on trust. Typing a face's last digit moves to the next die; the
 * last one sends.
 */
export function FaceEntry({
  sides,
  label,
  disabled = false,
  compact = false,
  inline = false,
  onSubmit,
  onCancel,
}: {
  /** One entry per die, in the order the notation rolls them. */
  sides: number[];
  /** What the roll is for — "Longsword", "Death save". */
  label?: string;
  disabled?: boolean;
  /** Glyph only, for a crowded row. */
  compact?: boolean;
  /**
   * The boxes themselves, open, with no trigger: for a server that came
   * back asking for a different handful than was sent.
   */
  inline?: boolean;
  onSubmit: (faces: number[]) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(inline);
  const [faces, setFaces] = useState<string[]>(() => sides.map(() => ''));
  const [busy, setBusy] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (open) {
      setFaces(sides.map(() => ''));
      setTimeout(() => inputs.current[0]?.focus(), 30);
    }
    // `sides` changes identity per render; its length and values are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sides.join(',')]);

  const parsed = faces.map((f, i) => {
    const n = Number(f);
    return Number.isInteger(n) && n >= 1 && n <= sides[i] ? n : null;
  });
  const complete = parsed.every(n => n !== null);

  const send = async () => {
    if (!complete || busy) return;
    setBusy(true);
    try {
      await onSubmit(parsed as number[]);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (sides.length === 0) return null;

  const boxes = (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-muted">
        I rolled it{label ? ` — ${label}` : ''}. The faces, one per die; the app
        adds the rest.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {sides.map((s, i) => (
          <label
            key={i}
            className="flex flex-col text-[0.6rem] text-ink-subtle"
          >
            d{s}
            <input
              ref={el => {
                inputs.current[i] = el;
              }}
              type="number"
              inputMode="numeric"
              min={1}
              max={s}
              value={faces[i]}
              onChange={e => {
                const v = e.target.value.slice(0, String(s).length);
                setFaces(prev => prev.map((f, k) => (k === i ? v : f)));
                // Enough digits to be a face on this die: move on.
                const n = Number(v);
                if (v.length === String(s).length || (n >= 1 && n * 10 > s)) {
                  inputs.current[i + 1]?.focus();
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') void send();
                if (e.key === 'Escape' && onCancel) onCancel();
              }}
              className={`h-9 w-14 rounded-md border bg-bg px-2 text-center font-display text-lg tabular-nums text-ink ${
                faces[i] && parsed[i] === null ? 'border-danger' : 'border-line'
              }`}
            />
          </label>
        ))}
        <Button
          size="sm"
          color="primary"
          isDisabled={!complete}
          isLoading={busy}
          onPress={() => void send()}
        >
          Send
        </Button>
        {onCancel && (
          <Button
            size="sm"
            variant="light"
            className="text-ink-subtle"
            onPress={onCancel}
          >
            Never mind
          </Button>
        )}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="rounded-md border border-dashed border-gold/60 bg-surface px-3 py-2">
        {boxes}
      </div>
    );
  }

  return (
    <Popover placement="bottom" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          size="sm"
          variant="light"
          isDisabled={disabled}
          className={`min-w-0 gap-1 text-ink-subtle data-[hover=true]:text-ink ${
            compact ? 'px-1.5' : 'px-2'
          }`}
          aria-label={`I rolled it${label ? ` — ${label}` : ''}`}
        >
          <DieGlyph sides={20} value={20} size={16} finish="hollow" />
          {!compact && <span className="text-xs">Real dice</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="border border-line bg-surface p-3">
        {boxes}
      </PopoverContent>
    </Popover>
  );
}
