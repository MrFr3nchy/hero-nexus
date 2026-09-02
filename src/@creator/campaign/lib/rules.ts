/**
 * Campaign table rules — the structured half of `CampaignSettings`.
 *
 * A DM sets these once on the campaign manage page; the character builder
 * reflects them, and the server re-checks a sheet against them before it can
 * be saved into (or is flagged on the way into) the campaign. The check is a
 * pure function so the builder and the server run exactly the same logic.
 */

import {
  ABILITY_METHODS,
  type AbilityMethod,
  type CharacterSheet,
} from '@/@creator/character/schema';

export interface CampaignRules {
  /** Ability-score generation methods the table permits. Empty = allow all. */
  abilityMethods: AbilityMethod[];
  allowMulticlass: boolean;
  /** Highest level a character may join at (1–20). */
  maxStartingLevel: number;
  /**
   * Source books / keys the table allows. Empty = no restriction. Captured for
   * the DM's reference; not machine-enforced yet — the sheet has no per-choice
   * source metadata to check against.
   */
  allowedSources: string[];
  /** Species names disallowed at this table (case-insensitive match). */
  bannedSpecies: string[];
  /** Class names disallowed at this table (case-insensitive match). */
  bannedClasses: string[];
  requireBackstory: boolean;
}

export const DEFAULT_CAMPAIGN_RULES: CampaignRules = {
  abilityMethods: [...ABILITY_METHODS],
  allowMulticlass: true,
  maxStartingLevel: 20,
  allowedSources: [],
  bannedSpecies: [],
  bannedClasses: [],
  requireBackstory: false,
};

/** Fold a stored (possibly partial) rules blob over the defaults. */
export function mergeRules(raw: unknown): CampaignRules {
  const obj = (raw ?? {}) as Partial<CampaignRules>;
  return {
    ...DEFAULT_CAMPAIGN_RULES,
    ...obj,
    abilityMethods:
      Array.isArray(obj.abilityMethods) && obj.abilityMethods.length
        ? obj.abilityMethods.filter((m): m is AbilityMethod =>
            (ABILITY_METHODS as readonly string[]).includes(m)
          )
        : [...DEFAULT_CAMPAIGN_RULES.abilityMethods],
    allowedSources: Array.isArray(obj.allowedSources) ? obj.allowedSources : [],
    bannedSpecies: Array.isArray(obj.bannedSpecies) ? obj.bannedSpecies : [],
    bannedClasses: Array.isArray(obj.bannedClasses) ? obj.bannedClasses : [],
  };
}

export interface RuleViolation {
  code: string;
  message: string;
}

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * Check a character sheet against a table's rules. Returns one entry per
 * broken rule; an empty array means the sheet is legal for the table.
 *
 * `allowHomebrew` comes from the flat settings blob, not `rules`, but a sheet
 * carrying homebrew into a no-homebrew table is a rules problem all the same.
 */
export function checkSheetAgainstRules(
  sheet: CharacterSheet,
  rules: CampaignRules,
  opts: { allowHomebrew: boolean }
): RuleViolation[] {
  const out: RuleViolation[] = [];

  const method = sheet.generation?.abilityMethod ?? 'manual';
  if (rules.abilityMethods.length && !rules.abilityMethods.includes(method)) {
    out.push({
      code: 'ability-method',
      message: `Ability scores were built with "${method}", which this table does not allow.`,
    });
  }

  if (sheet.identity.level > rules.maxStartingLevel) {
    out.push({
      code: 'max-level',
      message: `Level ${sheet.identity.level} is above this table's starting-level cap of ${rules.maxStartingLevel}.`,
    });
  }

  // Best-effort: a multiclass character is written as "Fighter / Wizard".
  if (!rules.allowMulticlass && sheet.identity.class.includes('/')) {
    out.push({
      code: 'multiclass',
      message: 'Multiclassing is turned off for this table.',
    });
  }

  const species = norm(sheet.identity.species);
  if (species && rules.bannedSpecies.some(b => norm(b) === species)) {
    out.push({
      code: 'banned-species',
      message: `Species "${sheet.identity.species.trim()}" is not allowed at this table.`,
    });
  }

  const klass = norm(sheet.identity.class);
  if (klass && rules.bannedClasses.some(b => norm(b) === klass)) {
    out.push({
      code: 'banned-class',
      message: `Class "${sheet.identity.class.trim()}" is not allowed at this table.`,
    });
  }

  if (rules.requireBackstory && !sheet.details.backstory.trim()) {
    out.push({
      code: 'backstory',
      message: 'This table requires a backstory before a character can join.',
    });
  }

  if (
    !opts.allowHomebrew &&
    (sheet.homebrew.isHomebrew || sheet.homebrew.entries.length > 0)
  ) {
    out.push({
      code: 'homebrew-off',
      message:
        'This table does not allow homebrew content on character sheets.',
    });
  }

  return out;
}

/** Short human lines describing what a rules blob restricts. For the builder notice. */
export function describeRules(
  rules: CampaignRules,
  opts: { allowHomebrew: boolean }
): string[] {
  const lines: string[] = [];

  if (
    rules.abilityMethods.length &&
    rules.abilityMethods.length < ABILITY_METHODS.length
  ) {
    lines.push(`Ability scores: ${rules.abilityMethods.join(', ')} only.`);
  }
  if (rules.maxStartingLevel < 20) {
    lines.push(`Characters join at level ${rules.maxStartingLevel} or below.`);
  }
  if (!rules.allowMulticlass) {
    lines.push('No multiclassing.');
  }
  if (rules.requireBackstory) {
    lines.push('A backstory is required.');
  }
  if (rules.bannedSpecies.length) {
    lines.push(`Species not allowed: ${rules.bannedSpecies.join(', ')}.`);
  }
  if (rules.bannedClasses.length) {
    lines.push(`Classes not allowed: ${rules.bannedClasses.join(', ')}.`);
  }
  if (!opts.allowHomebrew) {
    lines.push('No homebrew content.');
  }
  if (rules.allowedSources.length) {
    lines.push(`Sources in use: ${rules.allowedSources.join(', ')}.`);
  }

  return lines;
}
