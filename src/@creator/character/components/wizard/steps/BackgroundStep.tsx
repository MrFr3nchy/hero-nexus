'use client';

import { useState } from 'react';
import { Input } from '@heroui/react';

import { ABILITY_LABELS, SKILL_LABELS, type AbilityKey } from '../../../schema';
import { ChoiceCard, ChoiceGrid, Fact, FactRow, StepHeading } from '../parts';
import type { StepProps } from '../types';

/**
 * A 2024 background hands out three things the sheet cares about: two skills,
 * a tool, an origin feat — and the ability increase, which is the only place
 * ability scores go up outside an ASI.
 */
export function BackgroundStep({
  limits,
  build,
  catalog,
  patchBuild,
  log,
  onCustomField,
}: StepProps) {
  const [custom, setCustom] = useState(
    Boolean(build.backgroundName) && !build.backgroundKey
  );
  const [customName, setCustomName] = useState(
    build.backgroundKey ? '' : build.backgroundName
  );

  const background =
    catalog.backgrounds.find(b => b.key === build.backgroundKey) ?? null;
  const boost = build.backgroundBoost;

  const pick = (key: string, name: string) => {
    setCustom(false);
    patchBuild(b => ({
      ...b,
      backgroundKey: key,
      backgroundName: name,
      backgroundBoost:
        b.backgroundKey === key
          ? b.backgroundBoost
          : { mode: 'two-one', plusTwo: '', plusOnes: [] },
      equipment: {
        ...b.equipment,
        backgroundOption:
          b.backgroundKey === key ? b.equipment.backgroundOption : '',
      },
    }));
    log({ kind: 'field', label: 'Background', detail: `Background: ${name}` });
  };

  const commitCustom = (value: string) => {
    setCustomName(value);
    patchBuild(b => ({ ...b, backgroundKey: '', backgroundName: value }));
    onCustomField(
      'identity.background',
      'background',
      value,
      value.trim().length > 0
    );
  };

  const setMode = (mode: 'two-one' | 'three') =>
    patchBuild(b => ({
      ...b,
      backgroundBoost:
        mode === 'three'
          ? { mode, plusTwo: '', plusOnes: background?.abilityOptions ?? [] }
          : { mode, plusTwo: '', plusOnes: [] },
    }));

  const setPlusTwo = (ability: AbilityKey) =>
    patchBuild(b => ({
      ...b,
      backgroundBoost: {
        mode: 'two-one',
        plusTwo: ability,
        plusOnes: b.backgroundBoost.plusOnes.filter(k => k !== ability),
      },
    }));

  const setPlusOne = (ability: AbilityKey) =>
    patchBuild(b => ({
      ...b,
      backgroundBoost: {
        ...b.backgroundBoost,
        mode: 'two-one',
        plusOnes: [ability],
      },
    }));

  const describeBoost = (): string => {
    if (!boost.plusTwo && boost.plusOnes.length === 0)
      return 'nothing assigned yet';
    if (boost.mode === 'three') {
      return boost.plusOnes
        .map(k => `+1 ${ABILITY_LABELS[k as AbilityKey] ?? k}`)
        .join(', ');
    }
    const parts: string[] = [];
    if (boost.plusTwo) {
      parts.push(
        `+2 ${ABILITY_LABELS[boost.plusTwo as AbilityKey] ?? boost.plusTwo}`
      );
    }
    for (const k of boost.plusOnes) {
      parts.push(`+1 ${ABILITY_LABELS[k as AbilityKey] ?? k}`);
    }
    return parts.join(', ');
  };

  return (
    <div>
      <StepHeading
        title="Choose a background"
        lede="Your life before the adventure. It grants two skills, a tool, an origin feat, starting gear — and the only ability increase you get before level 4."
      />

      <ChoiceGrid>
        {catalog.backgrounds.map(option => (
          <ChoiceCard
            key={option.key}
            title={option.name}
            selected={build.backgroundKey === option.key}
            onSelect={() => pick(option.key, option.name)}
            meta={option.abilityOptions
              .map(a => ABILITY_LABELS[a].slice(0, 3))
              .join(' / ')}
            blurb={`${option.skills.map(s => SKILL_LABELS[s]).join(', ')} · ${option.feat}`}
          />
        ))}
        {limits.allowHomebrew && (
          <ChoiceCard
            custom
            title="A background of your own"
            selected={custom}
            onSelect={() => setCustom(true)}
            meta="homebrew"
            blurb="Write your own origin. Fill in its skills and gear on the sheet view."
          />
        )}
      </ChoiceGrid>

      {custom && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-arcane/40 bg-arcane/5 p-4">
          <Input
            label="Background name"
            value={customName}
            onValueChange={commitCustom}
            classNames={{ inputWrapper: 'bg-surface border-line' }}
          />
        </div>
      )}

      {background && (
        <div className="mt-6 space-y-4 rounded-[var(--radius-card)] border border-gold/30 bg-surface-2 p-4">
          <FactRow>
            <Fact
              label="Skills"
              value={background.skills.map(s => SKILL_LABELS[s]).join(' & ')}
            />
            <Fact label="Tool" value={background.tool || '—'} />
            <Fact label="Origin feat" value={background.feat || '—'} />
          </FactRow>

          <div>
            <h4 className="font-display text-sm text-ink">Ability increase</h4>
            <p className="mt-0.5 text-sm text-ink-muted">
              Spread 3 points across{' '}
              {background.abilityOptions.map(a => ABILITY_LABELS[a]).join(', ')}
              .
            </p>

            <div className="mt-3 inline-flex overflow-hidden rounded-md border border-line">
              <button
                type="button"
                onClick={() => setMode('two-one')}
                className={`px-3 py-1 text-xs transition-colors ${
                  boost.mode === 'two-one'
                    ? 'bg-gold/15 text-gold-strong'
                    : 'bg-surface text-ink-muted hover:text-ink'
                }`}
              >
                +2 and +1
              </button>
              <button
                type="button"
                onClick={() => setMode('three')}
                className={`px-3 py-1 text-xs transition-colors ${
                  boost.mode === 'three'
                    ? 'bg-gold/15 text-gold-strong'
                    : 'bg-surface text-ink-muted hover:text-ink'
                }`}
              >
                +1 to all three
              </button>
            </div>

            {boost.mode === 'two-one' && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-ink-subtle">
                    +2 goes to
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {background.abilityOptions.map(ability => (
                      <button
                        key={ability}
                        type="button"
                        onClick={() => setPlusTwo(ability)}
                        className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
                          boost.plusTwo === ability
                            ? 'border-gold bg-gold/15 text-ink'
                            : 'border-line bg-surface text-ink-muted hover:border-gold/60'
                        }`}
                      >
                        {ABILITY_LABELS[ability]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-ink-subtle">
                    +1 goes to
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {background.abilityOptions
                      .filter(a => a !== boost.plusTwo)
                      .map(ability => (
                        <button
                          key={ability}
                          type="button"
                          onClick={() => setPlusOne(ability)}
                          className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
                            boost.plusOnes.includes(ability)
                              ? 'border-gold bg-gold/15 text-ink'
                              : 'border-line bg-surface text-ink-muted hover:border-gold/60'
                          }`}
                        >
                          {ABILITY_LABELS[ability]}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            )}

            <p className="mt-3 text-sm text-gold-strong">{describeBoost()}</p>
          </div>
        </div>
      )}
    </div>
  );
}
