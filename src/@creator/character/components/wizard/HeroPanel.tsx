'use client';

import { useMemo, useState } from 'react';
import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react';

import { Glyph, Marginalia } from '@/@shared/components/ui';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_LABELS,
  type CharacterSheet,
  type SkillKey,
} from '../../schema';
import { grantedSkills } from '../../lib/compose';
import {
  abilityModifier,
  fmtBonus,
  passivePerception,
  proficiencyBonus,
  spellAttackBonus,
  spellSaveDC,
} from '../../lib/derive';
import type { BuildRefs } from '../../lib/compose';
import type { BuildIssue, StepId } from '../../lib/validate-build';
import { CharacterSheetView } from '../CharacterSheetView';

/**
 * The hero as they stand, at every width, on every step.
 *
 * The builder used to describe the character in three places, none of them
 * complete: a one-line "So far" strip, an `xl:`-only rail of eleven numbers,
 * and a Review step you could only reach after every other decision was made.
 * The question a player actually asks mid-build — "wait, did I already take
 * Perception?" — was answerable in none of them.
 *
 * So this is one panel, and it is the whole answer: what was chosen, what it
 * worked out to, and what is still owed, with the real `CharacterSheetView`
 * one click behind it. `xl` and up it lives in the rail; below that the same
 * component is the body of a modal, because "always on screen" that quietly
 * stops being true at 1279px is worse than a button that is always there.
 *
 * Rule 4: nothing in here moves. The dice tray is the builder's one toy.
 */

interface HeroPanelProps {
  sheet: CharacterSheet;
  refs: BuildRefs;
  issues: BuildIssue[];
  /** Jump to the step that answers an open decision. */
  onGoToStep: (step: StepId) => void;
  /** The table this hero is being built for, if one was picked. */
  campaignName?: string;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      <span className="min-w-0 text-right text-sm text-ink">{value}</span>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle">
      {children}
    </h3>
  );
}

