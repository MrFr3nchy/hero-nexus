'use client';

import { Button } from '@heroui/react';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import { SectionCard } from '@/@shared/components/ui';

import { HOMEBREW_KIND_LABELS, type CharacterSheet } from '../../schema';
import { SheetText, SheetTextarea } from '../fields';

type C = Control<CharacterSheet>;
type Entries = CharacterSheet['homebrew']['entries'];

/**
 * Custom identity content. Deliberately does NOT use `useFieldArray` — a second
 * field-array bound to the same name as the one in `CharacterForm` desyncs in
 * RHF. Structural edits go through `setValue` with a whole-array replace; the
 * text inputs stay Controller-bound by concrete path.
 */
export function HomebrewSection({
  control,
  setValue,
}: {
  control: C;
  setValue: UseFormSetValue<CharacterSheet>;
}) {
  const entries = (useWatch({ control, name: 'homebrew.entries' }) ??
    []) as Entries;

  if (entries.length === 0) return null;

  const commit = (next: Entries) => {
    setValue('homebrew.entries', next, { shouldDirty: true });
    setValue('homebrew.isHomebrew', next.length > 0, { shouldDirty: true });
  };

  const addTrait = (i: number) => {
    const next = entries.map((e, idx) =>
      idx === i
        ? {
            ...e,
            traits: [...e.traits, { name: '', description: '', mechanic: '' }],
          }
        : e
    );
    commit(next);
  };

  const removeTrait = (i: number, ti: number) => {
    const next = entries.map((e, idx) =>
      idx === i ? { ...e, traits: e.traits.filter((_, x) => x !== ti) } : e
    );
    commit(next);
  };

  const discard = (i: number) => {
    const field = entries[i]?.field;
    commit(entries.filter((_, idx) => idx !== i));
    if (field) setValue(field as never, '' as never, { shouldDirty: true });
  };

  return (
    <SectionCard
      framed
      title="Homebrew"
      description="Custom species, classes, and backgrounds you entered above. Define what they do — your DM approves or rejects each one when you join a campaign."
      bodyClassName="space-y-5 border-t-2 border-t-arcane/50"
    >
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          className="rounded-[var(--radius-card)] border border-arcane/30 bg-surface p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <span className="rounded-sm border border-arcane/40 bg-arcane/10 px-2 py-0.5 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-arcane">
                {HOMEBREW_KIND_LABELS[entry.kind]}
              </span>
              <p className="mt-1 font-display text-lg text-ink">
                {entry.name || 'Unnamed custom entry'}
              </p>
            </div>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted data-[hover=true]:text-danger"
              onPress={() => discard(i)}
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

            {entry.traits.map((_, ti) => (
              <div
                key={ti}
                className="rounded-md border border-line bg-surface-2 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <SheetText
                      control={control}
                      name={`homebrew.entries.${i}.traits.${ti}.name`}
                      label="Trait / ability name"
                    />
                    <SheetTextarea
                      control={control}
                      name={`homebrew.entries.${i}.traits.${ti}.description`}
                      label="What it does"
                      minRows={2}
                    />
                    <SheetText
                      control={control}
                      name={`homebrew.entries.${i}.traits.${ti}.mechanic`}
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
                    onPress={() => removeTrait(i, ti)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}

            <Button size="sm" variant="flat" onPress={() => addTrait(i)}>
              + Add trait / ability
            </Button>
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-subtle">
        Everything here is saved to your private homebrew collection and shared
        with a campaign&rsquo;s DM for review when you join.
      </p>
    </SectionCard>
  );
}
