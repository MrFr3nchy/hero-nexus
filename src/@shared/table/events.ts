/**
 * What a table can be told just happened.
 *
 * One discriminated union, in one file, with no React and no server in it —
 * the same shape as `campaign/lib/screen.ts` and `content/registry.ts`, and
 * for the same reason: adding a kind is one entry plus one line in `describe`,
 * rather than a hunt through a switch in the hub, a switch in the provider and
 * a label map in a component.
 *
 * An event is a **moment**, not a fact. Missing one is acceptable, because the
 * state it produced is still readable through `getLiveState`; seeing one twice
 * is not, because an announcement claims something just happened. That is why
 * these are numbered and replayed rather than re-derived, and why nothing here
 * is stored — see `docs/handoff/the-same-room/README.md`, model decision 5:
 * something becomes a row when a player who was offline still needs to find
 * it, and everything below can be missed.
 *
 * **The payload must be safe for the audience it is published to.** The
 * audience is decided on the server in `live-hub.ts`; where there is any
 * doubt, an event carries a kind and an id and the browser re-reads through
 * the role-filtered path.
 */
import type { GlyphName } from '@/@shared/components/ui/Glyph';

export const TABLE_EVENT_KINDS = [
  'roll',
  'turn',
  'encounter',
  'timer',
  'handout',
  'reveal',
  'check',
  'sitting',
  'vitals',
] as const;

export type TableEventKind = (typeof TABLE_EVENT_KINDS)[number];

interface BaseEvent {
  /** Unique per moment, so a replayed frame can be recognised and dropped. */
  id: string;
  /** ISO instant it happened, from the server. Never the browser's clock. */
  at: string;
}

/** Somebody touched the dice. `secret` only ever reaches staff. */
export interface RollEvent extends BaseEvent {
  kind: 'roll';
  actorName: string;
  /** What it was for — "Stealth", "Longsword". May be empty. */
  label: string;
  notation: string;
  total: number;
  tone: 'plain' | 'crit' | 'fumble';
  secret: boolean;
}

/** The order moved on. */
export interface TurnEvent extends BaseEvent {
  kind: 'turn';
  encounterName: string;
  round: number;
  /** Whose turn it now is. */
  label: string;
  /** Set when the turn belongs to a seated character, so it can be addressed. */
  characterId: string | null;
}

/** A fight started or finished. */
export interface EncounterEvent extends BaseEvent {
  kind: 'encounter';
  encounterName: string;
  state: 'started' | 'ended';
}

/** Sand started falling. Expiry is a state and deliberately fires nothing. */
export interface TimerEvent extends BaseEvent {
  kind: 'timer';
  label: string;
  endsAt: string;
  secret: boolean;
}

/** Something was pushed across the table. */
export interface HandoutEvent extends BaseEvent {
  kind: 'handout';
  title: string;
  handoutKind: 'image' | 'note';
}

/** A line of the DM's notebook was handed over. */
export interface RevealEvent extends BaseEvent {
  kind: 'reveal';
  /** The first line of it. The whole thing is read in the timeline. */
  excerpt: string;
}

/** The DM asked somebody for a roll, or somebody answered. */
export interface CheckEvent extends BaseEvent {
  kind: 'check';
  checkId: string;
  /** "Dexterity (Stealth)", already composed for reading. */
  ask: string;
  state: 'asked' | 'answered' | 'cancelled';
  /** Who it is for, when it was asked of particular people. */
  targetNames: string[];
  /** Only ever present where the DC is shown, or for staff. */
  dc: number | null;
  /** On an answer: who rolled, what they got, and whether it was enough. */
  actorName: string | null;
  total: number | null;
  outcome: 'pass' | 'fail' | null;
}

/** The table opened or closed. The one announcement allowed to be loud. */
export interface SittingEvent extends BaseEvent {
  kind: 'sitting';
  state: 'opened' | 'closed';
  /** "Session 7 · The bridge at Duskwater". */
  title: string;
}

/** Something happened to a character that the table should look up for. */
export interface VitalsEvent extends BaseEvent {
  kind: 'vitals';
  characterName: string;
  characterId: string;
  state: 'down' | 'up' | 'dead' | 'stable';
}

export type TableEvent =
  | RollEvent
  | TurnEvent
  | EncounterEvent
  | TimerEvent
  | HandoutEvent
  | RevealEvent
  | CheckEvent
  | SittingEvent
  | VitalsEvent;

/* --- how one reads ----------------------------------------------------- */

