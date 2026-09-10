'use client';

import {
  ChoiceCard,
  ChoiceGrid,
  Fact,
  FactRow,
  MissingChoiceCard,
  StepHeading,
} from '../parts';
import type { StepProps } from '../types';

export function SpeciesStep({
  build,
  catalog,
  limits,
  patchBuild,
  chooseSpecies,
  setOverride,
  log,
  onCustomField,
  forge,
  sheet,
}: StepProps) {
  const species = catalog.species.find(s => s.key === build.speciesKey) ?? null;

  const banned = new Set(limits.bannedSpecies.map(n => n.trim().toLowerCase()));
  const options = catalog.species.filter(
    option =>
      !banned.has(option.name.trim().toLowerCase()) &&
      (limits.allowHomebrew || option.source === 'srd')
  );

  const pick = (key: string, name: string) => {
    const next = catalog.species.find(s => s.key === key);
    chooseSpecies(key, name);
    setOverride('identity.size', next?.sizes[0] ?? 'Medium');
    log({ kind: 'field', label: 'Species', detail: `Species: ${name}` });
  };

  const missing =
    Boolean(build.speciesKey) &&
    !catalog.species.some(o => o.key === build.speciesKey);

  /*
   * The forged species is gone. Keep the word rather than silently unselecting
   * the grid, and register it as a custom field so the sheet view has a place
   * to fill the traits back in.
   */
  const dropLink = () => {
    patchBuild(b => ({
      ...b,
      speciesKey: '',
      speciesName: build.speciesName,
      speciesSource: 'srd',
    }));
    onCustomField('identity.species', 'species', build.speciesName, true);
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
        {options.map(option => (
          <ChoiceCard
            key={option.key}
            title={option.name}
            homebrew={option.source === 'homebrew'}
            selected={build.speciesKey === option.key}
            onSelect={() => pick(option.key, option.name)}
            meta={`${option.sizes.join(' or ')} · ${option.speed} ft`}
            blurb={option.blurb}
          />
        ))}
        {limits.allowHomebrew && (
          <ChoiceCard
            custom
            title="Forge a species"
            selected={false}
            onSelect={() => forge('species')}
            meta="homebrew"
            blurb="Open the Forge here: size, speed and the traits it is born with. It becomes a real species in your forge and this hero picks it up."
          />
        )}
      </ChoiceGrid>

      {missing && (
        <div className="mt-4">
          <MissingChoiceCard
            name={build.speciesName || 'A forged species'}
            kind="species"
            onClear={dropLink}
          />
        </div>
      )}

      {banned.size > 0 && (
        <p className="mt-3 text-sm text-ink-subtle">
          Species this table does not allow are not listed.
        </p>
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
