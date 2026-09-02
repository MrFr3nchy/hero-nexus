'use client';

import { Control, useWatch } from 'react-hook-form';

import { SectionCard } from '@/@shared/components/ui';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type CharacterSheet,
  type HomebrewKind,
  SKILL_ABILITY,
  SKILL_KEYS,
  SKILL_LABELS,
  type SpellSlotLevel,
} from '../../schema';
import {
  abilityModifier,
  fmtBonus,
  initiative,
  passivePerception,
  proficiencyBonus,
  spellAttackBonus,
  spellSaveDC,
} from '../../lib/derive';
import {
  SheetCheckbox,
  SheetComboBox,
  SheetNumber,
  SheetSelect,
  SheetText,
  SheetTextarea,
} from '../fields';

export { AbilityScoresSection } from './AbilityScoresSection';
export { HomebrewSection } from './HomebrewSection';
export { ChangeLogSection } from './ChangeLogSection';

export interface SelectOption {
  value: string;
  label: string;
}

/** Called when an identity field is picked or typed; `isCustom` = not in SRD. */
export type CustomFieldHandler = (
  field: string,
  kind: HomebrewKind,
  value: string,
  isCustom: boolean
) => void;

export interface ReferenceOptions {
  classes: SelectOption[];
  species: SelectOption[];
  backgrounds: SelectOption[];
  alignments: SelectOption[];
}

type C = Control<CharacterSheet>;

function Section({
  title,
  children,
  arcane,
}: {
  title: string;
  children: React.ReactNode;
  arcane?: boolean;
}) {
  return (
    <SectionCard
      framed
      title={title}
      bodyClassName={`space-y-4 ${arcane ? 'border-t-2 border-t-arcane/50' : ''}`}
    >
      {children}
    </SectionCard>
  );
}

