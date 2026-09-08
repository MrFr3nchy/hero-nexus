'use client';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_KEYS,
  SKILL_LABELS,
  type AbilityKey,
  type SkillKey,
} from '@/@creator/character/schema';
import {
  standardSpellSlots,
  type BackgroundData,
  type ClassData,
  type ContentType,
  type CreatureData,
  type FeatData,
  type ItemData,
  type SpeciesData,
  type SpellData,
  type SubclassData,
} from '@/@shared/content';

import {
  BoolField,
  FieldGroup,
  LevelsField,
  LongTextField,
  NumberField,
  PickMany,
  PickOne,
  Repeater,
  Row,
  TextField,
  type Option,
} from './primitives';

/**
 * The stat form for one content type.
 *
 * Every field here exists because the SRD equivalent has it — a homebrew spell
 * is asked for level, school, components and damage because that is what a
 * spell *is*, and a stat block cannot render what the form never collected.
 * The field names match `@/@shared/content/schemas` exactly, so this file is a
 * view over that contract and nothing more.
 */

const abilityOptions: Option[] = ABILITY_KEYS.map(k => ({
  value: k,
  label: ABILITY_LABELS[k],
}));

const skillOptions: Option[] = SKILL_KEYS.map(k => ({
  value: k,
  label: SKILL_LABELS[k],
}));

const opts = (values: readonly string[]): Option[] =>
  values.map(v => ({
    value: v,
    label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '),
  }));

