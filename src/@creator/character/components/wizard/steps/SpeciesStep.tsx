'use client';

import { useState } from 'react';
import { Input } from '@heroui/react';

import { ChoiceCard, ChoiceGrid, Fact, FactRow, StepHeading } from '../parts';
import type { StepProps } from '../types';

export function SpeciesStep({
  build,
  catalog,
  patchBuild,
  setOverride,
  log,
  onCustomField,
  sheet,
}: StepProps) {
  const [custom, setCustom] = useState(
    Boolean(build.speciesName) && !build.speciesKey
  );
  const [customName, setCustomName] = useState(
    build.speciesKey ? '' : build.speciesName
  );

  const species = catalog.species.find(s => s.key === build.speciesKey) ?? null;

  const pick = (key: string, name: string) => {
    setCustom(false);
    const next = catalog.species.find(s => s.key === key);
    patchBuild(b => ({
      ...b,
      speciesKey: key,
      speciesName: name,
      // Lineage picks and the free skill belong to the species that granted them.
      speciesChoices: b.speciesKey === key ? b.speciesChoices : [],
      bonusSkills: b.speciesKey === key ? b.bonusSkills : [],
    }));
    setOverride('identity.size', next?.sizes[0] ?? 'Medium');
    log({ kind: 'field', label: 'Species', detail: `Species: ${name}` });
  };

  const commitCustom = (value: string) => {
    setCustomName(value);
    patchBuild(b => ({ ...b, speciesKey: '', speciesName: value }));
    onCustomField('identity.species', 'species', value, value.trim().length > 0);
  };

  const chooseTrait = (trait: string, option: string, detail: string) => {
    patchBuild(b => ({
      ...b,
      speciesChoices: [
        ...b.speciesChoices.filter(c => c.trait !== trait),
        { trait, option, detail: detail.slice(0, 600) },
      ],
    }));
    log({
      kind: 'field',
      label: trait,
      detail: `${trait}: ${option}`,
    });
  };

  const chosenFor = (trait: string) =>
    build.speciesChoices.find(c => c.trait === trait)?.option ?? '';

  return (
    <div>
      <StepHeading
        title="Choose a species"
        lede="Where your hero comes from. Species set your size, speed and the traits you were born with — in the 2024 rules they never change your ability scores."
      />

      <ChoiceGrid>
        {catalog.species.map(option => (
          <ChoiceCard
            key={option.key}
            title={option.name}
            selected={build.speciesKey === option.key}
            onSelect={() => pick(option.key, option.name)}
            meta={`${option.sizes.join(' or ')} · ${option.speed} ft`}
            blurb={option.blurb}
          />
        ))}
        <ChoiceCard
          custom
          title="A species of your own"
          selected={custom}
          onSelect={() => setCustom(true)}
          meta="homebrew"
          blurb="Describe it yourself; the sheet is flagged as homebrew for your DM."
        />
      </ChoiceGrid>

      {custom && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-arcane/40 bg-arcane/5 p-4">
          <Input
            label="Species name"
            value={customName}
            onValueChange={commitCustom}
            classNames={{ inputWrapper: 'bg-surface border-line' }}
          />
        </div>
      )}

      {species && (
        <div className="mt-6 space-y-4 rounded-[var(--radius-card)] border border-gold/30 bg-surface-2 p-4">
          <FactRow>
            <Fact label="Speed" value={`${species.speed} ft`} />
            <Fact
              label="Size"
              value={
                species.sizes.length === 1 ? (
                  species.sizes[0]
                ) : (
                  <div className="flex gap-1">
                    {species.sizes.map(size => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setOverride('identity.size', size)}
                        className={`rounded px-1.5 text-sm ${
                          sheet.identity.size === size
                            ? 'bg-gold/20 text-gold-strong'
                            : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                )
              }
            />
          </FactRow>

          <div className="space-y-3">
            {species.traits.map(trait => (
              <div key={trait.name}>
                <h4 className="font-display text-sm text-ink">{trait.name}</h4>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-muted">
                  {trait.options.length > 0
                    ? trait.desc.split('\n')[0]
                    : trait.desc}
                </p>

                {trait.options.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {trait.options.map(option => {
                      const selected = chosenFor(trait.name) === option.label;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          title={option.detail}
                          onClick={() =>
                            chooseTrait(trait.name, option.label, option.detail)
                          }
                          className={`max-w-full truncate rounded-md border px-2.5 py-1 text-sm transition-colors ${
                            selected
                              ? 'border-gold bg-gold/15 text-ink'
                              : 'border-line bg-surface text-ink-muted hover:border-gold/60 hover:text-ink'
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {trait.options.length > 0 && chosenFor(trait.name) && (
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    {
                      trait.options.find(o => o.label === chosenFor(trait.name))
                        ?.detail
                    }
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
