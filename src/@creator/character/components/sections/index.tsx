'use client';

import { Card, CardBody, CardHeader } from '@heroui/react';
import { Control, useWatch } from 'react-hook-form';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type CharacterSheet,
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
  SheetNumber,
  SheetSelect,
  SheetText,
  SheetTextarea,
} from '../fields';

export interface SelectOption {
  value: string;
  label: string;
}

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
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600/30">
      <CardHeader>
        <h3 className="text-xl font-bold text-amber-300">{title}</h3>
      </CardHeader>
      <CardBody className="space-y-4">{children}</CardBody>
    </Card>
  );
}

function Derived({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-amber-600/30 bg-slate-700/30 px-3 py-2 text-center">
      <div className="text-xs uppercase tracking-wide text-amber-200/80">
        {label}
      </div>
      <div className="text-lg font-semibold text-amber-100">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function IdentitySection({
  control,
  reference,
}: {
  control: C;
  reference: ReferenceOptions;
}) {
  return (
    <Section title="Identity">
      <SheetText
        control={control}
        name="identity.name"
        label="Character Name"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SheetSelect
          control={control}
          name="identity.class"
          label="Class"
          placeholder="Choose a class"
          allowEmpty
          options={reference.classes}
        />
        <SheetText
          control={control}
          name="identity.subclass"
          label="Subclass"
        />
        <SheetSelect
          control={control}
          name="identity.species"
          label="Species"
          placeholder="Choose a species"
          allowEmpty
          options={reference.species}
        />
        <SheetSelect
          control={control}
          name="identity.background"
          label="Background"
          placeholder="Choose a background"
          allowEmpty
          options={reference.backgrounds}
        />
        <SheetSelect
          control={control}
          name="identity.alignment"
          label="Alignment"
          placeholder="Choose an alignment"
          allowEmpty
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
    </Section>
  );
}

export function AbilityScoresSection({ control }: { control: C }) {
  const sheet = useWatch({ control }) as CharacterSheet;
  const level = sheet?.identity?.level ?? 1;
  const pb = proficiencyBonus(level);

  return (
    <Section title="Ability Scores">
      <div className="space-y-4">
        {ABILITY_KEYS.map(ability => {
          const score = sheet?.abilities?.[ability]?.score ?? 10;
          const mod = abilityModifier(score);
          const proficient =
            sheet?.abilities?.[ability]?.proficientSave ?? false;
          const save = proficient ? mod + pb : mod;
          return (
            <div
              key={ability}
              className="rounded-lg border border-amber-600/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-lg font-semibold text-amber-100">
                  {ABILITY_LABELS[ability]}
                </h4>
                <SheetCheckbox
                  control={control}
                  name={`abilities.${ability}.proficientSave`}
                  label="Save proficiency"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <SheetNumber
                  control={control}
                  name={`abilities.${ability}.score`}
                  label="Score"
                  min={1}
                  max={30}
                />
                <Derived label="Modifier" value={fmtBonus(mod)} />
                <Derived label="Save" value={fmtBonus(save)} />
              </div>
            </div>
          );
        })}
      </div>
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
              className="flex items-center justify-between rounded-md border border-amber-600/20 px-3 py-2"
            >
              <SheetCheckbox
                control={control}
                name={`skills.${skill}`}
                label={`${SKILL_LABELS[skill]} (${ability.slice(0, 3).toUpperCase()})`}
              />
              <span className="text-sm font-semibold text-amber-100">
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
    <Section title="Spellcasting">
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
            <span className="text-sm text-amber-200">Level {i + 1}</span>
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
