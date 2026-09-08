'use client';

import {
  Button,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { type ReactNode } from 'react';

import { Glyph } from '@/@shared/components/ui';

/**
 * The small parts every content form is built from.
 *
 * Deliberately not react-hook-form: the forge edits one plain object and hands
 * it to a zod schema on save, and a second RHF instance beside the character
 * form's is a well-known way to desync (see the note atop `HomebrewSection`).
 * Every control here is controlled, and every `onChange` hands back the whole
 * next value.
 */

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function FieldGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
          {title}
        </h4>
        {hint && <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  description,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  description?: string;
}) {
  return (
    <Input
      size="sm"
      label={label}
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      description={description}
    />
  );
}

export function LongTextField({
  label,
  value,
  onChange,
  placeholder,
  minRows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  return (
    <Textarea
      size="sm"
      label={label}
      value={value}
      onValueChange={onChange}
      placeholder={placeholder}
      minRows={minRows}
    />
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  description,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  description?: string;
}) {
  return (
    <Input
      size="sm"
      type="number"
      label={label}
      value={String(value)}
      description={description}
      onValueChange={v => {
        const n = Number(v);
        // An empty box reads as the minimum rather than NaN, so a half-typed
        // number never writes a broken value into the draft.
        onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
      }}
    />
  );
}

export function BoolField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Switch
      size="sm"
      classNames={{ label: 'ml-2 text-sm text-ink-muted' }}
      isSelected={value}
      onValueChange={onChange}
    >
      {label}
    </Switch>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function PickOne<T extends string>({
  label,
  value,
  options,
  onChange,
  allowEmpty,
  emptyLabel = '—',
}: {
  label: string;
  value: T | null;
  options: Option[];
  onChange: (v: T | null) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const items = allowEmpty
    ? [{ value: '', label: emptyLabel }, ...options]
    : options;
  return (
    <Select
      size="sm"
      label={label}
      selectedKeys={value ? [value] : allowEmpty ? [''] : []}
      onSelectionChange={keys => {
        const next = Array.from(keys)[0];
        onChange((next === '' || next == null ? null : next) as T | null);
      }}
    >
      {items.map(o => (
        <SelectItem key={o.value}>{o.label}</SelectItem>
      ))}
    </Select>
  );
}

export function PickMany<T extends string>({
  label,
  values,
  options,
  onChange,
  description,
}: {
  label: string;
  values: T[];
  options: Option[];
  onChange: (v: T[]) => void;
  description?: string;
}) {
  return (
    <Select
      size="sm"
      label={label}
      description={description}
      selectionMode="multiple"
      selectedKeys={values}
      onSelectionChange={keys => onChange(Array.from(keys) as T[])}
    >
      {options.map(o => (
        <SelectItem key={o.value}>{o.label}</SelectItem>
      ))}
    </Select>
  );
}

/**
 * A repeating group — class features, species traits, equipment packages.
 *
 * `blank()` is a function rather than a value so every added row is a fresh
 * object; sharing one literal across rows is how edits start bleeding between
 * them.
 */
export function Repeater<T>({
  label,
  hint,
  items,
  blank,
  onChange,
  addLabel = 'Add',
  render,
}: {
  label: string;
  hint?: string;
  items: T[];
  blank: () => T;
  onChange: (next: T[]) => void;
  addLabel?: string;
  render: (
    item: T,
    patch: (next: Partial<T>) => void,
    index: number
  ) => ReactNode;
}) {
  const patchAt = (index: number) => (next: Partial<T>) =>
    onChange(items.map((it, i) => (i === index ? { ...it, ...next } : it)));

  return (
    <FieldGroup title={label} hint={hint}>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="relative rounded-[var(--radius-card)] border border-line bg-surface-2/40 p-3"
          >
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label={`Remove ${label} ${i + 1}`}
              className="absolute right-1 top-1 text-ink-subtle data-[hover=true]:text-danger"
              onPress={() => onChange(items.filter((_, x) => x !== i))}
            >
              <Glyph name="question" size={14} className="rotate-45" />
            </Button>
            <div className="space-y-3 pr-8">{render(item, patchAt(i), i)}</div>
          </div>
        ))}
        <Button
          size="sm"
          variant="flat"
          onPress={() => onChange([...items, blank()])}
        >
          {addLabel}
        </Button>
      </div>
    </FieldGroup>
  );
}

/** A comma-separated list of levels, e.g. "4, 8, 12". */
export function LevelsField({
  label,
  values,
  onChange,
  description,
}: {
  label: string;
  values: number[];
  onChange: (v: number[]) => void;
  description?: string;
}) {
  return (
    <Input
      size="sm"
      label={label}
      description={description}
      value={values.join(', ')}
      onValueChange={v =>
        onChange(
          v
            .split(',')
            .map(part => Number(part.trim()))
            .filter(n => Number.isInteger(n) && n >= 1 && n <= 20)
        )
      }
    />
  );
}