/** Everything the build has settled, in the order a player looks for it. */
export function HeroPanelBody({
  sheet,
  refs,
  issues,
  onGoToStep,
  campaignName,
}: HeroPanelProps) {
  const level = sheet.identity.level;
  const pb = proficiencyBonus(level);
  const dc = spellSaveDC(sheet);
  const atk = spellAttackBonus(sheet);

  const skills = useMemo(
    () => [...grantedSkills(sheet, refs).entries()],
    [sheet, refs]
  );

  /**
   * Feats from both places the 2024 rules put them: the origin feat a
   * background grants, and every level whose ASI was spent on one.
   */
  const feats = useMemo(() => {
    const out: { name: string; from: string }[] = [];
    if (refs.background?.feat) {
      out.push({ name: refs.background.feat, from: refs.background.name });
    }
    for (const entry of sheet.build.levels) {
      if (entry.asi?.mode === 'feat' && entry.asi.featName) {
        out.push({ name: entry.asi.featName, from: `level ${entry.level}` });
      }
    }
    return out;
  }, [refs.background, sheet.build.levels]);

  const gear = [
    sheet.build.equipment.classOption &&
      `Class ${sheet.build.equipment.classOption}`,
    sheet.build.equipment.backgroundOption &&
      `Background ${sheet.build.equipment.backgroundOption}`,
  ].filter(Boolean) as string[];

  const lineage = sheet.build.speciesChoices.filter(c => c.option);

  const identity = [
    `Level ${level}`,
    sheet.build.speciesName,
    sheet.build.subclassName
      ? `${sheet.build.className} (${sheet.build.subclassName})`
      : sheet.build.className,
    sheet.build.backgroundName,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <div className="font-display text-xl leading-tight text-ink">
          {sheet.identity.name || 'Unnamed hero'}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          {identity.length > 0 ? identity.join(' · ') : 'nothing chosen yet'}
        </p>
        {campaignName && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gold-strong">
            <Glyph name="banner" size={13} />
            {campaignName}
          </p>
        )}
      </div>

      {/* ---- the six numbers ---- */}
      <div className="grid grid-cols-3 gap-1.5">
        {ABILITY_KEYS.map(key => {
          const score = sheet.abilities[key].score;
          return (
            <div
              key={key}
              className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-center"
            >
              <div className="text-[0.55rem] uppercase tracking-[0.1em] text-ink-subtle">
                {ABILITY_LABELS[key].slice(0, 3)}
              </div>
              <div className="font-display text-base leading-tight tabular-nums text-ink">
                {score}
              </div>
              <div className="text-[0.7rem] tabular-nums text-ink-muted">
                {fmtBonus(abilityModifier(score))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- what those numbers came to ---- */}
      <div className="border-t border-line pt-2">
        <Row label="Armour class" value={sheet.combat.armorClass} />
        <Row
          label="Hit points"
          value={`${sheet.combat.hitPointsMax} · ${sheet.combat.hitDiceMax}d${sheet.combat.hitDieSize}`}
        />
        <Row label="Proficiency" value={fmtBonus(pb)} />
        <Row
          label="Initiative"
          value={fmtBonus(abilityModifier(sheet.abilities.dexterity.score))}
        />
        <Row label="Speed" value={`${sheet.combat.speed} ft`} />
        <Row label="Passive perception" value={passivePerception(sheet)} />
        {sheet.spellcasting.ability && (
          <>
            <Row label="Spell save DC" value={dc ?? '—'} />
            <Row
              label="Spell attack"
              value={atk === null ? '—' : fmtBonus(atk)}
            />
          </>
        )}
      </div>

      {/* ---- what was picked, rather than derived ---- */}
      {(skills.length > 0 ||
        feats.length > 0 ||
        gear.length > 0 ||
        lineage.length > 0) && (
        <div className="border-t border-line pt-3">
          <Heading>Chosen</Heading>

          {skills.length > 0 && (
            <div className="mb-2">
              <div className="text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
                Skills ({skills.length})
              </div>
              <ul className="mt-1 space-y-0.5">
                {skills.map(([skill, source]) => (
                  <li
                    key={skill}
                    className="flex items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="text-ink">
                      {SKILL_LABELS[skill as SkillKey]}
                    </span>
                    <span className="shrink-0 text-[0.7rem] text-ink-subtle">
                      {source}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {feats.length > 0 && (
            <div className="mb-2">
              <div className="text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
                Feats
              </div>
              <ul className="mt-1 space-y-0.5">
                {feats.map(feat => (
                  <li
                    key={`${feat.from}:${feat.name}`}
                    className="flex items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="text-ink">{feat.name}</span>
                    <span className="shrink-0 text-[0.7rem] text-ink-subtle">
                      {feat.from}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lineage.length > 0 && (
            <div className="mb-2">
              <div className="text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
                Species choices
              </div>
              <ul className="mt-1 space-y-0.5">
                {lineage.map(choice => (
                  <li key={choice.trait} className="text-sm text-ink">
                    {choice.option}
                    <span className="ml-1.5 text-[0.7rem] text-ink-subtle">
                      {choice.trait}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gear.length > 0 && (
            <Row label="Starting gear" value={gear.join(' · ')} />
          )}
        </div>
      )}

      {/* ---- what is still owed, and where to go and owe it ---- */}
      <div className="border-t border-line pt-3">
        {issues.length === 0 ? (
          <>
            <Heading>Nothing outstanding</Heading>
            <Marginalia dash>ready to be inscribed</Marginalia>
          </>
        ) : (
          <>
            <Heading>Still to decide ({issues.length})</Heading>
            <ul className="space-y-1">
              {issues.map(issue => (
                <li key={`${issue.step}:${issue.message}`}>
                  <button
                    type="button"
                    onClick={() => onGoToStep(issue.step)}
                    className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-warning transition-colors hover:bg-warning/10"
                  >
                    <Glyph
                      name="arrow-right"
                      size={13}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{issue.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The panel plus the way into the full sheet.
 *
 * One renderer (content-model rule 5): "the whole sheet" is
 * `CharacterSheetView`, the same component the player's own character page and
 * the DM's view of it use, rather than a fourth summary written here.
 */
export function HeroPanel(props: HeroPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <HeroPanelBody {...props} />

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm text-ink-muted transition-colors hover:border-gold/60 hover:text-ink"
      >
        <Glyph name="notebook" size={14} />
        Read the full sheet
      </button>

      <FullSheetModal
        sheet={props.sheet}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

export function FullSheetModal({
  sheet,
  isOpen,
  onClose,
}: {
  sheet: CharacterSheet;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={open => !open && onClose()}
      size="5xl"
      scrollBehavior="inside"
    >
      <ModalContent className="border border-line bg-bg">
        <ModalHeader className="font-display text-lg text-ink">
          {sheet.identity.name || 'Unnamed hero'} — the sheet so far
        </ModalHeader>
        <ModalBody className="pb-6">
          <CharacterSheetView sheet={sheet} />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