const DAMAGE_OPTIONS = opts([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

const SCHOOL_OPTIONS = opts([
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
]);

type Patch<T> = (next: T) => void;

/* ------------------------------------------------------------------ *
 * Class & subclass
 * ------------------------------------------------------------------ */

const blankFeature = () => ({
  key: '',
  name: '',
  desc: '',
  levels: [] as number[],
  detailByLevel: {} as Record<string, string>,
});

function FeatureRepeater({
  features,
  onChange,
}: {
  features: ClassData['features'];
  onChange: (next: ClassData['features']) => void;
}) {
  return (
    <Repeater
      label="Features"
      hint="What the class gains, and the levels it gains them at."
      items={features}
      blank={blankFeature}
      onChange={onChange}
      addLabel="Add feature"
      render={(f, patch) => (
        <>
          <Row>
            <TextField
              label="Name"
              value={f.name}
              onChange={v => patch({ name: v })}
            />
            <LevelsField
              label="Levels"
              values={f.levels}
              onChange={v => patch({ levels: v })}
              description="Comma separated, e.g. 3, 7, 10"
            />
          </Row>
          <LongTextField
            label="What it does"
            value={f.desc}
            onChange={v => patch({ desc: v })}
          />
        </>
      )}
    />
  );
}

const blankEquipment = () => ({ label: '', desc: '', gp: 0 });

function EquipmentRepeater({
  equipment,
  onChange,
}: {
  equipment: ClassData['coreTraits']['equipment'];
  onChange: (next: ClassData['coreTraits']['equipment']) => void;
}) {
  return (
    <Repeater
      label="Starting equipment"
      hint="One lettered package per option — the player picks one."
      items={equipment}
      blank={blankEquipment}
      onChange={onChange}
      addLabel="Add package"
      render={(e, patch) => (
        <>
          <Row>
            <TextField
              label="Label"
              value={e.label}
              onChange={v => patch({ label: v })}
              placeholder="A"
            />
            <NumberField
              label="Gold"
              value={e.gp}
              onChange={v => patch({ gp: v })}
              max={100000}
            />
          </Row>
          <LongTextField
            label="Contents"
            value={e.desc}
            onChange={v => patch({ desc: v })}
            minRows={2}
          />
        </>
      )}
    />
  );
}

function ClassForm({
  d,
  onChange,
}: {
  d: ClassData;
  onChange: Patch<ClassData>;
}) {
  const t = d.coreTraits;
  const setTraits = (next: Partial<ClassData['coreTraits']>) =>
    onChange({ ...d, coreTraits: { ...t, ...next } });

  return (
    <div className="space-y-5">
      <FieldGroup title="Core">
        <Row>
          <PickOne
            label="Hit die"
            value={`d${d.hitDie}`}
            options={[6, 8, 10, 12].map(n => ({
              value: `d${n}`,
              label: `d${n}`,
            }))}
            onChange={v => onChange({ ...d, hitDie: Number(v?.slice(1) ?? 8) })}
          />
          <PickOne
            label="Spellcasting"
            value={d.casterType}
            options={[
              { value: 'NONE', label: 'None' },
              { value: 'FULL', label: 'Full caster' },
              { value: 'HALF', label: 'Half caster' },
              { value: 'THIRD', label: 'Third caster' },
              { value: 'PACT', label: 'Pact magic' },
            ]}
            onChange={v => {
              const casterType = (v ?? 'NONE') as ClassData['casterType'];
              // The slot table follows from the caster type; filling it here
              // saves the author a 20x9 grid they would otherwise hand-enter.
              onChange({
                ...d,
                casterType,
                spellSlots: standardSpellSlots(casterType),
              });
            }}
          />
          <NumberField
            label="Subclass at level"
            value={d.subclassLevel}
            onChange={v => onChange({ ...d, subclassLevel: v })}
            min={1}
            max={20}
          />
          <LevelsField
            label="Ability score improvements"
            values={d.asiLevels}
            onChange={v => onChange({ ...d, asiLevels: v })}
            description="Levels granting an ASI"
          />
        </Row>
        <TextField
          label="Blurb"
          value={d.blurb}
          onChange={v => onChange({ ...d, blurb: v })}
          description="One line for the picker card."
        />
      </FieldGroup>

      <FieldGroup title="Proficiencies">
        <Row>
          <PickMany
            label="Primary abilities"
            values={t.primaryAbilities}
            options={abilityOptions}
            onChange={v => setTraits({ primaryAbilities: v as AbilityKey[] })}
          />
          <PickMany
            label="Saving throws"
            values={t.savingThrows}
            options={abilityOptions}
            onChange={v => setTraits({ savingThrows: v as AbilityKey[] })}
          />
          <TextField
            label="Armour"
            value={t.armor}
            onChange={v => setTraits({ armor: v })}
          />
          <TextField
            label="Weapons"
            value={t.weapons}
            onChange={v => setTraits({ weapons: v })}
          />
          <TextField
            label="Tools"
            value={t.tools}
            onChange={v => setTraits({ tools: v })}
          />
          <NumberField
            label="Skill picks"
            value={t.skillChoice?.count ?? 0}
            onChange={v =>
              setTraits({
                skillChoice:
                  v > 0
                    ? { count: v, options: t.skillChoice?.options ?? [] }
                    : null,
              })
            }
            max={18}
          />
        </Row>
        {t.skillChoice && (
          <PickMany
            label="Chosen from"
            values={t.skillChoice.options}
            options={skillOptions}
            description="Leave empty to allow any skill."
            onChange={v =>
              setTraits({
                skillChoice: {
                  count: t.skillChoice?.count ?? 0,
                  options: v as SkillKey[],
                },
              })
            }
          />
        )}
      </FieldGroup>

      <EquipmentRepeater
        equipment={t.equipment}
        onChange={v => setTraits({ equipment: v })}
      />
      <FeatureRepeater
        features={d.features}
        onChange={v => onChange({ ...d, features: v })}
      />
    </div>
  );
}

function SubclassForm({
  d,
  onChange,
}: {
  d: SubclassData;
  onChange: Patch<SubclassData>;
}) {
  return (
    <div className="space-y-5">
      <FieldGroup title="Core">
        <Row>
          <TextField
            label="Parent class"
            value={d.parentClass}
            onChange={v => onChange({ ...d, parentClass: v })}
            description="The class this hangs off."
          />
          <TextField
            label="Blurb"
            value={d.blurb}
            onChange={v => onChange({ ...d, blurb: v })}
          />
        </Row>
      </FieldGroup>
      <FeatureRepeater
        features={d.features}
        onChange={v => onChange({ ...d, features: v })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Species
 * ------------------------------------------------------------------ */

const blankTrait = () => ({ name: '', desc: '', options: [] });

function SpeciesForm({
  d,
  onChange,
}: {
  d: SpeciesData;
  onChange: Patch<SpeciesData>;
}) {
  return (
    <div className="space-y-5">
      <FieldGroup title="Core">
        <Row>
          <PickMany
            label="Sizes"
            values={d.sizes}
            options={opts(['Small', 'Medium', 'Large'])}
            description="More than one means the player picks."
            onChange={v => onChange({ ...d, sizes: v })}
          />
          <NumberField
            label="Speed (ft)"
            value={d.speed}
            onChange={v => onChange({ ...d, speed: v })}
            max={200}
          />
        </Row>
        <TextField
          label="Blurb"
          value={d.blurb}
          onChange={v => onChange({ ...d, blurb: v })}
        />
        <BoolField
          label="Grants a skill proficiency of the player's choice"
          value={d.grantsSkillChoice}
          onChange={v => onChange({ ...d, grantsSkillChoice: v })}
        />
      </FieldGroup>

      <Repeater
        label="Traits"
        hint="What the species can do that others cannot."
        items={d.traits}
        blank={blankTrait}
        onChange={v => onChange({ ...d, traits: v })}
        addLabel="Add trait"
        render={(t, patch) => (
          <>
            <TextField
              label="Name"
              value={t.name}
              onChange={v => patch({ name: v })}
            />
            <LongTextField
              label="What it does"
              value={t.desc}
              onChange={v => patch({ desc: v })}
            />
          </>
        )}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Background & feat
 * ------------------------------------------------------------------ */

function BackgroundForm({
  d,
  onChange,
}: {
  d: BackgroundData;
  onChange: Patch<BackgroundData>;
}) {
  return (
    <div className="space-y-5">
      <FieldGroup title="Grants">
        <Row>
          <PickMany
            label="Ability increases from"
            values={d.abilityOptions}
            options={abilityOptions}
            description="The three the +2/+1 may be spread across."
            onChange={v =>
              onChange({ ...d, abilityOptions: v as AbilityKey[] })
            }
          />
          <PickMany
            label="Skill proficiencies"
            values={d.skills}
            options={skillOptions}
            onChange={v => onChange({ ...d, skills: v as SkillKey[] })}
          />
          <TextField
            label="Tool proficiency"
            value={d.tool}
            onChange={v => onChange({ ...d, tool: v })}
          />
          <TextField
            label="Origin feat"
            value={d.feat}
            onChange={v => onChange({ ...d, feat: v })}
          />
        </Row>
      </FieldGroup>
      <EquipmentRepeater
        equipment={d.equipment}
        onChange={v => onChange({ ...d, equipment: v })}
      />
    </div>
  );
}

function FeatForm({ d, onChange }: { d: FeatData; onChange: Patch<FeatData> }) {
  return (
    <div className="space-y-5">
      <FieldGroup title="Core">
        <Row>
          <PickOne
            label="Category"
            value={d.category || null}
            allowEmpty
            options={opts(['Origin', 'General', 'Fighting Style', 'Epic Boon'])}
            onChange={v => onChange({ ...d, category: v ?? '' })}
          />
          <TextField
            label="Prerequisite"
            value={d.prerequisite}
            onChange={v => onChange({ ...d, prerequisite: v })}
            placeholder="Level 4+, Strength 13+"
          />
        </Row>
      </FieldGroup>
      <Repeater
        label="Benefits"
        hint="One entry per bullet the feat grants."
        items={d.benefits}
        blank={() => ''}
        onChange={v => onChange({ ...d, benefits: v })}
        addLabel="Add benefit"
        render={(b, _patch, i) => (
          <LongTextField
            label={`Benefit ${i + 1}`}
            value={b}
            minRows={2}
            onChange={v =>
              onChange({
                ...d,
                benefits: d.benefits.map((x, xi) => (xi === i ? v : x)),
              })
            }
          />
        )}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Spell
 * ------------------------------------------------------------------ */

function SpellForm({
  d,
  onChange,
}: {
  d: SpellData;
  onChange: Patch<SpellData>;
}) {
  return (
    <div className="space-y-5">
      <FieldGroup title="Core">
        <Row>
          <PickOne
            label="Level"
            value={String(d.level)}
            options={[
              { value: '0', label: 'Cantrip' },
              ...Array.from({ length: 9 }, (_, i) => ({
                value: String(i + 1),
                label: `Level ${i + 1}`,
              })),
            ]}
            onChange={v => onChange({ ...d, level: Number(v ?? 0) })}
          />
          <PickOne
            label="School"
            value={d.school}
            allowEmpty
            options={SCHOOL_OPTIONS}
            onChange={v => onChange({ ...d, school: v as SpellData['school'] })}
          />
          <TextField
            label="Casting time"
            value={d.casting_time}
            onChange={v => onChange({ ...d, casting_time: v })}
            placeholder="action"
          />
          <TextField
            label="Range"
            value={d.range_text}
            onChange={v => onChange({ ...d, range_text: v })}
            placeholder="150 feet"
          />
          <TextField
            label="Duration"
            value={d.duration}
            onChange={v => onChange({ ...d, duration: v })}
            placeholder="instantaneous"
          />
          <TextField
            label="Target"
            value={d.target_type}
            onChange={v => onChange({ ...d, target_type: v })}
            placeholder="creature"
          />
        </Row>
        {d.casting_time.toLowerCase().includes('reaction') && (
          <TextField
            label="Reaction condition"
            value={d.reaction_condition}
            onChange={v => onChange({ ...d, reaction_condition: v })}
            description="What triggers it."
          />
        )}
        <div className="flex flex-wrap gap-4">
          <BoolField
            label="Concentration"
            value={d.concentration}
            onChange={v => onChange({ ...d, concentration: v })}
          />
          <BoolField
            label="Ritual"
            value={d.ritual}
            onChange={v => onChange({ ...d, ritual: v })}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Components">
        <div className="flex flex-wrap gap-4">
          <BoolField
            label="Verbal"
            value={d.verbal}
            onChange={v => onChange({ ...d, verbal: v })}
          />
          <BoolField
            label="Somatic"
            value={d.somatic}
            onChange={v => onChange({ ...d, somatic: v })}
          />
          <BoolField
            label="Material"
            value={d.material}
            onChange={v => onChange({ ...d, material: v })}
          />
        </div>
        {d.material && (
          <Row>
            <TextField
              label="Material component"
              value={d.material_specified}
              onChange={v => onChange({ ...d, material_specified: v })}
            />
            <BoolField
              label="Consumed by the spell"
              value={d.material_consumed}
              onChange={v => onChange({ ...d, material_consumed: v })}
            />
          </Row>
        )}
      </FieldGroup>

      <FieldGroup title="Effect">
        <Row>
          <TextField
            label="Damage or healing dice"
            value={d.damage_roll}
            onChange={v => onChange({ ...d, damage_roll: v })}
            placeholder="8d6"
          />
          <PickMany
            label="Damage types"
            values={d.damage_types}
            options={DAMAGE_OPTIONS}
            onChange={v =>
              onChange({ ...d, damage_types: v as SpellData['damage_types'] })
            }
          />
          <PickOne
            label="Saving throw"
            value={d.saving_throw_ability}
            allowEmpty
            emptyLabel="None"
            options={abilityOptions}
            onChange={v =>
              onChange({ ...d, saving_throw_ability: v as AbilityKey | null })
            }
          />
        </Row>
        <BoolField
          label="Requires a spell attack roll"
          value={d.attack_roll}
          onChange={v => onChange({ ...d, attack_roll: v })}
        />
        <LongTextField
          label="At higher levels"
          value={d.higher_level}
          onChange={v => onChange({ ...d, higher_level: v })}
          placeholder="The damage increases by 1d6 for each spell slot level above 3."
          minRows={2}
        />
      </FieldGroup>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Item
 * ------------------------------------------------------------------ */

function ItemForm({ d, onChange }: { d: ItemData; onChange: Patch<ItemData> }) {
  return (
    <div className="space-y-5">
      <FieldGroup title="Core">
        <Row>
          <PickOne
            label="Kind"
            value={d.kind}
            options={opts([
              'wondrous',
              'weapon',
              'armor',
              'gear',
              'consumable',
            ])}
            onChange={v => {
              const kind = (v ?? 'wondrous') as ItemData['kind'];
              // Sub-stats appear and vanish with the kind, so an item switched
              // away from weapon does not keep a damage die nothing shows.
              onChange({
                ...d,
                kind,
                weapon:
                  kind === 'weapon'
                    ? (d.weapon ?? {
                        damage_dice: '',
                        damage_type: null,
                        range: 0,
                        long_range: 0,
                        is_simple: false,
                        properties: [],
                      })
                    : null,
                armor:
                  kind === 'armor'
                    ? (d.armor ?? {
                        category: 'light',
                        ac_base: 10,
                        ac_add_dexmod: true,
                        ac_cap_dexmod: null,
                        strength_score_required: 0,
                        grants_stealth_disadvantage: false,
                      })
                    : null,
              });
            }}
          />
          <PickOne
            label="Rarity"
            value={d.rarity}
            options={opts([
              'common',
              'uncommon',
              'rare',
              'very-rare',
              'legendary',
              'artifact',
            ])}
            onChange={v =>
              onChange({ ...d, rarity: (v ?? 'common') as ItemData['rarity'] })
            }
          />
          <NumberField
            label="Weight (lb)"
            value={d.weight}
            onChange={v => onChange({ ...d, weight: v })}
            max={10000}
          />
          <NumberField
            label="Cost (gp)"
            value={d.cost}
            onChange={v => onChange({ ...d, cost: v })}
            max={1000000}
          />
          <NumberField
            label="Charges"
            value={d.charges}
            onChange={v => onChange({ ...d, charges: v })}
            max={100}
            description="0 for an item without charges."
          />
        </Row>
        <BoolField
          label="Requires attunement"
          value={d.requires_attunement}
          onChange={v => onChange({ ...d, requires_attunement: v })}
        />
        {d.requires_attunement && (
          <TextField
            label="Attunement condition"
            value={d.attunement_detail}
            onChange={v => onChange({ ...d, attunement_detail: v })}
            placeholder="by a spellcaster"
          />
        )}
      </FieldGroup>

      {d.weapon && (
        <FieldGroup title="Weapon">
          <Row>
            <TextField
              label="Damage dice"
              value={d.weapon.damage_dice}
              onChange={v =>
                onChange({ ...d, weapon: { ...d.weapon!, damage_dice: v } })
              }
              placeholder="1d8"
            />
            <PickOne
              label="Damage type"
              value={d.weapon.damage_type}
              allowEmpty
              options={DAMAGE_OPTIONS}
              onChange={v =>
                onChange({
                  ...d,
                  weapon: {
                    ...d.weapon!,
                    damage_type: v as NonNullable<
                      ItemData['weapon']
                    >['damage_type'],
                  },
                })
              }
            />
            <NumberField
              label="Range (ft)"
              value={d.weapon.range}
              max={2000}
              description="0 for melee."
              onChange={v =>
                onChange({ ...d, weapon: { ...d.weapon!, range: v } })
              }
            />
            <NumberField
              label="Long range (ft)"
              value={d.weapon.long_range}
              max={2000}
              onChange={v =>
                onChange({ ...d, weapon: { ...d.weapon!, long_range: v } })
              }
            />
          </Row>
          <BoolField
            label="Simple weapon (not martial)"
            value={d.weapon.is_simple}
            onChange={v =>
              onChange({ ...d, weapon: { ...d.weapon!, is_simple: v } })
            }
          />
          <PickMany
            label="Properties"
            values={d.weapon.properties}
            options={opts([
              'Ammunition',
              'Finesse',
              'Heavy',
              'Light',
              'Loading',
              'Reach',
              'Thrown',
              'Two-Handed',
              'Versatile',
            ])}
            onChange={v =>
              onChange({ ...d, weapon: { ...d.weapon!, properties: v } })
            }
          />
        </FieldGroup>
      )}

      {d.armor && (
        <FieldGroup title="Armour">
          <Row>
            <PickOne
              label="Category"
              value={d.armor.category}
              options={opts(['light', 'medium', 'heavy', 'shield'])}
              onChange={v =>
                onChange({
                  ...d,
                  armor: {
                    ...d.armor!,
                    category: (v ?? 'light') as NonNullable<
                      ItemData['armor']
                    >['category'],
                  },
                })
              }
            />
            <NumberField
              label="Base AC"
              value={d.armor.ac_base}
              max={30}
              onChange={v =>
                onChange({ ...d, armor: { ...d.armor!, ac_base: v } })
              }
            />
            <NumberField
              label="Strength required"
              value={d.armor.strength_score_required}
              max={20}
              description="0 for none."
              onChange={v =>
                onChange({
                  ...d,
                  armor: { ...d.armor!, strength_score_required: v },
                })
              }
            />
            <NumberField
              label="Dex bonus cap"
              value={d.armor.ac_cap_dexmod ?? 0}
              max={10}
              description="0 for uncapped."
              onChange={v =>
                onChange({
                  ...d,
                  armor: { ...d.armor!, ac_cap_dexmod: v > 0 ? v : null },
                })
              }
            />
          </Row>
          <div className="flex flex-wrap gap-4">
            <BoolField
              label="Adds Dexterity modifier"
              value={d.armor.ac_add_dexmod}
              onChange={v =>
                onChange({ ...d, armor: { ...d.armor!, ac_add_dexmod: v } })
              }
            />
            <BoolField
              label="Disadvantage on Stealth"
              value={d.armor.grants_stealth_disadvantage}
              onChange={v =>
                onChange({
                  ...d,
                  armor: { ...d.armor!, grants_stealth_disadvantage: v },
                })
              }
            />
          </div>
        </FieldGroup>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Creature
 * ------------------------------------------------------------------ */

const CREATURE_SIZE_OPTIONS = opts([
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gargantuan',
]);

const blankPassage = () => ({ name: '', desc: '' });

/**
 * Traits, actions, bonus actions, reactions, legendary actions — the same two
 * fields four times over, because on a stat block they are the same thing
 * printed under different headings.
 */
function PassageRepeater({
  label,
  hint,
  addLabel,
  rows,
  onChange,
}: {
  label: string;
  hint?: string;
  addLabel: string;
  rows: CreatureData['actions'];
  onChange: (next: CreatureData['actions']) => void;
}) {
  return (
    <Repeater
      label={label}
      hint={hint}
      items={rows}
      blank={blankPassage}
      onChange={onChange}
      addLabel={addLabel}
      render={(row, patch) => (
        <>
          <TextField
            label="Name"
            value={row.name}
            onChange={v => patch({ name: v })}
          />
          <LongTextField
            label="What it does"
            value={row.desc}
            onChange={v => patch({ desc: v })}
          />
        </>
      )}
    />
  );
}

function CreatureForm({
  d,
  onChange,
}: {
  d: CreatureData;
  onChange: Patch<CreatureData>;
}) {
  const set = (next: Partial<CreatureData>) => onChange({ ...d, ...next });

  return (
    <>
      <FieldGroup title="What it is">
        <Row>
          <PickOne
            label="Size"
            value={d.size}
            options={CREATURE_SIZE_OPTIONS}
            onChange={v => set({ size: v as CreatureData['size'] })}
          />
          <TextField
            label="Type"
            value={d.creature_type}
            onChange={v => set({ creature_type: v })}
            description="Dragon, undead, humanoid…"
          />
        </Row>
        <TextField
          label="Alignment"
          value={d.alignment}
          onChange={v => set({ alignment: v })}
        />
      </FieldGroup>

      <FieldGroup title="What it takes to kill">
        <Row>
          <NumberField
            label="Armour class"
            value={d.armor_class}
            onChange={v => set({ armor_class: v })}
          />
          <TextField
            label="Armour from"
            value={d.armor_detail}
            onChange={v => set({ armor_detail: v })}
            description="Natural armour, plate, shield…"
          />
        </Row>
        <Row>
          <NumberField
            label="Hit points"
            value={d.hit_points}
            onChange={v => set({ hit_points: v })}
            max={2000}
          />
          <TextField
            label="Hit dice"
            value={d.hit_dice}
            onChange={v => set({ hit_dice: v })}
            description="e.g. 8d10 + 16"
          />
        </Row>
      </FieldGroup>

      <FieldGroup
        title="How dangerous"
        hint="Challenge rating takes a fraction for the weakest monsters — 0.25 prints as 1/4."
      >
        <Row>
          <NumberField
            label="Challenge rating"
            value={d.challenge_rating}
            onChange={v => set({ challenge_rating: v })}
            max={30}
            step={0.125}
          />
          <NumberField
            label="XP"
            value={d.experience_points}
            onChange={v => set({ experience_points: v })}
            max={1_000_000}
          />
        </Row>
        <Row>
          <NumberField
            label="Proficiency bonus"
            value={d.proficiency_bonus}
            onChange={v => set({ proficiency_bonus: v })}
          />
          <NumberField
            label="Initiative bonus"
            value={d.initiative_bonus}
            onChange={v => set({ initiative_bonus: v })}
            min={-20}
            max={40}
          />
        </Row>
      </FieldGroup>

      <FieldGroup title="Ability scores">
        <div className="grid gap-3 sm:grid-cols-3">
          {ABILITY_KEYS.map(key => (
            <NumberField
              key={key}
              label={ABILITY_LABELS[key]}
              value={d.ability_scores[key]}
              onChange={v =>
                set({ ability_scores: { ...d.ability_scores, [key]: v } })
              }
              max={50}
            />
          ))}
        </div>
      </FieldGroup>

      <FieldGroup
        title="How it moves"
        hint="Feet. Leave a speed at 0 if it has none."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['walk', 'Walk'],
              ['fly', 'Fly'],
              ['swim', 'Swim'],
              ['climb', 'Climb'],
              ['burrow', 'Burrow'],
            ] as const
          ).map(([key, label]) => (
            <NumberField
              key={key}
              label={label}
              value={d.speed[key]}
              onChange={v => set({ speed: { ...d.speed, [key]: v } })}
              max={1000}
            />
          ))}
        </div>
        <BoolField
          label="Hovers"
          value={d.speed.hover}
          onChange={v => set({ speed: { ...d.speed, hover: v } })}
        />
      </FieldGroup>

      <FieldGroup title="What it shrugs off">
        <Row>
          <PickMany
            label="Damage immunities"
            values={d.damage_immunities}
            options={DAMAGE_OPTIONS}
            onChange={v => set({ damage_immunities: v })}
          />
          <PickMany
            label="Damage resistances"
            values={d.damage_resistances}
            options={DAMAGE_OPTIONS}
            onChange={v => set({ damage_resistances: v })}
          />
        </Row>
        <PickMany
          label="Damage vulnerabilities"
          values={d.damage_vulnerabilities}
          options={DAMAGE_OPTIONS}
          onChange={v => set({ damage_vulnerabilities: v })}
        />
      </FieldGroup>

      <FieldGroup
        title="What it can see"
        hint="Feet. Zero means it does not have that sense."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Darkvision"
            value={d.darkvision}
            onChange={v => set({ darkvision: v })}
            max={1000}
          />
          <NumberField
            label="Blindsight"
            value={d.blindsight}
            onChange={v => set({ blindsight: v })}
            max={1000}
          />
          <NumberField
            label="Tremorsense"
            value={d.tremorsense}
            onChange={v => set({ tremorsense: v })}
            max={1000}
          />
          <NumberField
            label="Truesight"
            value={d.truesight}
            onChange={v => set({ truesight: v })}
            max={1000}
          />
        </div>
        <Row>
          <NumberField
            label="Passive Perception"
            value={d.passive_perception}
            onChange={v => set({ passive_perception: v })}
          />
          <TextField
            label="Languages"
            value={d.languages}
            onChange={v => set({ languages: v })}
            description="Common, Draconic; telepathy 120 ft."
          />
        </Row>
      </FieldGroup>

      <PassageRepeater
        label="Traits"
        hint="Always-on things — Amphibious, Pack Tactics, Legendary Resistance."
        addLabel="Add trait"
        rows={d.traits}
        onChange={v => set({ traits: v })}
      />
      <PassageRepeater
        label="Actions"
        addLabel="Add action"
        rows={d.actions}
        onChange={v => set({ actions: v })}
      />
      <PassageRepeater
        label="Bonus actions"
        addLabel="Add bonus action"
        rows={d.bonus_actions}
        onChange={v => set({ bonus_actions: v })}
      />
      <PassageRepeater
        label="Reactions"
        addLabel="Add reaction"
        rows={d.reactions}
        onChange={v => set({ reactions: v })}
      />
      <PassageRepeater
        label="Legendary actions"
        addLabel="Add legendary action"
        rows={d.legendary_actions}
        onChange={v => set({ legendary_actions: v })}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The switch
 * ------------------------------------------------------------------ */

export function ContentDataForm({
  type,
  value,
  onChange,
}: {
  type: ContentType;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (type) {
    case 'class':
      return <ClassForm d={value as ClassData} onChange={onChange} />;
    case 'subclass':
      return <SubclassForm d={value as SubclassData} onChange={onChange} />;
    case 'species':
      return <SpeciesForm d={value as SpeciesData} onChange={onChange} />;
    case 'background':
      return <BackgroundForm d={value as BackgroundData} onChange={onChange} />;
    case 'feat':
      return <FeatForm d={value as FeatData} onChange={onChange} />;
    case 'spell':
      return <SpellForm d={value as SpellData} onChange={onChange} />;
    case 'item':
      return <ItemForm d={value as ItemData} onChange={onChange} />;
    case 'creature':
      return <CreatureForm d={value as CreatureData} onChange={onChange} />;
    default:
      return null;
  }
}
