'use client';

import { useState } from 'react';
import { Input } from '@heroui/react';

import { DiceSpinner } from '@/@shared/components/ui';

import { ABILITY_LABELS, SKILL_LABELS, type SkillKey } from '../../../schema';
import { planLevels } from '../../../lib/advancement';
import { ChoiceCard, ChoiceGrid, Fact, FactRow, StepHeading } from '../parts';
import type { StepProps } from '../types';

const CASTER_LABEL: Record<string, string> = {
  NONE: 'no spellcasting',
  FULL: 'full caster',
  HALF: 'half caster',
  THIRD: 'third caster',
  PACT: 'pact magic',
};

export function ClassStep({
  build,
  catalog,
  limits,
  classDef,
  loadingClass,
  sheet,
  chooseClass,
  patchBuild,
  log,
  onCustomField,
}: StepProps) {
  const [custom, setCustom] = useState(
    Boolean(build.className) && !build.classKey
  );
  const [customName, setCustomName] = useState(
    build.classKey ? '' : build.className
  );

  const commitCustom = (value: string) => {
    setCustomName(value);
    patchBuild(b => ({ ...b, classKey: '', className: value }));
    onCustomField('identity.class', 'class', value, value.trim().length > 0);
  };

  const pick = (key: string, name: string) => {
    setCustom(false);
    chooseClass(key, name);
    log({ kind: 'field', label: 'Class', detail: `Class: ${name}` });
  };

  const banned = new Set(limits.bannedClasses.map(n => n.trim().toLowerCase()));
  const classes = catalog.classes.filter(
    option => !banned.has(option.name.trim().toLowerCase())
  );

  const skillChoice = classDef?.coreTraits.skillChoice;
  const steps = classDef
    ? planLevels(classDef, sheet.identity.level, build.subclassKey)
    : [];

  return (
    <div>
      <StepHeading
        title="Pick a class"
        lede="What your hero does. The class sets the hit die, saving throws, armour and weapon training, and everything that arrives as you level."
      />

      <ChoiceGrid>
        {classes.map(option => (
          <ChoiceCard
            key={option.key}
            title={option.name}
            selected={build.classKey === option.key}
            onSelect={() => pick(option.key, option.name)}
            meta={
              <>
                d{option.hitDie} · {CASTER_LABEL[option.casterType]} ·{' '}
                {option.primaryAbilities
                  .map(a => ABILITY_LABELS[a].slice(0, 3))
                  .join('/') || '—'}
              </>
            }
            blurb={option.blurb}
          />
        ))}
        {limits.allowHomebrew && (
          <ChoiceCard
            custom
            title="A class of your own"
            selected={custom}
            onSelect={() => setCustom(true)}
            meta="homebrew"
            blurb="Name it yourself. The character is flagged as homebrew and your DM sees it in the change log."
          />
        )}
      </ChoiceGrid>

      {banned.size > 0 && (
        <p className="mt-3 text-sm text-ink-subtle">
          Classes this table does not allow are not listed.
        </p>
      )}

      {custom && (
        <div className="mt-4 rounded-[var(--radius-card)] border border-arcane/40 bg-arcane/5 p-4">
          <Input
            label="Class name"
            value={customName}
            onValueChange={commitCustom}
            classNames={{ inputWrapper: 'bg-surface border-line' }}
          />
          <p className="mt-2 text-xs text-ink-subtle">
            Nothing is filled in automatically for a homebrew class — set the
            hit die, proficiencies and features on the sheet view.
          </p>
        </div>
      )}

      {loadingClass && (
        <div className="mt-6">
          <DiceSpinner label={`Reading the ${build.className} entry…`} />
        </div>
      )}

      {classDef && !loadingClass && (
        <div className="mt-6 rounded-[var(--radius-card)] border border-gold/30 bg-surface-2 p-4">
          <h3 className="font-display text-lg text-ink">
            {classDef.name} — what you get
          </h3>

          <div className="mt-3">
            <FactRow>
              <Fact label="Hit die" value={`d${classDef.hitDie}`} />
              <Fact
                label="Saving throws"
                value={
                  classDef.coreTraits.savingThrows
                    .map(a => ABILITY_LABELS[a])
                    .join(' & ') || '—'
                }
              />
              <Fact
                label="Armour"
                value={classDef.coreTraits.armor || 'None'}
              />
              <Fact
                label="Weapons"
                value={classDef.coreTraits.weapons || 'None'}
              />
              {classDef.coreTraits.tools && (
                <Fact label="Tools" value={classDef.coreTraits.tools} />
              )}
              <Fact
                label="Subclass at"
                value={`level ${classDef.subclassLevel}`}
              />
            </FactRow>
          </div>

          {skillChoice && (
            <p className="mt-3 text-sm text-ink-muted">
              Choose {skillChoice.count}{' '}
              {skillChoice.options.length === 0
                ? 'skills of any kind'
                : `from ${skillChoice.options
                    .map((k: SkillKey) => SKILL_LABELS[k])
                    .join(', ')}`}{' '}
              — you do that on the Skills step.
            </p>
          )}

          <h4 className="mt-4 font-display-alt text-xs uppercase tracking-[0.14em] text-ink-subtle">
            Features through level {sheet.identity.level}
          </h4>
          <ul className="mt-2 space-y-1 text-sm">
            {steps.flatMap(step =>
              step.grants.map(grant => (
                <li key={`${step.level}-${grant.name}`} className="flex gap-2">
                  <span className="w-14 shrink-0 tabular-nums text-ink-subtle">
                    Lv {step.level}
                  </span>
                  <span className="text-ink">{grant.name}</span>
                </li>
              ))
            )}
          </ul>

          {classDef.subclasses.length > 0 && (
            <p className="mt-3 text-sm text-ink-muted">
              Subclasses at level {classDef.subclassLevel}:{' '}
              {classDef.subclasses.map(s => s.name).join(', ')}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