/**
 * Announcement tone.
 *
 * `gold` is the table's own voice and is the default for nearly everything.
 * `danger` is for something actually dangerous — a character going down, a
 * natural 1 — and not for "your turn". `arcane` marks the DM speaking
 * directly at somebody. Design language rule 6: ornament encodes state.
 */
export type EventTone = 'gold' | 'danger' | 'success' | 'arcane';

export interface EventReading {
  glyph: GlyphName;
  /** Straight voice. Load-bearing, so never the hand face (rule 5). */
  title: string;
  /** One optional line under it. Must be removable without losing anything. */
  detail?: string;
  tone: EventTone;
  /** Whether it asks something of the reader, and so should not auto-dismiss. */
  asks?: boolean;
}

const GLYPHS: Record<TableEventKind, GlyphName> = {
  roll: 'die',
  turn: 'sword',
  encounter: 'sword',
  timer: 'hourglass',
  handout: 'letter',
  reveal: 'candle',
  check: 'target',
  sitting: 'tankard',
  vitals: 'shield',
};

/**
 * Turn a moment into one line somebody can read at a glance, mid-session,
 * while four other people are talking.
 *
 * Pure, so the wording can be checked without rendering anything. Kept here
 * rather than in the component because the feed panel and the announcement
 * stack must say the same thing about the same event.
 */
export function describe(
  event: TableEvent,
  viewer: { userId: string; characterId: string | null }
): EventReading {
  const glyph = GLYPHS[event.kind];

  switch (event.kind) {
    case 'roll': {
      const tone: EventTone =
        event.tone === 'crit'
          ? 'success'
          : event.tone === 'fumble'
            ? 'danger'
            : 'gold';
      const forWhat = event.label ? ` · ${event.label}` : '';
      return {
        glyph,
        title: `${event.actorName}${forWhat} · ${event.total}`,
        detail: event.secret
          ? `${event.notation} · behind the screen`
          : event.notation,
        tone,
      };
    }

    case 'turn': {
      const yours =
        event.characterId !== null && event.characterId === viewer.characterId;
      return {
        glyph,
        title: yours ? 'Your turn' : `${event.label}'s turn`,
        detail: `Round ${event.round} · ${event.encounterName}`,
        tone: 'gold',
        asks: yours,
      };
    }

    case 'encounter':
      return {
        glyph,
        title:
          event.state === 'started'
            ? `Roll for initiative — ${event.encounterName}`
            : `${event.encounterName} is over`,
        tone: event.state === 'started' ? 'danger' : 'gold',
      };

    case 'timer':
      return {
        glyph,
        title: event.label || 'Something is running out',
        detail: event.secret ? 'Behind the screen' : undefined,
        tone: 'gold',
      };

    case 'handout':
      return {
        glyph,
        title:
          event.handoutKind === 'image'
            ? `A picture: ${event.title}`
            : event.title || 'A note',
        detail: 'Passed across the table',
        tone: 'gold',
      };

    case 'reveal':
      return {
        glyph,
        title: 'You are told',
        detail: event.excerpt,
        tone: 'gold',
      };

    case 'check': {
      if (event.state === 'cancelled') {
        return { glyph, title: `${event.ask} — withdrawn`, tone: 'gold' };
      }
      if (event.state === 'answered') {
        const verdict =
          event.outcome === 'pass'
            ? 'passes'
            : event.outcome === 'fail'
              ? 'fails'
              : 'rolls';
        return {
          glyph,
          title: `${event.actorName ?? 'Somebody'} ${verdict} · ${event.total ?? '—'}`,
          detail: event.ask,
          tone:
            event.outcome === 'pass'
              ? 'success'
              : event.outcome === 'fail'
                ? 'danger'
                : 'gold',
        };
      }
      const asked = event.targetNames.length > 0;
      return {
        glyph,
        title: event.ask,
        detail: event.dc !== null ? `DC ${event.dc}` : 'The DM is asking',
        tone: 'arcane',
        asks: asked,
      };
    }

    case 'sitting':
      return {
        glyph,
        title:
          event.state === 'opened'
            ? 'The table is sitting'
            : 'The table has risen',
        detail: event.title || undefined,
        tone: 'gold',
        asks: event.state === 'opened',
      };

    case 'vitals': {
      const words: Record<VitalsEvent['state'], string> = {
        down: `${event.characterName} goes down`,
        up: `${event.characterName} is back up`,
        dead: `${event.characterName} dies`,
        stable: `${event.characterName} is stable`,
      };
      return {
        glyph,
        title: words[event.state],
        tone:
          event.state === 'up' || event.state === 'stable'
            ? 'success'
            : 'danger',
      };
    }
  }
}
