'use client';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_LABELS,
  type SkillKey,
} from '../../../schema';
import {
  abilityModifier,
  fmtBonus,
  passivePerception,
  proficiencyBonus,
  spellAttackBonus,
  spellSaveDC,
} from '../../../lib/derive';
import { grantedSkills } from '../../../lib/compose';
import { Fact, FactRow, StepHeading } from '../parts';
import type { StepProps } from '../types';

/** Last look before the character is inscribed. */
export function ReviewStep({
  sheet,
  build,
  catalog,
  classDef,
  issues,
}: StepProps & { issues: string[] }) {
  const refs = {
    classDef,
    species: catalog.species.find(s => s.key === build.speciesKey) ?? null,
    background:
      catalog.backgrounds.find(b => b.key === build.backgroundKey) ?? null,
  };
  const skills = [...grantedSkills(sheet, refs).entries()];
  const dc = spellSaveDC(sheet);
  const atk = spellAttackBonus(sheet);
  const slots = Object.entries(sheet.spellcasting.slots).filter(
    ([, slot]) => slot.total > 0
  );

  return (
    <div className="space-y-6">
      <StepHeading
        title="Read it back"
        lede="Everything the build worked out. If a line looks wrong, the sheet view lets you change it by hand."
      />

      {issues.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-warning/50 bg-warning/5 p-4">
          <h3 className="font-display text-base text-warning">
            Still to decide
          </h3>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-ink-muted">
            {issues.map(issue => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <FactRow>
        <Fact label="Level" value={sheet.identity.level} />
        <Fact
          label="Proficiency"
          value={fmtBonus(proficiencyBonus(sheet.identity.level))}
        />
        <Fact label="Hit points" value={sheet.combat.hitPointsMax} />
        <Fact
          label="Hit dice"
          value={`${sheet.combat.hitDiceMax}d${sheet.combat.hitDieSize}`}
        />
        <Fact label="Armour class" value={sheet.combat.armorClass} />
        <Fact label="Speed" value={`${sheet.combat.speed} ft`} />
        <Fact
          label="Initiative"
          value={fmtBonus(abilityModifier(sheet.abilities.dexterity.score))}
        />
        <Fact label="Passive perception" value={passivePerception(sheet)} />
      </FactRow>

      <section>
        <h3 className="font-display text-base text-ink">Abilities and saves</h3>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ABILITY_KEYS.map(key => {
            const score = sheet.abilities[key].score;
            const mod = abilityModifier(score);
            const proficient = sheet.abilities[key].proficientSave;
            return (
              <div
                key={key}
                className="rounded-md border border-line bg-surface-2 px-3 py-2"
              >
                <div className="text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
                  {ABILITY_LABELS[key]}
                </div>
                <div className="font-display text-lg tabular-nums text-ink">
                  {score}{' '}
                  <span className="text-sm text-ink-muted">
                    {fmtBonus(mod)}
                  </span>
                </div>
                <div className="text-xs text-ink-muted">
                  save{' '}
                  {fmtBonus(
                    proficient
                      ? mod + proficiencyBonus(sheet.identity.level)
                      : mod
                  )}
                  {proficient && (
                    <span className="text-gold-strong"> · proficient</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="font-display text-base text-ink">
          Skill proficiencies{' '}
          <span className="font-sans text-sm text-ink-subtle">
            ({skills.length})
          </span>
        </h3>
        {skills.length === 0 ? (
          <p className="mt-1 text-sm text-ink-muted">None chosen yet.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {skills.map(([skill, source]) => (
              <li
                key={skill}
                className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-sm"
              >
                <span className="text-ink">
                  {SKILL_LABELS[skill as SkillKey]}
                </span>
                <span className="text-xs text-ink-subtle">{source}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet.spellcasting.ability && (
        <section>
          <h3 className="font-display text-base text-ink">Spellcasting</h3>
          <div className="mt-2">
            <FactRow>
              <Fact
                label="Ability"
                value={ABILITY_LABELS[sheet.spellcasting.ability]}
              />
              <Fact label="Save DC" value={dc ?? '—'} />
              <Fact label="Attack" value={atk === null ? '—' : fmtBonus(atk)} />
              {slots.map(([level, slot]) => (
                <Fact
                  key={level}
                  label={level.replace('level', 'Level ')}
                  value={`${slot.total} slots`}
                />
              ))}
            </FactRow>
          </div>
        </section>
      )}

      {sheet.details.classFeatures && (
        <section>
          <h3 className="font-display text-base text-ink">Features</h3>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-muted">
            {sheet.details.classFeatures}
          </pre>
        </section>
      )}

      {sheet.details.speciesTraits && (
        <section>
          <h3 className="font-display text-base text-ink">Species traits</h3>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-muted">
            {sheet.details.speciesTraits}
          </pre>
        </section>
      )}

      {sheet.details.feats && (
        <section>
          <h3 className="font-display text-base text-ink">Feats</h3>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-muted">
            {sheet.details.feats}
          </pre>
        </section>
      )}
    </div>
  );
}
