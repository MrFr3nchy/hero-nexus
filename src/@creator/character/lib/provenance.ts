/**
 * Provenance = the change log the DM receives when a character joins a
 * campaign. Every custom identity value, manual ability score, chosen
 * generation method, and dice roll lands here.
 *
 * Live events (dice rolls, method switches, custom-field edits) are appended as
 * they happen; `reconcileProvenance` runs once at submit to make sure the final
 * ability scores and free-text identity values are represented even if the
 * player never triggered a discrete event for them.
 */
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type CharacterSheet,
  type ProvenanceEntry,
  type ProvenanceKind,
} from '../schema';
import {
  POINT_BUY_BUDGET,
  pointBuyCost,
  pointBuySpent,
} from '@/@shared/lib/dice';

export function genUid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface ProvenanceInput {
  kind: ProvenanceKind;
  label?: string;
  detail?: string;
  rolls?: number[];
  /** force a new row instead of replacing the last one with the same kind+label */
  append?: boolean;
}

type Getter = () => ProvenanceEntry[];
type Setter = (next: ProvenanceEntry[]) => void;

const MAX_ENTRIES = 1000;

/** Build the `log()` fn the form and its sections call. */
export function makeProvenanceLogger(get: Getter, set: Setter) {
  return function log(input: ProvenanceInput): void {
    const list = get() ?? [];
    const stamped: ProvenanceEntry = {
      id: genUid(),
      at: new Date().toISOString(),
      kind: input.kind,
      label: input.label ?? '',
      detail: input.detail ?? '',
      ...(input.rolls ? { rolls: input.rolls } : {}),
    };

    let next: ProvenanceEntry[];
    if (input.append) {
      next = [...list, stamped];
    } else {
      const idx = list.findIndex(
        p => p.kind === input.kind && p.label === stamped.label
      );
      if (idx >= 0) {
        next = list.slice();
        next[idx] = { ...stamped, id: list[idx].id };
      } else {
        next = [...list, stamped];
      }
    }
    set(next.slice(-MAX_ENTRIES));
  };
}

const METHOD_LABEL: Record<string, string> = {
  manual: 'typed in by hand',
  pointbuy: 'point buy',
  standard: 'standard array',
  roll: 'rolled dice',
};

/**
 * Merge submit-time truth into the provenance list: one entry per ability
 * score, plus free-text identity values. Pure — returns a new array.
 */
export function reconcileProvenance(sheet: CharacterSheet): ProvenanceEntry[] {
  const list: ProvenanceEntry[] = [...(sheet.provenance ?? [])];
  const method = sheet.generation?.abilityMethod ?? 'manual';

  const upsert = (
    kind: ProvenanceKind,
    label: string,
    detail: string
  ): void => {
    const idx = list.findIndex(p => p.kind === kind && p.label === label);
    const entry: ProvenanceEntry = {
      id: idx >= 0 ? list[idx].id : genUid(),
      at: idx >= 0 ? list[idx].at : new Date().toISOString(),
      kind,
      label,
      detail,
    };
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
  };

  const scores = ABILITY_KEYS.map(k => sheet.abilities[k].score);
  const spent = pointBuySpent(scores);

  ABILITY_KEYS.forEach((key, i) => {
    const score = scores[i];
    const kind: ProvenanceKind =
      method === 'pointbuy'
        ? 'stat-pointbuy'
        : method === 'standard'
          ? 'stat-standard'
          : method === 'roll'
            ? 'stat-roll'
            : 'stat-manual';
    let detail = `${ABILITY_LABELS[key]} = ${score} (${METHOD_LABEL[method]})`;
    if (method === 'pointbuy') {
      const c = pointBuyCost(score);
      detail +=
        c === null
          ? ' — outside the 8–15 point-buy range'
          : ` — ${c} of ${spent}/${POINT_BUY_BUDGET} pts`;
    }
    upsert(kind, ABILITY_LABELS[key], detail);
  });

  // Free-text identity values worth surfacing to the DM.
  const freeText: [string, string, string][] = [
    ['identity.subclass', 'Subclass', sheet.identity.subclass],
    ['identity.size', 'Size', sheet.identity.size],
  ];
  for (const [field, label, value] of freeText) {
    if (value && value.trim() && value.trim() !== 'Medium') {
      upsert('field', label, `${field} = "${value.trim()}"`);
    }
  }

  return list.slice(-MAX_ENTRIES);
}
