import { SectionCard, Stat, StatBlock } from '@/@shared/components/ui';
import {
  abilityModifier,
  fmtBonus,
  initiative,
  passivePerception,
  proficiencyBonus,
  savingThrow,
  skillBonus,
  spellAttackBonus,
  spellSaveDC,
} from '../lib/derive';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_ABILITY,
  SKILL_KEYS,
  SKILL_LABELS,
  type CharacterSheet,
  type SpellSlotLevel,
} from '../schema';

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[0.7rem] font-medium uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </div>
      <div className="text-ink">{value || '—'}</div>
    </div>
  );
}

function Prose({ label, value }: { label: string; value: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <div className="mb-1 text-[0.7rem] font-medium uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink-muted">{value}</p>
    </div>
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

export function CharacterSheetView({ sheet }: { sheet: CharacterSheet }) {
  const pb = proficiencyBonus(sheet.identity.level);
  const dc = spellSaveDC(sheet);
  const atk = spellAttackBonus(sheet);

  return (
    <div className="space-y-5">
      <SectionCard framed title="Identity">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Name" value={sheet.identity.name} />
          <Field label="Class" value={sheet.identity.class} />
          <Field label="Subclass" value={sheet.identity.subclass} />
          <Field label="Species" value={sheet.identity.species} />
          <Field label="Background" value={sheet.identity.background} />
          <Field label="Alignment" value={sheet.identity.alignment} />
          <Field label="Level" value={sheet.identity.level} />
          <Field label="XP" value={sheet.identity.xp} />
          <Field label="Size" value={sheet.identity.size} />
        </div>
      </SectionCard>

      <SectionCard framed title="Combat">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Prof. bonus" value={fmtBonus(pb)} />
          <Stat label="Initiative" value={fmtBonus(initiative(sheet))} />
          <Stat label="Passive perc." value={passivePerception(sheet)} />
          <Stat label="Armor class" value={sheet.combat.armorClass} />
          <Stat label="Speed" value={sheet.combat.speed} />
          <Stat
            label="Hit points"
            value={`${sheet.combat.hitPointsCurrent}/${sheet.combat.hitPointsMax}`}
          />
          <Stat label="Temp HP" value={sheet.combat.hitPointsTemp} />
          <Stat
            label="Hit dice"
            value={`${sheet.combat.hitDiceMax - sheet.combat.hitDiceSpent}/${sheet.combat.hitDiceMax} d${sheet.combat.hitDieSize}`}
          />
        </div>
      </SectionCard>

      <SectionCard framed title="Ability scores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ABILITY_KEYS.map(a => {
            const score = sheet.abilities[a].score;
            return (
              <StatBlock key={a} label={a.slice(0, 3)}>
                <div className="text-center">
                  <div className="font-display text-2xl tabular-nums text-ink">
                    {score}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-muted">
                    mod {fmtBonus(abilityModifier(score))} · save{' '}
                    {fmtBonus(savingThrow(sheet, a))}
                  </div>
                </div>
              </StatBlock>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard framed title="Skills">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SKILL_KEYS.map(s => (
            <div
              key={s}
              className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-sm"
            >
              <span className="text-ink">
                {SKILL_LABELS[s]}
                <span className="ml-1 text-ink-subtle">
                  ({SKILL_ABILITY[s].slice(0, 3).toUpperCase()})
                </span>
                {sheet.skills[s] && <span className="ml-1 text-gold">●</span>}
              </span>
              <span className="tabular-nums text-ink-muted">
                {fmtBonus(skillBonus(sheet, s))}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {sheet.spellcasting.ability && (
        <SectionCard
          framed
          title="Spellcasting"
          bodyClassName="border-t-2 border-t-arcane/50"
        >
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat
              label="Ability"
              value={ABILITY_LABELS[sheet.spellcasting.ability]}
            />
            <Stat label="Save DC" value={dc ?? '—'} />
            <Stat label="Attack" value={atk === null ? '—' : fmtBonus(atk)} />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-9">
            {SPELL_LEVELS.map((lvl, i) => {
              const slot = sheet.spellcasting.slots[lvl];
              return (
                <Stat
                  key={lvl}
                  plain
                  label={`Lv ${i + 1}`}
                  value={`${slot.total - slot.expended}/${slot.total}`}
                />
              );
            })}
          </div>
        </SectionCard>
      )}

      <SectionCard framed title="Proficiencies & languages">
        <div className="space-y-3">
          <Prose label="Armor" value={sheet.proficiencies.armor} />
          <Prose label="Weapons" value={sheet.proficiencies.weapons} />
          <Prose label="Tools" value={sheet.proficiencies.tools} />
          <Prose label="Languages" value={sheet.proficiencies.languages} />
        </div>
      </SectionCard>

      <SectionCard framed title="Details">
        <div className="space-y-3">
          <Prose label="Appearance" value={sheet.details.appearance} />
          <Prose label="Personality" value={sheet.details.personality} />
          <Prose label="Backstory" value={sheet.details.backstory} />
          <Prose label="Class features" value={sheet.details.classFeatures} />
          <Prose label="Species traits" value={sheet.details.speciesTraits} />
          <Prose label="Feats" value={sheet.details.feats} />
        </div>
      </SectionCard>

      <SectionCard framed title="Equipment & currency">
        <div className="space-y-3">
          <Prose label="Equipment" value={sheet.equipment.items} />
          <Prose label="Magic items" value={sheet.equipment.magicItems} />
          <div className="grid grid-cols-5 gap-2">
            {(['cp', 'sp', 'ep', 'gp', 'pp'] as const).map(c => (
              <Stat
                key={c}
                plain
                label={c.toUpperCase()}
                value={sheet.currency[c]}
              />
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
