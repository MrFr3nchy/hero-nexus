'use client';

import { useState } from 'react';
import { Button } from '@heroui/react';

import { Dice3DRoller, type RollRequest } from '@/@shared/components/ui';
import type { RollResult } from '@/@shared/lib/dice';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type AbilityKey,
  type AsiChoice,
  type HpMode,
  type LevelEntry,
} from '../../../schema';
import { abilityModifier, fmtBonus, proficiencyBonus } from '../../../lib/derive';
import { averageHp, planLevels, type LevelStep } from '../../../lib/advancement';
import { finalAbilities } from '../../../lib/compose';
import { StepHeading } from '../parts';
import type { StepProps } from '../types';

const HP_MODE_LABEL: Record<HpMode, string> = {
  average: 'Take the average',
  roll: 'Roll the hit die',
  manual: 'Type a number',
};

const EMPTY_ASI: AsiChoice = {
  mode: 'ability',
  plusTwo: '',
  plusOnes: [],
  featKey: '',
  featName: '',
};

function LevelBadge({ level, current }: { level: number; current: boolean }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-sm tabular-nums ${
        current
          ? 'border-gold bg-gold/15 text-gold-strong'
          : 'border-line bg-surface-2 text-ink-muted'
      }`}
    >
      {level}
    </div>
  );
}

/** One rung of the ladder: what the level granted and what it still wants. */
function LevelCard({
  step,
  entry,
  hitDie,
  conMod,
  subclasses,
  subclassLabel,
  feats,
  isTop,
  onHpMode,
  onHpValue,
  onRollHp,
  onSubclass,
  onAsi,
}: {
  step: LevelStep;
  entry: LevelEntry;
  hitDie: number;
  conMod: number;
  subclasses: { key: string; name: string; blurb: string }[];
  subclassLabel: string;
  feats: { key: string; name: string; prerequisite: string }[];
  isTop: boolean;
  onHpMode: (mode: HpMode) => void;
  onHpValue: (value: number) => void;
  onRollHp: () => void;
  onSubclass: (key: string, name: string) => void;
  onAsi: (asi: AsiChoice) => void;
}) {
  const asi = entry.asi ?? EMPTY_ASI;
  const hpTotal = Math.max(1, entry.hpGain + conMod);
  const asiPending =
    step.needsAsi &&
    (asi.mode === 'feat'
      ? !asi.featName
      : !asi.plusTwo && asi.plusOnes.length < 2);
  const subclassPending = step.needsSubclass && !entry.subclassKey;
  const pending = asiPending || subclassPending;

  return (
    <li className="relative flex gap-4">
      {/* The spine that makes the list read as a ladder. */}
      <div className="flex flex-col items-center">
        <LevelBadge level={step.level} current={isTop} />
        {!isTop && <span className="mt-1 w-px flex-1 bg-line" />}
      </div>

      <div
        className={`mb-4 flex-1 rounded-[var(--radius-card)] border bg-surface p-4 ${
          pending ? 'border-warning/50' : 'border-line'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base text-ink">
            Level {step.level}
            {step.level === 1 && ' — the start'}
          </h3>
          <span className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
            proficiency {fmtBonus(step.proficiencyBonus)}
            {step.proficiencyGrew && (
              <span className="text-gold-strong"> · went up</span>
            )}
          </span>
        </div>

        {/* ---- hit points ---- */}
        <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
              Hit points
            </span>
            <span className="text-sm text-ink">
              <span className="font-display text-lg tabular-nums text-gold-strong">
                +{hpTotal}
              </span>{' '}
              <span className="text-ink-subtle">
                ({entry.hpGain} + {fmtBonus(conMod)} CON)
              </span>
            </span>
          </div>

          {step.level === 1 ? (
            <p className="mt-1.5 text-xs text-ink-subtle">
              Level 1 always takes the full hit die — d{hitDie} rolls a maximum
              of {hitDie}.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-line">
                {(['average', 'roll', 'manual'] as HpMode[]).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onHpMode(mode)}
                    className={`px-2.5 py-1 text-xs transition-colors ${
                      entry.hpMode === mode
                        ? 'bg-gold/15 text-gold-strong'
                        : 'bg-surface text-ink-muted hover:text-ink'
                    }`}
                  >
                    {HP_MODE_LABEL[mode]}
                  </button>
                ))}
              </div>

              {entry.hpMode === 'average' && (
                <span className="text-xs text-ink-subtle">
                  d{hitDie} averages {averageHp(hitDie)}
                </span>
              )}
              {entry.hpMode === 'roll' && (
                <Button size="sm" variant="flat" onPress={onRollHp}>
                  {entry.hpRoll > 0 ? `Rolled ${entry.hpRoll} — roll again` : `Roll d${hitDie}`}
                </Button>
              )}
              {entry.hpMode === 'manual' && (
                <input
                  type="number"
                  min={1}
                  max={hitDie}
                  value={entry.hpGain}
                  onChange={e => onHpValue(Number(e.target.value) || 1)}
                  className="w-20 rounded-md border border-line bg-surface px-2 py-1 text-sm tabular-nums text-ink"
                  aria-label={`Hit points gained at level ${step.level}`}
                />
              )}
            </div>
          )}
        </div>

        {/* ---- subclass ---- */}
        {step.needsSubclass && (
          <div className="mt-3">
            <h4 className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
              Choose your {subclassLabel.toLowerCase()}
            </h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {subclasses.map(sub => (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => onSubclass(sub.key, sub.name)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    entry.subclassKey === sub.key
                      ? 'border-gold bg-gold/15 text-ink'
                      : 'border-line bg-surface text-ink-muted hover:border-gold/60 hover:text-ink'
                  }`}
                >
                  <span className="font-display text-ink">{sub.name}</span>
                  {sub.blurb && (
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {sub.blurb}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---- ability score improvement ---- */}
        {step.needsAsi && (
          <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
                Ability Score Improvement
              </h4>
              <div className="inline-flex overflow-hidden rounded-md border border-line">
                <button
                  type="button"
                  onClick={() => onAsi({ ...asi, mode: 'ability' })}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    asi.mode === 'ability'
                      ? 'bg-gold/15 text-gold-strong'
                      : 'bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  Raise abilities
                </button>
                <button
                  type="button"
                  onClick={() => onAsi({ ...asi, mode: 'feat' })}
                  className={`px-2.5 py-1 text-xs transition-colors ${
                    asi.mode === 'feat'
                      ? 'bg-gold/15 text-gold-strong'
                      : 'bg-surface text-ink-muted hover:text-ink'
                  }`}
                >
                  Take a feat
                </button>
              </div>
            </div>

            {asi.mode === 'ability' ? (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-ink-subtle">
                  Either +2 to one ability, or +1 to two of them. Nothing goes
                  above 20.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ABILITY_KEYS.map(ability => {
                    const isTwo = asi.plusTwo === ability;
                    const isOne = asi.plusOnes.includes(ability);
                    return (
                      <button
                        key={ability}
                        type="button"
                        onClick={() => {
                          if (isTwo) {
                            onAsi({ ...asi, plusTwo: '', plusOnes: [] });
                          } else if (isOne) {
                            onAsi({
                              ...asi,
                              plusOnes: asi.plusOnes.filter(k => k !== ability),
                            });
                          } else if (!asi.plusTwo && asi.plusOnes.length === 0) {
                            onAsi({ ...asi, plusTwo: ability, plusOnes: [] });
                          } else if (asi.plusTwo === ability) {
                            onAsi({ ...asi, plusTwo: '' });
                          } else if (asi.plusTwo) {
                            // Second tap turns the +2 into two +1s.
                            onAsi({
                              ...asi,
                              plusTwo: '',
                              plusOnes: [asi.plusTwo, ability],
                            });
                          } else if (asi.plusOnes.length < 2) {
                            onAsi({ ...asi, plusOnes: [...asi.plusOnes, ability] });
                          }
                        }}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          isTwo
                            ? 'border-gold bg-gold/25 text-ink'
                            : isOne
                              ? 'border-gold bg-gold/10 text-ink'
                              : 'border-line bg-surface text-ink-muted hover:border-gold/60'
                        }`}
                      >
                        {ABILITY_LABELS[ability].slice(0, 3)}
                        {isTwo && ' +2'}
                        {isOne && ' +1'}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <select
                  value={asi.featKey}
                  onChange={e => {
                    const feat = feats.find(f => f.key === e.target.value);
                    onAsi({
                      ...asi,
                      mode: 'feat',
                      featKey: feat?.key ?? '',
                      featName: feat?.name ?? '',
                    });
                  }}
                  className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                  aria-label={`Feat taken at level ${step.level}`}
                >
                  <option value="">Choose a feat…</option>
                  {feats.map(feat => (
                    <option key={feat.key} value={feat.key}>
                      {feat.name}
                      {feat.prerequisite ? ` — ${feat.prerequisite}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* ---- what the class hands over ---- */}
        {step.grants.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {step.grants.map(grant => (
              <li key={`${grant.source}-${grant.name}`} className="text-sm">
                <span className="text-ink">{grant.name}</span>
                {grant.detail && (
                  <span className="text-ink-subtle"> ({grant.detail})</span>
                )}
                {grant.source === 'subclass' && (
                  <span className="ml-1.5 rounded-sm border border-gold/40 px-1 text-[0.6rem] uppercase tracking-[0.1em] text-gold-strong">
                    subclass
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {(step.slotChanges.length > 0 || step.tableChanges.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            {step.slotChanges.map(line => (
              <span key={line}>{line}</span>
            ))}
            {step.tableChanges.map(col => (
              <span key={col.name}>
                {col.name}: {col.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * The level-up log. Starting above level 1 is a sequence of real decisions —
 * hit points, a subclass, every Ability Score Improvement — so the builder
 * walks them instead of taking a level number on trust.
 */
export function AdvancementStep({
  sheet,
  build,
  catalog,
  classDef,
  patchBuild,
  setLevel,
  log,
  maxLevel = 20,
}: StepProps & { maxLevel?: number }) {
  const [request, setRequest] = useState<
    (RollRequest & { level?: number }) | null
  >(null);

  const level = sheet.identity.level;
  const hitDie = classDef?.hitDie ?? sheet.combat.hitDieSize;
  const conMod = abilityModifier(finalAbilities(sheet).constitution);
  const steps = planLevels(classDef, level, build.subclassKey);
  const entryFor = (lvl: number) =>
    build.levels.find(l => l.level === lvl) ?? {
      level: lvl,
      hpMode: 'average' as HpMode,
      hpGain: averageHp(hitDie),
      hpRoll: 0,
      subclassKey: '',
      subclassName: '',
      note: '',
    };

  const patchLevel = (lvl: number, mutate: (entry: LevelEntry) => LevelEntry) =>
    patchBuild(b => ({
      ...b,
      levels: b.levels.map(l => (l.level === lvl ? mutate(l) : l)),
    }));

  const setHpMode = (lvl: number, mode: HpMode) =>
    patchLevel(lvl, entry => ({
      ...entry,
      hpMode: mode,
      hpGain:
        mode === 'average'
          ? averageHp(hitDie)
          : mode === 'roll' && entry.hpRoll > 0
            ? entry.hpRoll
            : entry.hpGain,
    }));

  const applyHpRoll = (lvl: number, result: RollResult) => {
    patchLevel(lvl, entry => ({
      ...entry,
      hpMode: 'roll',
      hpRoll: result.total,
      hpGain: result.total,
    }));
    log({
      kind: 'stat-roll',
      label: `Level ${lvl} hit points`,
      detail: `Level ${lvl} hit points: rolled 1d${hitDie} = ${result.total}`,
      rolls: result.dice,
      append: true,
    });
  };

  const setSubclass = (lvl: number, key: string, name: string) => {
    patchBuild(b => ({
      ...b,
      subclassKey: key,
      subclassName: name,
      levels: b.levels.map(l =>
        l.level === lvl ? { ...l, subclassKey: key, subclassName: name } : l
      ),
    }));
    log({
      kind: 'field',
      label: 'Subclass',
      detail: `Subclass chosen at level ${lvl}: ${name}`,
    });
  };

  const setAsi = (lvl: number, asi: AsiChoice) => {
    patchLevel(lvl, entry => ({ ...entry, asi }));
    const detail =
      asi.mode === 'feat'
        ? asi.featName
          ? `Level ${lvl}: took the ${asi.featName} feat`
          : `Level ${lvl}: feat not chosen yet`
        : `Level ${lvl}: ${[
            asi.plusTwo && `+2 ${ABILITY_LABELS[asi.plusTwo as AbilityKey]}`,
            ...asi.plusOnes.map(k => `+1 ${ABILITY_LABELS[k as AbilityKey]}`),
          ]
            .filter(Boolean)
            .join(', ')}`;
    log({ kind: 'method', label: `ASI level ${lvl}`, detail });
  };

  const subclassLabel = classDef
    ? `${classDef.name} subclass`
    : 'subclass';

  return (
    <div>
      <StepHeading
        title="Level and advancement"
        lede="Choose where your hero starts. Every level above the first is walked properly — hit points, subclass, and each Ability Score Improvement — and the whole trail goes to your DM."
      />

      <div className="rounded-[var(--radius-card)] border border-gold/30 bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
              Starting level
            </span>
            <div className="font-display text-3xl tabular-nums text-ink">
              {level}
            </div>
          </div>
          <div className="text-right text-sm text-ink-muted">
            <div>
              proficiency bonus {fmtBonus(proficiencyBonus(level))}
            </div>
            <div>
              hit points {sheet.combat.hitPointsMax} · hit dice {level}d{hitDie}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              type="button"
              disabled={n > maxLevel}
              onClick={() => setLevel(n)}
              className={`h-8 w-8 rounded-md border text-xs tabular-nums transition-colors ${
                n === level
                  ? 'border-gold bg-gold/20 text-gold-strong'
                  : n > maxLevel
                    ? 'cursor-not-allowed border-line/60 text-ink-subtle/40'
                    : 'border-line bg-surface text-ink-muted hover:border-gold/60 hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {maxLevel < 20 && (
          <p className="mt-2 text-xs text-ink-subtle">
            This table caps new characters at level {maxLevel}.
          </p>
        )}
      </div>

      {request && (
        <div className="mt-4">
          <Dice3DRoller
            request={request}
            onResults={(results, req) => {
              const target = (req as RollRequest & { level?: number }).level;
              if (target) applyHpRoll(target, results[0]);
            }}
            onClose={() => setRequest(null)}
          />
        </div>
      )}

      {!classDef && (
        <p className="mt-4 text-sm text-ink-muted">
          Pick a class to see what each level gives you.
        </p>
      )}

      <ol className="mt-6">
        {steps.map(step => (
          <LevelCard
            key={step.level}
            step={step}
            entry={entryFor(step.level)}
            hitDie={hitDie}
            conMod={conMod}
            subclasses={classDef?.subclasses ?? []}
            subclassLabel={subclassLabel}
            feats={catalog.feats}
            isTop={step.level === steps.length}
            onHpMode={mode => setHpMode(step.level, mode)}
            onHpValue={value =>
              patchLevel(step.level, entry => ({
                ...entry,
                hpMode: 'manual',
                hpGain: Math.max(1, Math.min(hitDie, value)),
              }))
            }
            onRollHp={() =>
              setRequest({
                nonce: Date.now(),
                spec: { sides: hitDie, count: 1 },
                title: `Level ${step.level} hit points`,
                hint: `one d${hitDie}, plus your Constitution modifier`,
                level: step.level,
              })
            }
            onSubclass={(key, name) => setSubclass(step.level, key, name)}
            onAsi={asi => setAsi(step.level, asi)}
          />
        ))}
      </ol>
    </div>
  );
}
