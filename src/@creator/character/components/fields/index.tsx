'use client';

import { Checkbox, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';

/**
 * Thin react-hook-form <-> HeroUI wrappers. Styling comes from the themed
 * HeroUI palette (`src/app/hero.ts`); only light structural tweaks live here.
 */

const inputClassNames = {
  inputWrapper: 'bg-surface-2 border-line',
};

const selectClassNames = {
  trigger: 'bg-surface-2 border-line',
};

interface BaseProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  description?: string;
  isDisabled?: boolean;
}

export function SheetText<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  isDisabled,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          label={label}
          placeholder={placeholder}
          isDisabled={isDisabled}
          value={(field.value as string) ?? ''}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          isInvalid={Boolean(fieldState.error)}
          errorMessage={fieldState.error?.message}
          classNames={inputClassNames}
        />
      )}
    />
  );
}

interface NumberProps<T extends FieldValues> extends BaseProps<T> {
  min?: number;
  max?: number;
}

export function SheetNumber<T extends FieldValues>({
  control,
  name,
  label,
  min,
  max,
  isDisabled,
}: NumberProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          type="number"
          label={label}
          min={min}
          max={max}
          isDisabled={isDisabled}
          value={
            field.value === undefined || field.value === null
              ? ''
              : String(field.value)
          }
          onValueChange={raw => {
            if (raw === '') {
              field.onChange(0);
              return;
            }
            const n = Number(raw);
            field.onChange(Number.isNaN(n) ? 0 : n);
          }}
          onBlur={field.onBlur}
          isInvalid={Boolean(fieldState.error)}
          errorMessage={fieldState.error?.message}
          classNames={inputClassNames}
        />
      )}
    />
  );
}

export function SheetTextarea<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  minRows = 3,
}: BaseProps<T> & { minRows?: number }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Textarea
          label={label}
          placeholder={placeholder}
          minRows={minRows}
          value={(field.value as string) ?? ''}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          isInvalid={Boolean(fieldState.error)}
          errorMessage={fieldState.error?.message}
          classNames={inputClassNames}
        />
      )}
    />
  );
}

export function SheetCheckbox<T extends FieldValues>({
  control,
  name,
  label,
}: BaseProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Checkbox
          isSelected={Boolean(field.value)}
          onValueChange={field.onChange}
          classNames={{ label: 'text-sm text-ink-muted' }}
        >
          {label}
        </Checkbox>
      )}
    />
  );
}

interface SelectOption {
  value: string;
  label: string;
}

export function SheetSelect<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  options,
  allowEmpty,
}: BaseProps<T> & { options: SelectOption[]; allowEmpty?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Select
          label={label}
          placeholder={placeholder}
          selectedKeys={field.value ? [String(field.value)] : []}
          onSelectionChange={keys => {
            const next = Array.from(keys)[0];
            field.onChange(next ?? (allowEmpty ? '' : field.value));
          }}
          isInvalid={Boolean(fieldState.error)}
          errorMessage={fieldState.error?.message}
          classNames={selectClassNames}
        >
          {options.map(opt => (
            <SelectItem key={opt.value}>{opt.label}</SelectItem>
          ))}
        </Select>
      )}
    />
  );
}
