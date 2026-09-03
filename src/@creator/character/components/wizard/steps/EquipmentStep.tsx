'use client';

import { Textarea } from '@heroui/react';

import type { EquipmentOption } from '../../../lib/srd/types';
import { StepHeading } from '../parts';
import type { StepProps } from '../types';

function PackagePicker({
  title,
  hint,
  options,
  chosen,
  onChoose,
}: {
  title: string;
  hint: string;
  options: EquipmentOption[];
  chosen: string;
  onChoose: (label: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <section>
      <h3 className="font-display text-base text-ink">{title}</h3>
      <p className="mb-2 text-sm text-ink-muted">{hint}</p>
      <div className="space-y-2">
        {options.map(option => (
          <button
            key={option.label}
            type="button"
            onClick={() => onChoose(option.label)}
            className={`flex w-full gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
              chosen === option.label
                ? 'border-gold bg-gold/15 text-ink'
                : 'border-line bg-surface text-ink-muted hover:border-gold/60 hover:text-ink'
            }`}
          >
            <span className="font-display text-base text-ink">{option.label}</span>
            <span className="flex-1">{option.desc}</span>
            {option.gp > 0 && (
              <span className="shrink-0 font-display-alt text-xs text-gold-strong">
                {option.gp} gp
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Starting gear comes in lettered packages — one from the class, one from the
 * background — and each ends in a coin purse, so picking them also sets the
 * character's starting gold.
 */
export function EquipmentStep({
  sheet,
  build,
  catalog,
  classDef,
  patchBuild,
  setOverride,
  log,
}: StepProps) {
  const background =
    catalog.backgrounds.find(b => b.key === build.backgroundKey) ?? null;

  const choose = (
    field: 'classOption' | 'backgroundOption',
    label: string,
    source: string,
    desc: string
  ) => {
    patchBuild(b => ({
      ...b,
      equipment: { ...b.equipment, [field]: label },
      // The gold that rides along with a package is the build's to set again.
      overrides: b.overrides.filter(p => p !== 'currency.gp'),
    }));
    log({
      kind: 'field',
      label: `${source} equipment`,
      detail: `${source} starting equipment ${label}: ${desc}`,
    });
  };

  const nothing =
    (classDef?.coreTraits.equipment.length ?? 0) === 0 &&
    (background?.equipment.length ?? 0) === 0;

  return (
    <div className="space-y-6">
      <StepHeading
        title="Starting equipment"
        lede="Take a package or take the coin. Whichever you pick lands on the sheet, gold included — and you can edit the list afterwards."
      />

      <PackagePicker
        title={`${build.className || 'Class'} equipment`}
        hint="One package from your class."
        options={classDef?.coreTraits.equipment ?? []}
        chosen={build.equipment.classOption}
        onChoose={label => {
          const option = classDef?.coreTraits.equipment.find(e => e.label === label);
          choose('classOption', label, build.className, option?.desc ?? '');
        }}
      />

      <PackagePicker
        title={`${background?.name ?? 'Background'} equipment`}
        hint="One package from your background."
        options={background?.equipment ?? []}
        chosen={build.equipment.backgroundOption}
        onChoose={label => {
          const option = background?.equipment.find(e => e.label === label);
          choose(
            'backgroundOption',
            label,
            background?.name ?? 'Background',
            option?.desc ?? ''
          );
        }}
      />

      {nothing && (
        <p className="text-sm text-ink-muted">
          Pick a class and a background first — the packages come from them.
        </p>
      )}

      <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-display text-base text-ink">On your person</h3>
          <span className="text-sm text-gold-strong tabular-nums">
            {sheet.currency.gp} gp
          </span>
        </div>
        <Textarea
          minRows={5}
          value={sheet.equipment.items}
          onValueChange={value => setOverride('equipment.items', value)}
          placeholder="Everything you are carrying."
          classNames={{ inputWrapper: 'bg-surface border-line' }}
          aria-label="Equipment and items"
        />
        <p className="mt-2 text-xs text-ink-subtle">
          Editing this list makes it yours — changing a package later will leave
          it alone.
        </p>
      </div>
    </div>
  );
}
