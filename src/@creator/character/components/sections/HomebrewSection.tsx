'use client';

import { Button } from '@heroui/react';
import {
  type Control,
  type UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form';

import { SectionCard } from '@/@shared/components/ui';

import { HOMEBREW_KIND_LABELS, type CharacterSheet } from '../../schema';
import { SheetText, SheetTextarea } from '../fields';

type C = Control<CharacterSheet>;

function TraitList({
  control,
  entryIndex,
}: {
  control: C;
  entryIndex: number;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `homebrew.entries.${entryIndex}.traits`,
  });

  return (
    <div className="space-y-3">
      {fields.map((f, i) => (
        <div
          key={f.id}
          className="rounded-md border border-line bg-surface-2 p-3"
        >
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <SheetText
                control={control}
                name={`homebrew.entries.${entryIndex}.traits.${i}.name`}
                label="Trait / ability name"
              />
              <SheetTextarea
                control={control}
                name={`homebrew.entries.${entryIndex}.traits.${i}.description`}
                label="What it does"
                minRows={2}
              />
              <SheetText
                control={control}
                name={`homebrew.entries.${entryIndex}.traits.${i}.mechanic`}
                label="Rules shorthand (optional)"
                placeholder="e.g. 1/long rest, 15-ft cone, DEX save DC 8+prof+CON"
              />
            </div>
            <Button
              size="sm"
              isIconOnly
              variant="light"
              className="text-ink-muted data-[hover=true]:text-danger"
              aria-label="Remove trait"
              onPress={() => remove(i)}
            >
              ✕
            </Button>
          </div>
        </div>
      ))}
      <Button
        size="sm"
        variant="flat"
        onPress={() => append({ name: '', description: '', mechanic: '' })}
      >
        + Add trait / ability
      </Button>
    </div>
  );
}

export function HomebrewSection({
  control,
  setValue,
}: {
  control: C;
  setValue: UseFormSetValue<CharacterSheet>;
}) {
  const { fields, remove } = useFieldArray({
    control,
    name: 'homebrew.entries',
  });
  const entries = (useWatch({ control, name: 'homebrew.entries' }) ??
    []) as CharacterSheet['homebrew']['entries'];

  if (fields.length === 0) return null;

  return (
    <SectionCard
      framed
      title="Homebrew"
      description="Custom species, classes, and backgrounds you entered above. Define what they do — your DM approves or rejects each one when you join a campaign."
      bodyClassName="space-y-5 border-t-2 border-t-arcane/50"
    >
      {fields.map((f, i) => {
        const entry = entries[i];
        return (
          <div
            key={f.id}
            className="rounded-[var(--radius-card)] border border-arcane/30 bg-surface p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <span className="rounded-sm border border-arcane/40 bg-arcane/10 px-2 py-0.5 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-arcane">
                  {HOMEBREW_KIND_LABELS[entry?.kind ?? 'other']}
                </span>
                <p className="mt-1 font-display text-lg text-ink">
                  {entry?.name || 'Unnamed custom entry'}
                </p>
              </div>
              <Button
                size="sm"
                variant="light"
                className="text-ink-muted data-[hover=true]:text-danger"
                onPress={() => {
                  const field = entry?.field;
                  remove(i);
                  if (field) {
                    setValue(field as never, '' as never, {
                      shouldDirty: true,
                    });
                  }
                }}
              >
                Discard
              </Button>
            </div>
            <div className="space-y-3">
              <SheetText
                control={control}
                name={`homebrew.entries.${i}.name`}
                label="Name"
              />
              <TraitList control={control} entryIndex={i} />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-ink-subtle">
        Everything here is saved to your private homebrew collection and shared
        with a campaign&rsquo;s DM for review when you join.
      </p>
    </SectionCard>
  );
}
