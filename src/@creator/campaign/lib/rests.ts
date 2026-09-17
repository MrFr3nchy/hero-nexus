/**
 * Rests as a flow (improvements 10) — the shapes, pure.
 *
 * A rest is called by staff, answered by each player from their own hero
 * panel, and confirmed by staff; `campaign_rests` holds one row per rest
 * and `server/rests.ts` is its only writer. What lives here is what both
 * sides read: the answers' shape, and the two species rules a long rest
 * has to know.
 */

export type RestKind = 'short' | 'long';

export interface RestAnswer {
  /** Hit dice this hero has spent during this rest, through the tray. */
  hitDice: number;
  /** The player has said they are done. */
  confirmed: boolean;
}

export type RestAnswers = Record<string, RestAnswer>;

export function normalizeRestAnswers(raw: unknown): RestAnswers {
  const obj =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: RestAnswers = {};
  for (const [id, v] of Object.entries(obj)) {
    if (!v || typeof v !== 'object') continue;
    const a = v as Record<string, unknown>;
    out[id] = {
      hitDice:
        typeof a.hitDice === 'number' && Number.isFinite(a.hitDice)
          ? Math.max(0, Math.trunc(a.hitDice))
          : 0,
      confirmed: a.confirmed === true,
    };
  }
  return out;
}

/** "short rest" / "long rest", for a sentence. */
export function restLabel(kind: RestKind): string {
  return kind === 'long' ? 'long rest' : 'short rest';
}

/**
 * 2024 PHB: a human regains Heroic Inspiration when they finish a long rest.
 * Off the species name rather than a flag on species data, which the SRD
 * import does not carry; a homebrew species that wants it can call itself
 * "Variant human" and get it.
 */
export function regainsInspirationOnLongRest(species: string): boolean {
  return /\bhuman\b/i.test(species);
}
