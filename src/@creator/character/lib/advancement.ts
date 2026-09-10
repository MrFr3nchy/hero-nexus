/**
 * Level-by-level advancement: what a class hands you at each level, and which
 * of those grants need a decision from the player.
 *
 * This is what makes "start at level 5" honest — instead of typing 5 into a
 * box, the player walks levels 2–5 and records the hit points, the subclass,
 * and every Ability Score Improvement along the way, all of which land in the
 * change log the DM reads.
 */

import type { CharacterBuild, LevelEntry } from '../schema';
import { proficiencyBonus } from './derive';
import type { ClassDef, ClassFeature } from './srd/types';

export interface LevelGrant {
  name: string;
  desc: string;
  /** Open5e's per-level qualifier, e.g. "two uses". */
  detail: string;
  source: 'class' | 'subclass';
}

export interface LevelStep {
  level: number;
  proficiencyBonus: number;
  /** True when the proficiency bonus goes up at this level. */
  proficiencyGrew: boolean;
  grants: LevelGrant[];
  /** This is the level the class picks a subclass at. */
  needsSubclass: boolean;
  /** This level grants an Ability Score Improvement (or a feat instead). */
  needsAsi: boolean;
  /** New or upgraded spell slots, already worded for display. */
  slotChanges: string[];
  /** Class-table columns that changed value at this level. */
  tableChanges: { name: string; value: string }[];
}

const grantsAt = (
  features: ClassFeature[],
  level: number,
  source: 'class' | 'subclass'
): LevelGrant[] =>
  features
    .filter(f => f.levels.includes(level))
    .map(f => ({
      name: f.name,
      desc: f.desc,
      detail: f.detailByLevel[level] ?? '',
      source,
    }));

/** Spell slots a class has at a given character level, by slot level. */
export function slotsAtLevel(
  def: ClassDef | null,
  level: number
): Record<number, number> {
  const out: Record<number, number> = {};
  if (!def) return out;
  for (const [slotLevel, byLevel] of Object.entries(def.spellSlots)) {
    const total = byLevel[level] ?? 0;
    if (total > 0) out[Number(slotLevel)] = total;
  }
  return out;
}

/**
 * The 2024 experience table: the total XP a character needs to reach each
 * level, indexed by that level.
 *
 * `identity.xp` has been on the sheet since the beginning and nothing has ever
 * read it, so a player typed a number into a box that meant nothing. This is
 * what gives it a meaning — and the surface that shows it also says that many
 * tables run on milestones instead, because a threshold presented as the only
 * way to level is wrong for half of them.
 */
const XP_FOR_LEVEL = [
  0, 0, 300, 900, 2_700, 6_500, 14_000, 23_000, 34_000, 48_000, 64_000, 85_000,
  100_000, 120_000, 140_000, 165_000, 195_000, 225_000, 265_000, 305_000,
  355_000,
] as const;

/** Total XP needed to reach `level`. 0 for level 1, and for anything past 20. */
export function xpForLevel(level: number): number {
  return XP_FOR_LEVEL[level] ?? 0;
}

/** The level a given XP total earns, 1–20. */
export function levelForXp(xp: number): number {
  let level = 1;
  for (let n = 2; n <= 20; n++) {
    if (xp >= XP_FOR_LEVEL[n]) level = n;
  }
  return level;
}

/** What a character's XP says about where they are on the ladder. */
export interface XpStanding {
  /** The level their XP has earned, which may differ from the sheet's. */
  earnedLevel: number;
  /** True when XP has outrun the level written on the sheet. */
  canLevel: boolean;
  /** Total XP for the next level, or null at 20. */
  nextAt: number | null;
  /** How much more is needed, or null at 20. */
  remaining: number | null;
}

export function xpStanding(xp: number, level: number): XpStanding {
  const earnedLevel = levelForXp(xp);
  const nextAt = level >= 20 ? null : xpForLevel(level + 1);
  return {
    earnedLevel,
    canLevel: earnedLevel > level,
    nextAt,
    remaining: nextAt === null ? null : Math.max(0, nextAt - xp),
  };
}

const ORDINAL = [
  '',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
];

/**
 * The whole ladder from level 1 to `level`. Levels above the class's own
 * features still appear — an empty level is a real fact about the class.
 */
export function planLevels(
  def: ClassDef | null,
  level: number,
  subclassKey: string
): LevelStep[] {
  const top = Math.max(1, Math.min(20, level));
  const subclass = def?.subclasses.find(s => s.key === subclassKey) ?? null;

  const steps: LevelStep[] = [];
  for (let lvl = 1; lvl <= top; lvl++) {
    const previous = slotsAtLevel(def, lvl - 1);
    const current = slotsAtLevel(def, lvl);
    const slotChanges: string[] = [];
    for (const [slotLevel, total] of Object.entries(current)) {
      const was = previous[Number(slotLevel)] ?? 0;
      if (total > was) {
        slotChanges.push(
          `${ORDINAL[Number(slotLevel)]}-level slots: ${was} → ${total}`
        );
      }
    }

    const tableChanges = (def?.tableColumns ?? [])
      .map(col => ({
        name: col.name,
        value: col.byLevel[lvl] ?? '',
        was: col.byLevel[lvl - 1] ?? '',
      }))
      .filter(col => col.value && col.value !== col.was)
      .map(({ name, value }) => ({ name, value }));

    steps.push({
      level: lvl,
      proficiencyBonus: proficiencyBonus(lvl),
      proficiencyGrew:
        lvl > 1 && proficiencyBonus(lvl) > proficiencyBonus(lvl - 1),
      grants: [
        ...grantsAt(def?.features ?? [], lvl, 'class'),
        ...grantsAt(subclass?.features ?? [], lvl, 'subclass'),
      ],
      needsSubclass: Boolean(def) && def!.subclassLevel === lvl,
      needsAsi: (def?.asiLevels ?? []).includes(lvl),
      slotChanges,
      tableChanges,
    });
  }
  return steps;
}

/** Fixed hit points a level grants before the Constitution modifier. */
export function averageHp(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

/**
 * Grow or trim `build.levels` so there is exactly one row per level, keeping
 * every decision already made. Level 1 always takes the full hit die.
 */
export function syncLevels(
  build: CharacterBuild,
  level: number,
  hitDie: number
): LevelEntry[] {
  const top = Math.max(1, Math.min(20, level));
  const existing = new Map(build.levels.map(l => [l.level, l]));
  const rows: LevelEntry[] = [];

  for (let lvl = 1; lvl <= top; lvl++) {
    const prior = existing.get(lvl);
    if (lvl === 1) {
      rows.push({
        ...(prior ?? {
          level: 1,
          hpMode: 'average',
          hpRoll: 0,
          subclassKey: '',
          subclassName: '',
          subclassSource: 'srd',
          note: '',
        }),
        level: 1,
        hpMode: 'average',
        hpGain: hitDie,
      });
      continue;
    }
    if (prior) {
      // A class swap changes the die, so re-derive any non-rolled value.
      rows.push({
        ...prior,
        hpGain:
          prior.hpMode === 'roll' && prior.hpRoll > 0
            ? Math.min(prior.hpRoll, hitDie)
            : prior.hpMode === 'manual'
              ? prior.hpGain
              : averageHp(hitDie),
      });
      continue;
    }
    rows.push({
      level: lvl,
      hpMode: 'average',
      hpGain: averageHp(hitDie),
      hpRoll: 0,
      subclassKey: '',
      subclassName: '',
      subclassSource: 'srd',
      note: '',
    });
  }
  return rows;
}