function Derived({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 py-2 text-center">
      <div className="text-[0.7rem] uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </div>
      <div className="font-display text-lg text-ink tabular-nums">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function IdentitySection({
  control,
  reference,
  onCustomField,
}: {
  control: C;
  reference: ReferenceOptions;
  onCustomField: CustomFieldHandler;
}) {
  return (
    <Section title="Identity">
      <SheetText
        control={control}
        name="identity.name"
        label="Character Name"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SheetComboBox
          control={control}
          name="identity.class"
          label="Class"
          options={reference.classes}
          onResolved={(v, custom) =>
            onCustomField('identity.class', 'class', v, custom)
          }
        />
        <SheetText
          control={control}
          name="identity.subclass"
          label="Subclass"
        />
        <SheetComboBox
          control={control}
          name="identity.species"
          label="Species"
          options={reference.species}
          onResolved={(v, custom) =>
            onCustomField('identity.species', 'species', v, custom)
          }
        />
        <SheetComboBox
          control={control}
          name="identity.background"
          label="Background"
          options={reference.backgrounds}
          onResolved={(v, custom) =>
            onCustomField('identity.background', 'background', v, custom)
          }
        />
        <SheetComboBox
          control={control}
          name="identity.alignment"
          label="Alignment"
          options={reference.alignments}
        />
        <SheetText control={control} name="identity.size" label="Size" />
        <SheetNumber
          control={control}
          name="identity.level"
          label="Level"
          min={1}
          max={20}
        />
        <SheetNumber control={control} name="identity.xp" label="XP" min={0} />
      </div>
      <p className="text-xs text-ink-subtle">
        Not on the list? Type your own — the character is flagged as homebrew
        and you can describe it below.
      </p>
    </Section>
  );
}

export function CombatSection({ control }: { control: C }) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const safe: CharacterSheet | undefined = sheet?.abilities ? sheet : undefined;

  return (
    <Section title="Combat">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Derived
          label="Prof. Bonus"
          value={fmtBonus(proficiencyBonus(sheet?.identity?.level ?? 1))}
        />
        <Derived
          label="Initiative"
          value={safe ? fmtBonus(initiative(safe)) : '+0'}
        />
        <Derived
          label="Passive Perc."
          value={safe ? passivePerception(safe) : 10}
        />
        <SheetNumber
          control={control}
          name="combat.armorClass"
          label="Armor Class"
          min={0}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SheetNumber
          control={control}
          name="combat.speed"
          label="Speed"
          min={0}
        />
        <SheetNumber
          control={control}
          name="combat.hitPointsMax"
          label="Max HP"
          min={0}
        />
        <SheetNumber
          control={control}
          name="combat.hitPointsCurrent"
          label="Current HP"
        />
        <SheetNumber
          control={control}
          name="combat.hitPointsTemp"
          label="Temp HP"
          min={0}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SheetNumber
          control={control}
          name="combat.hitDiceMax"
          label="Hit Dice"
          min={0}
        />
        <SheetNumber
          control={control}
          name="combat.hitDiceSpent"
          label="Hit Dice Spent"
          min={0}
        />
        <SheetNumber
          control={control}
          name="combat.hitDieSize"
          label="Hit Die (d?)"
          min={4}
          max={12}
        />
        <div />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SheetNumber
          control={control}
          name="combat.deathSaveSuccesses"
          label="Death Save Successes"
          min={0}
          max={3}
        />
        <SheetNumber
          control={control}
          name="combat.deathSaveFailures"
          label="Death Save Failures"
          min={0}
          max={3}
        />
      </div>
    </Section>
  );
}

export function SkillsSection({ control }: { control: C }) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const level = sheet?.identity?.level ?? 1;
  const pb = proficiencyBonus(level);

  return (
    <Section title="Skills">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SKILL_KEYS.map(skill => {
          const ability = SKILL_ABILITY[skill];
          const mod = abilityModifier(sheet?.abilities?.[ability]?.score ?? 10);
          const proficient = sheet?.skills?.[skill] ?? false;
          const bonus = proficient ? mod + pb : mod;
          return (
            <div
              key={skill}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2"
            >
              <SheetCheckbox
                control={control}
                name={`skills.${skill}`}
                label={`${SKILL_LABELS[skill]} (${ability.slice(0, 3).toUpperCase()})`}
              />
              <span className="text-sm font-semibold text-ink">
                {fmtBonus(bonus)}
              </span>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const SPELL_LEVELS: SpellSlotLevel[] = [
  'level1',
  'level2',
  'level3',
  'level4',
  'level5',
  'level6',
  'level7',
  'level8',
  'level9',
];

export function SpellcastingSection({ control }: { control: C }) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const safe = sheet?.abilities ? sheet : undefined;
  const dc = safe ? spellSaveDC(safe) : null;
  const atk = safe ? spellAttackBonus(safe) : null;

  return (
    <Section title="Spellcasting" arcane>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SheetSelect
          control={control}
          name="spellcasting.ability"
          label="Spellcasting Ability"
          placeholder="None"
          allowEmpty
          options={[
            { value: '', label: 'None' },
            ...ABILITY_KEYS.map(k => ({
              value: k,
              label: ABILITY_LABELS[k],
            })),
          ]}
        />
        <Derived label="Spell Save DC" value={dc ?? '—'} />
        <Derived
          label="Spell Attack"
          value={atk === null ? '—' : fmtBonus(atk)}
        />
      </div>
      <div className="space-y-2">
        {SPELL_LEVELS.map((lvl, i) => (
          <div key={lvl} className="grid grid-cols-3 items-center gap-3">
            <span className="text-sm text-ink-muted">Level {i + 1}</span>
            <SheetNumber
              control={control}
              name={`spellcasting.slots.${lvl}.total`}
              label="Slots"
              min={0}
              max={9}
            />
            <SheetNumber
              control={control}
              name={`spellcasting.slots.${lvl}.expended`}
              label="Used"
              min={0}
              max={9}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ProficienciesSection({ control }: { control: C }) {
  return (
    <Section title="Proficiencies & Languages">
      <SheetTextarea
        control={control}
        name="proficiencies.armor"
        label="Armor Training"
        minRows={2}
      />
      <SheetTextarea
        control={control}
        name="proficiencies.weapons"
        label="Weapons"
        minRows={2}
      />
      <SheetTextarea
        control={control}
        name="proficiencies.tools"
        label="Tools"
        minRows={2}
      />
      <SheetTextarea
        control={control}
        name="proficiencies.languages"
        label="Languages"
        minRows={2}
      />
    </Section>
  );
}

export function DetailsSection({ control }: { control: C }) {
  return (
    <Section title="Character Details">
      <SheetTextarea
        control={control}
        name="details.appearance"
        label="Appearance"
      />
      <SheetTextarea
        control={control}
        name="details.personality"
        label="Personality"
      />
      <SheetTextarea
        control={control}
        name="details.backstory"
        label="Backstory"
        minRows={5}
      />
      <SheetTextarea
        control={control}
        name="details.classFeatures"
        label="Class Features"
      />
      <SheetTextarea
        control={control}
        name="details.speciesTraits"
        label="Species Traits"
      />
      <SheetTextarea control={control} name="details.feats" label="Feats" />
    </Section>
  );
}

export function EquipmentSection({ control }: { control: C }) {
  return (
    <Section title="Equipment">
      <SheetTextarea
        control={control}
        name="equipment.items"
        label="Equipment & Items"
        minRows={5}
      />
      <SheetTextarea
        control={control}
        name="equipment.magicItems"
        label="Magic Items"
      />
      <SheetNumber
        control={control}
        name="equipment.attunedCount"
        label="Attuned Items"
        min={0}
        max={3}
      />
    </Section>
  );
}

export function CurrencySection({ control }: { control: C }) {
  return (
    <Section title="Currency">
      <div className="grid grid-cols-5 gap-3">
        <SheetNumber control={control} name="currency.cp" label="CP" min={0} />
        <SheetNumber control={control} name="currency.sp" label="SP" min={0} />
        <SheetNumber control={control} name="currency.ep" label="EP" min={0} />
        <SheetNumber control={control} name="currency.gp" label="GP" min={0} />
        <SheetNumber control={control} name="currency.pp" label="PP" min={0} />
      </div>
    </Section>
  );
}
