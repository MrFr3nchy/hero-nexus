'use client';

import {
  SKILL_ABILITY,
  SKILL_KEYS,
  SKILL_LABELS,
  type SkillKey,
} from '../../../schema';
import { speciesSkillGrant } from '../../../lib/srd/parse';
import { TogglePill, StepHeading } from '../parts';
import type { StepProps } from '../types';

function Picker({
  title,
  hint,
  options,
  chosen,
  limit,
  locked,
  onToggle,
}: {
  title: string;
  hint: string;
  options: SkillKey[];
  chosen: SkillKey[];
  limit: number;
  /** Skills already granted elsewhere — shown, not pickable. */
  locked: Map<SkillKey, string>;
  onToggle: (skill: SkillKey) => void;
}) {
  const full = chosen.length >= limit;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base text-ink">{title}</h3>
        <span
          className={`font-display-alt text-xs uppercase tracking-[0.12em] ${
            full ? 'text-success' : 'text-ink-subtle'
          }`}
        >
          {chosen.length} of {limit}
        </span>
      </div>
      <p className="mb-2 text-sm text-ink-muted">{hint}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map(skill => {
          const grantedBy = locked.get(skill);
          const selected = chosen.includes(skill);
          return (
            <TogglePill
              key={skill}
              label={`${SKILL_LABELS[skill]}`}
              hint={grantedBy ?? SKILL_ABILITY[skill].slice(0, 3).toUpperCase()}
              selected={selected || Boolean(grantedBy)}
              locked={Boolean(grantedBy)}
              disabled={!selected && full}
              onToggle={() => onToggle(skill)}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * Skill proficiencies, split by where they come from: the background grants
 * two outright, the class lets you choose from a list, and a couple of species
 * hand out one more. Anything already granted is locked so you can't waste a
 * pick doubling up.
 */
export function SkillsStep({
  build,
  catalog,
  classDef,
  patchBuild,
  log,
}: StepProps) {
  const background =
    catalog.backgrounds.find(b => b.key === build.backgroundKey) ?? null;
  const species = catalog.species.find(s => s.key === build.speciesKey) ?? null;

  const classChoice = classDef?.coreTraits.skillChoice ?? null;
  const speciesChoice = species ? speciesSkillGrant(species) : null;

  const classSkills = build.classSkills.filter((k): k is SkillKey =>
    (SKILL_KEYS as readonly string[]).includes(k)
  );
  const bonusSkills = build.bonusSkills.filter((k): k is SkillKey =>
    (SKILL_KEYS as readonly string[]).includes(k)
  );

  const lockedForClass = new Map<SkillKey, string>();
  for (const skill of background?.skills ?? []) {
    lockedForClass.set(skill, background?.name ?? 'background');
  }
  for (const skill of bonusSkills) {
    lockedForClass.set(skill, species?.name ?? 'species');
  }

  const lockedForSpecies = new Map<SkillKey, string>();
  for (const skill of background?.skills ?? []) {
    lockedForSpecies.set(skill, background?.name ?? 'background');
  }
  for (const skill of classSkills) {
    lockedForSpecies.set(skill, build.className || 'class');
  }

  const toggle = (
    field: 'classSkills' | 'bonusSkills',
    skill: SkillKey,
    limit: number,
    source: string
  ) => {
    patchBuild(b => {
      const current = b[field] as string[];
      const has = current.includes(skill);
      const next = has
        ? current.filter(k => k !== skill)
        : [...current, skill].slice(-limit);
      return { ...b, [field]: next };
    });
    log({
      kind: 'field',
      label: `Skill: ${SKILL_LABELS[skill]}`,
      detail: `${SKILL_LABELS[skill]} proficiency from ${source}`,
    });
  };

  const nothingToPick = !classChoice && !speciesChoice;

  return (
    <div className="space-y-6">
      <StepHeading
        title="Choose your skills"
        lede="Proficiency adds your proficiency bonus to that skill's checks. Anything your background or species already gave you is shown locked."
      />

      {background && background.skills.length > 0 && (
        <p className="rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-ink-muted">
          {background.name} already grants{' '}
          {background.skills.map(s => SKILL_LABELS[s]).join(' and ')}.
        </p>
      )}

      {classChoice && (
        <Picker
          title={`${build.className} skills`}
          hint={
            classChoice.options.length === 0
              ? `Choose any ${classChoice.count}.`
              : `Choose ${classChoice.count} from your class list.`
          }
          options={
            classChoice.options.length === 0
              ? [...SKILL_KEYS]
              : classChoice.options
          }
          chosen={classSkills}
          limit={classChoice.count}
          locked={lockedForClass}
          onToggle={skill =>
            toggle('classSkills', skill, classChoice.count, build.className)
          }
        />
      )}

      {speciesChoice && (
        <Picker
          title={`${species?.name} skill`}
          hint={
            speciesChoice.options.length === 0
              ? 'Your species grants one skill of any kind.'
              : 'Your species grants one of these.'
          }
          options={
            speciesChoice.options.length === 0
              ? [...SKILL_KEYS]
              : speciesChoice.options
          }
          chosen={bonusSkills}
          limit={speciesChoice.count}
          locked={lockedForSpecies}
          onToggle={skill =>
            toggle(
              'bonusSkills',
              skill,
              speciesChoice.count,
              species?.name ?? 'species'
            )
          }
        />
      )}

      {nothingToPick && (
        <p className="text-sm text-ink-muted">
          Pick a class and a species first — they decide what there is to choose
          from here.
        </p>
      )}
    </div>
  );
}
