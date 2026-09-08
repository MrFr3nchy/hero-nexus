'use client';

import { Chip } from '@heroui/react';
import { type ReactNode } from 'react';

import {
  contentChips,
  contentMeta,
  formatChallenge,
  parseContentData,
  type BackgroundData,
  type ClassData,
  type ContentEntry,
  type CreatureData,
  type FeatData,
  type ItemData,
  type SpeciesData,
  type SpellData,
  type SubclassData,
} from '@/@shared/content';

import { Glyph } from './ui';

/**
 * One piece of game content, rendered as the thing itself.
 *
 * The same component serves the compendium, the forge's live preview, the DM's
 * approval queue, a campaign's content library and a character sheet — because
 * a DM reviewing a homebrew spell should see a spell, not a paragraph. Anything
 * that renders content renders it through here; a second, local mini-renderer
 * is how two surfaces start disagreeing about what a spell is.
 *
 * Takes a `ContentEntry`, so it does not know or care whether the content came
 * from the SRD or somebody's homebrew.
 */

const titleCase = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ') : '';

const listOf = (values: string[]): string => values.map(titleCase).join(', ');

/** A labelled fact. The workhorse of every stat block. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 font-display-alt text-[0.68rem] uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      <span className="text-ink-muted">{children}</span>
    </div>
  );
}

/** A named passage — a class feature, a species trait, a feat's benefit. */
function Passage({
  name,
  meta,
  body,
}: {
  name?: string;
  meta?: string;
  body: string;
}) {
  if (!name && !body.trim()) return null;
  return (
    <div className="border-l-2 border-gold/25 pl-3">
      {name && (
        <p className="font-display text-sm text-ink">
          {name}
          {meta && (
            <span className="ml-2 font-sans text-xs font-normal text-ink-subtle">
              {meta}
            </span>
          )}
        </p>
      )}
      {body.trim() && (
        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
          {body}
        </p>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Prose({ children }: { children: string }) {
  if (!children.trim()) return null;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Per-type bodies
 * ------------------------------------------------------------------ */

function SpellBody({ d }: { d: SpellData }) {
  const components = [
    d.verbal ? 'V' : null,
    d.somatic ? 'S' : null,
    d.material ? 'M' : null,
  ].filter(Boolean);

  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {d.casting_time && (
          <Fact label="Cast">
            {titleCase(d.casting_time)}
            {d.reaction_condition ? `, ${d.reaction_condition}` : ''}
          </Fact>
        )}
        {d.range_text && <Fact label="Range">{d.range_text}</Fact>}
        {d.duration && (
          <Fact label="Duration">
            {titleCase(d.duration)}
            {d.concentration ? ' (concentration)' : ''}
          </Fact>
        )}
        {components.length > 0 && (
          <Fact label="Components">
            {components.join(', ')}
            {d.material_specified ? ` — ${d.material_specified}` : ''}
            {d.material_consumed ? ' (consumed)' : ''}
          </Fact>
        )}
        {d.target_type && (
          <Fact label="Target">{titleCase(d.target_type)}</Fact>
        )}
        {d.saving_throw_ability && (
          <Fact label="Save">{titleCase(d.saving_throw_ability)}</Fact>
        )}
        {d.attack_roll && <Fact label="Attack">Spell attack roll</Fact>}
        {d.damage_roll && (
          <Fact label="Damage">
            {d.damage_roll}
            {d.damage_types.length ? ` ${listOf(d.damage_types)}` : ''}
          </Fact>
        )}
      </div>
      {d.higher_level.trim() && (
        <Group title="At higher levels">
          <Prose>{d.higher_level}</Prose>
        </Group>
      )}
      {d.classes.length > 0 && (
        <Fact label="Lists">{d.classes.join(', ')}</Fact>
      )}
    </>
  );
}

function ItemBody({ d }: { d: ItemData }) {
  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {d.requires_attunement && (
          <Fact label="Attunement">
            {d.attunement_detail || 'Requires attunement'}
          </Fact>
        )}
        {d.weight > 0 && <Fact label="Weight">{d.weight} lb</Fact>}
        {d.cost > 0 && <Fact label="Cost">{d.cost} gp</Fact>}
        {d.charges > 0 && <Fact label="Charges">{d.charges}</Fact>}
      </div>

      {d.weapon && (
        <Group title="Weapon">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {d.weapon.damage_dice && (
              <Fact label="Damage">
                {d.weapon.damage_dice}
                {d.weapon.damage_type
                  ? ` ${titleCase(d.weapon.damage_type)}`
                  : ''}
              </Fact>
            )}
            {d.weapon.range > 0 && (
              <Fact label="Range">
                {d.weapon.range}
                {d.weapon.long_range > 0 ? `/${d.weapon.long_range}` : ''} ft
              </Fact>
            )}
            <Fact label="Class">
              {d.weapon.is_simple ? 'Simple' : 'Martial'}
            </Fact>
            {d.weapon.properties.length > 0 && (
              <Fact label="Properties">{d.weapon.properties.join(', ')}</Fact>
            )}
          </div>
        </Group>
      )}

      {d.armor && (
        <Group title="Armour">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <Fact label="AC">
              {d.armor.ac_base}
              {d.armor.ac_add_dexmod
                ? ` + Dex${d.armor.ac_cap_dexmod != null ? ` (max ${d.armor.ac_cap_dexmod})` : ''}`
                : ''}
            </Fact>
            <Fact label="Category">{titleCase(d.armor.category)}</Fact>
            {d.armor.strength_score_required > 0 && (
              <Fact label="Strength">{d.armor.strength_score_required}</Fact>
            )}
            {d.armor.grants_stealth_disadvantage && (
              <Fact label="Stealth">Disadvantage</Fact>
            )}
          </div>
        </Group>
      )}
    </>
  );
}

/** Features are grouped by the level they arrive at — how a class is read. */
function FeatureList({
  features,
}: {
  features: ClassData['features'] | SubclassData['features'];
}) {
  if (features.length === 0) return null;
  const sorted = [...features].sort(
    (a, b) => (a.levels[0] ?? 99) - (b.levels[0] ?? 99)
  );
  return (
    <Group title="Features">
      <div className="space-y-3">
        {sorted.map((f, i) => (
          <Passage
            key={f.key || `${f.name}-${i}`}
            name={f.name}
            meta={f.levels.length ? `Level ${f.levels.join(', ')}` : undefined}
            body={f.desc}
          />
        ))}
      </div>
    </Group>
  );
}

function ClassBody({ d }: { d: ClassData }) {
  const t = d.coreTraits;
  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <Fact label="Hit die">d{d.hitDie}</Fact>
        {d.casterType !== 'NONE' && (
          <Fact label="Casting">{titleCase(d.casterType)} caster</Fact>
        )}
        {t.primaryAbilities.length > 0 && (
          <Fact label="Primary">{listOf(t.primaryAbilities)}</Fact>
        )}
        {t.savingThrows.length > 0 && (
          <Fact label="Saves">{listOf(t.savingThrows)}</Fact>
        )}
        {t.armor && <Fact label="Armour">{t.armor}</Fact>}
        {t.weapons && <Fact label="Weapons">{t.weapons}</Fact>}
        {t.tools && <Fact label="Tools">{t.tools}</Fact>}
        {t.skillChoice && (
          <Fact label="Skills">
            Choose {t.skillChoice.count}
            {t.skillChoice.options.length
              ? ` from ${listOf(t.skillChoice.options)}`
              : ' from any'}
          </Fact>
        )}
        <Fact label="Subclass">At level {d.subclassLevel}</Fact>
        {d.asiLevels.length > 0 && (
          <Fact label="ASI">Levels {d.asiLevels.join(', ')}</Fact>
        )}
      </div>

      {t.equipment.length > 0 && (
        <Group title="Starting equipment">
          <div className="space-y-2">
            {t.equipment.map(opt => (
              <Passage
                key={opt.label}
                name={opt.label ? `Option ${opt.label}` : undefined}
                meta={opt.gp > 0 ? `${opt.gp} gp` : undefined}
                body={opt.desc}
              />
            ))}
          </div>
        </Group>
      )}

      <FeatureList features={d.features} />
    </>
  );
}

function SubclassBody({ d }: { d: SubclassData }) {
  return (
    <>
      {d.parentClass && <Fact label="Class">{titleCase(d.parentClass)}</Fact>}
      <FeatureList features={d.features} />
    </>
  );
}

function SpeciesBody({ d }: { d: SpeciesData }) {
  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {d.sizes.length > 0 && <Fact label="Size">{listOf(d.sizes)}</Fact>}
        <Fact label="Speed">{d.speed} ft</Fact>
        {d.grantsSkillChoice && (
          <Fact label="Grants">A skill of your choice</Fact>
        )}
      </div>
      {d.traits.length > 0 && (
        <Group title="Traits">
          <div className="space-y-3">
            {d.traits.map((t, i) => (
              <div key={`${t.name}-${i}`}>
                <Passage name={t.name} body={t.desc} />
                {t.options.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-3">
                    {t.options.map(o => (
                      <li key={o.label} className="text-sm text-ink-muted">
                        <span className="text-ink">{o.label}</span>
                        {o.detail ? ` — ${o.detail}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Group>
      )}
    </>
  );
}

function BackgroundBody({ d }: { d: BackgroundData }) {
  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {d.abilityOptions.length > 0 && (
          <Fact label="Abilities">{listOf(d.abilityOptions)}</Fact>
        )}
        {d.skills.length > 0 && <Fact label="Skills">{listOf(d.skills)}</Fact>}
        {d.tool && <Fact label="Tool">{d.tool}</Fact>}
        {d.feat && <Fact label="Feat">{d.feat}</Fact>}
      </div>
      {d.equipment.length > 0 && (
        <Group title="Starting equipment">
          <div className="space-y-2">
            {d.equipment.map(opt => (
              <Passage
                key={opt.label}
                name={opt.label ? `Option ${opt.label}` : undefined}
                meta={opt.gp > 0 ? `${opt.gp} gp` : undefined}
                body={opt.desc}
              />
            ))}
          </div>
        </Group>
      )}
    </>
  );
}

function FeatBody({ d }: { d: FeatData }) {
  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {d.category && <Fact label="Category">{d.category}</Fact>}
        {d.prerequisite && <Fact label="Requires">{d.prerequisite}</Fact>}
      </div>
      {d.benefits.length > 0 && (
        <Group title="Benefits">
          <ul className="space-y-2">
            {d.benefits.map((b, i) => (
              <li
                key={i}
                className="border-l-2 border-gold/25 pl-3 text-sm leading-relaxed text-ink-muted"
              >
                {b}
              </li>
            ))}
          </ul>
        </Group>
      )}
    </>
  );
}

/** `+3` / `-1` — a bonus is only readable with its sign. */
const signed = (n: number): string => (n >= 0 ? `+${n}` : String(n));

const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

const ABILITY_ORDER = [
  ['strength', 'STR'],
  ['dexterity', 'DEX'],
  ['constitution', 'CON'],
  ['intelligence', 'INT'],
  ['wisdom', 'WIS'],
  ['charisma', 'CHA'],
] as const;

function CreatureBody({ d }: { d: CreatureData }) {
  const speeds = [
    d.speed.walk > 0 ? `${d.speed.walk} ft.` : null,
    d.speed.fly > 0
      ? `fly ${d.speed.fly} ft.${d.speed.hover ? ' (hover)' : ''}`
      : null,
    d.speed.swim > 0 ? `swim ${d.speed.swim} ft.` : null,
    d.speed.climb > 0 ? `climb ${d.speed.climb} ft.` : null,
    d.speed.burrow > 0 ? `burrow ${d.speed.burrow} ft.` : null,
  ].filter(Boolean) as string[];

  const senses = [
    d.darkvision > 0 ? `darkvision ${d.darkvision} ft.` : null,
    d.blindsight > 0 ? `blindsight ${d.blindsight} ft.` : null,
    d.tremorsense > 0 ? `tremorsense ${d.tremorsense} ft.` : null,
    d.truesight > 0 ? `truesight ${d.truesight} ft.` : null,
    `passive Perception ${d.passive_perception}`,
  ].filter(Boolean) as string[];

  const saves = Object.entries(d.saving_throws ?? {}).filter(
    ([, v]) => typeof v === 'number'
  );
  const skills = Object.entries(d.skill_bonuses ?? {}).filter(
    ([, v]) => typeof v === 'number'
  );

  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <Fact label="AC">
          {d.armor_class}
          {d.armor_detail ? ` (${d.armor_detail})` : ''}
        </Fact>
        <Fact label="HP">
          {d.hit_points}
          {d.hit_dice ? ` (${d.hit_dice})` : ''}
        </Fact>
        {speeds.length > 0 && <Fact label="Speed">{speeds.join(', ')}</Fact>}
        <Fact label="Initiative">{signed(d.initiative_bonus)}</Fact>
      </div>

      {/* The six scores as the ability line every stat block opens with —
          score first, then the modifier that actually gets rolled. */}
      <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-surface-2 p-3 sm:grid-cols-6">
        {ABILITY_ORDER.map(([key, label]) => {
          const score = d.ability_scores[key];
          return (
            <div key={key} className="text-center">
              <div className="font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle">
                {label}
              </div>
              <div className="text-sm text-ink">{score}</div>
              <div className="text-xs text-ink-muted">
                {signed(abilityMod(score))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        {saves.length > 0 && (
          <Fact label="Saves">
            {saves
              .map(
                ([k, v]) => `${titleCase(k).slice(0, 3)} ${signed(v as number)}`
              )
              .join(', ')}
          </Fact>
        )}
        {skills.length > 0 && (
          <Fact label="Skills">
            {skills
              .map(([k, v]) => `${titleCase(k)} ${signed(v as number)}`)
              .join(', ')}
          </Fact>
        )}
        {d.damage_vulnerabilities.length > 0 && (
          <Fact label="Vulnerable">{listOf(d.damage_vulnerabilities)}</Fact>
        )}
        {d.damage_resistances.length > 0 && (
          <Fact label="Resistant">{listOf(d.damage_resistances)}</Fact>
        )}
        {d.damage_immunities.length > 0 && (
          <Fact label="Immune">{listOf(d.damage_immunities)}</Fact>
        )}
        {d.condition_immunities.length > 0 && (
          <Fact label="Cond. immune">{listOf(d.condition_immunities)}</Fact>
        )}
        <Fact label="Senses">{senses.join(', ')}</Fact>
        {d.languages && <Fact label="Languages">{d.languages}</Fact>}
        <Fact label="CR">
          {formatChallenge(d.challenge_rating)}
          {d.experience_points > 0
            ? ` (${d.experience_points.toLocaleString()} XP)`
            : ''}
          {`, PB ${signed(d.proficiency_bonus)}`}
        </Fact>
      </div>

      {d.traits.length > 0 && (
        <Group title="Traits">
          <div className="space-y-3">
            {d.traits.map((t, i) => (
              <Passage key={`${t.name}-${i}`} name={t.name} body={t.desc} />
            ))}
          </div>
        </Group>
      )}

      {(
        [
          ['Actions', d.actions],
          ['Bonus actions', d.bonus_actions],
          ['Reactions', d.reactions],
          ['Legendary actions', d.legendary_actions],
        ] as const
      ).map(([title, rows]) =>
        rows.length > 0 ? (
          <Group key={title} title={title}>
            <div className="space-y-3">
              {rows.map((a, i) => (
                <Passage key={`${a.name}-${i}`} name={a.name} body={a.desc} />
              ))}
            </div>
          </Group>
        ) : null
      )}
    </>
  );
}

function Body({ entry }: { entry: ContentEntry }) {
  switch (entry.type) {
    case 'spell':
      return <SpellBody d={parseContentData('spell', entry.data)} />;
    case 'item':
      return <ItemBody d={parseContentData('item', entry.data)} />;
    case 'creature':
      return <CreatureBody d={parseContentData('creature', entry.data)} />;
    case 'class':
      return <ClassBody d={parseContentData('class', entry.data)} />;
    case 'subclass':
      return <SubclassBody d={parseContentData('subclass', entry.data)} />;
    case 'species':
      return <SpeciesBody d={parseContentData('species', entry.data)} />;
    case 'background':
      return <BackgroundBody d={parseContentData('background', entry.data)} />;
    case 'feat':
      return <FeatBody d={parseContentData('feat', entry.data)} />;
    default:
      return null;
  }
}

export interface StatBlockProps {
  entry: ContentEntry;
  /** Hide the name and chips when the surrounding card already shows them. */
  headless?: boolean;
  /** Mark it as somebody's homebrew rather than SRD. */
  showSource?: boolean;
  className?: string;
}

export function StatBlock({
  entry,
  headless = false,
  showSource = true,
  className,
}: StatBlockProps) {
  const meta = contentMeta(entry.type);
  const chips = contentChips(entry);
  const isHomebrew = entry.ref.source === 'homebrew';

  return (
    <article className={`space-y-4 ${className ?? ''}`}>
      {!headless && (
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Glyph name={meta.glyph} size={18} className="text-gold" />
            <h2 className="font-display text-xl text-ink">{entry.name}</h2>
            {showSource && isHomebrew && (
              <span className="rounded-sm border border-arcane/40 bg-arcane/10 px-2 py-0.5 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-arcane">
                Homebrew
              </span>
            )}
          </div>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map(c => (
                <Chip key={c} size="sm" variant="flat" className="bg-surface-2">
                  {c}
                </Chip>
              ))}
            </div>
          )}
        </header>
      )}

      <Prose>{entry.description}</Prose>
      <Body entry={entry} />
    </article>
  );
}
