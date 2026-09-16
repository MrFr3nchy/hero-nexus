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
 * is stored: something becomes a row when a player who was offline still needs to find
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
  'map',
  'whisper',
  'gift',
  'thing',
  'rules',
  'effect',
  'action',
  'opportunity',
  'cast',
  'time',
  'rest',
  'levelup',
] as const;

export type TableEventKind = (typeof TABLE_EVENT_KINDS)[number];

interface BaseEvent {
  /** Unique per moment, so a replayed frame can be recognised and dropped. */
  id: string;
  /** ISO instant it happened, from the server. Never the browser's clock. */
  at: string;
  /**
   * Who caused it, when the server knows.
   *
   * Not for filtering — the audience does that — but so the corner can stay
   * quiet about what the reader just did themselves. Being told "you rolled a
   * 14" a beat after watching your own dice land is noise, and at a busy table
   * it is the noise that buries somebody else's news.
   */
  by?: string | null;
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
  /** The faces came off real dice on the table. */
  physical?: boolean;
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

/** A map was put in front of the table, or taken down. */
export interface MapEvent extends BaseEvent {
  kind: 'map';
  title: string;
  state: 'lit' | 'dark';
}

/** Something happened to a character that the table should look up for. */
export interface VitalsEvent extends BaseEvent {
  kind: 'vitals';
  characterName: string;
  characterId: string;
  /** `inspired`: the DM handed over Heroic Inspiration (10). */
  state: 'down' | 'up' | 'dead' | 'stable' | 'inspired';
}

/**
 * A note passed under the table. Published to the sender, the people it was
 * said to, and — through `reaches` — staff, and to nobody else; so the line
 * itself may travel, because everybody who receives it was meant to.
 */
export interface WhisperEvent extends BaseEvent {
  kind: 'whisper';
  whisperId: string;
  fromName: string;
  /** Who it was said to, so the corner can say "to you" or "to Kessa". */
  toUserIds: string[];
  toNames: string[];
  /** The whole line. A whisper is one line; there is nothing to excerpt. */
  body: string;
}

/** Something changed hands between two seated characters. */
export interface GiftEvent extends BaseEvent {
  kind: 'gift';
  fromName: string;
  toName: string;
  /** "Potion of Healing ×2", "12 gp, 3 sp". Already composed for reading. */
  what: string;
}

/** Somebody did something to a thing on the board. */
export interface ThingEvent extends BaseEvent {
  kind: 'thing';
  /** Who did it — the character when seated, else the person. */
  actorName: string;
  /** The thing's own name: "the cellar door". */
  name: string;
  what:
    | 'opened'
    | 'closed'
    | 'unlocked'
    | 'held'
    | 'broken'
    /** It did what it does (08): the floor dropped, the portcullis rose. */
    | 'fired'
    /** A hidden thing was found. */
    | 'spotted'
    /** Staff only: a hero stands beside something they have not found. */
    | 'near';
  /** The line the thing makes, or the nudge's words. */
  detail?: string;
}

/**
 * The DM changed what the app does about the rules — flipped the table from
 * advising to enforcing, or turned an optional rule on or off for this
 * fight. Everyone hears it: a rule nobody knows about is not a rule.
 */
export interface RulesEvent extends BaseEvent {
  kind: 'rules';
  mode: 'advise' | 'enforce';
  /** True when the mode itself moved; false when only optional rules did. */
  modeChanged: boolean;
  /** One line per rule that changed, already composed for reading. */
  changed: string[];
  /** Set when it applies to one fight rather than the campaign. */
  encounterName: string | null;
}

/**
 * Something with a clock on it was put on somebody, ran out, was shaken off,
 * or — a countdown — came due. `label` is the effect's own name ("Poisoned",
 * "Rage", "The ceiling comes down"); `targets` who it was on, already the
 * words the table uses for them. A hidden countdown reaches staff only.
 */
export interface EffectEvent extends BaseEvent {
  kind: 'effect';
  what: 'applied' | 'ended' | 'saved' | 'fired' | 'cleared';
  label: string;
  targets: string[];
  /** "3 rounds" / "until saved" on an application; empty otherwise. */
  duration: string;
  secret: boolean;
}

/**
 * Somebody spent part of their turn. `again` marks a slot that was already
 * spent — advising, the app records it and says so rather than refusing.
 * `holding` is the staff-only nudge when a readied trigger's moment may
 * have come: "Ilse is holding: if the door opens → cast Shield".
 */
export interface ActionEvent extends BaseEvent {
  kind: 'action';
  actorLabel: string;
  /** The action's label — "Dash", "Ready", "Opportunity attack". */
  action: string;
  cost: 'action' | 'bonus' | 'reaction' | 'movement' | 'free';
  /** What was readied, who was helped. May be empty. */
  note: string;
  again: boolean;
  ruling: boolean;
  what: 'took' | 'holding';
}

/**
 * A creature left a hostile's reach without Disengaging, and the hostile
 * still has its reaction. An offer, to the hostile's owner or to staff —
 * nothing fires by itself.
 */
export interface OpportunityEvent extends BaseEvent {
  kind: 'opportunity';
  attackerLabel: string;
  attackerEntryId: string;
  moverLabel: string;
}

/**
 * Somebody cast a spell (07). `targets` are the names the audience may
 * know — hidden foes reach staff only, in a second copy. `awaiting` names
 * fellow heroes whose yes is still owed; `refused` is one of them saying no.
 */
export interface CastEvent extends BaseEvent {
  kind: 'cast';
  casterLabel: string;
  spell: string;
  level: number;
  ritual: boolean;
  concentration: boolean;
  targets: string[];
  awaiting: string[];
  refused?: boolean;
}

/**
 * The world's clock moved (10). `label` is the moment it now reads — "Dawn,
 * 3rd of Mirtul" — and `why` what moved it: a rest, the DM's hand, a sitting
 * opening. `notes` are what the day tick did on the way: who went hungry,
 * who has not slept. Everyone hears the clock; a note about a hero reaches
 * everyone too, because the road is not a secret.
 */
export interface TimeEvent extends BaseEvent {
  kind: 'time';
  label: string;
  why: string;
  /** Minutes moved. Zero when the clock was set rather than advanced. */
  minutes: number;
  notes: string[];
}

/**
 * A rest was called, confirmed or broken (10). `called` asks each player
 * for their hit dice and a confirm; `done` is the sheets moved; `broken` is
 * a rest interrupted, nothing granted.
 */
export interface RestEvent extends BaseEvent {
  kind: 'rest';
  restKind: 'short' | 'long';
  state: 'called' | 'done' | 'broken';
  /** How long it takes at this table — "an hour", "8 hours". */
  takes: string;
}

/**
 * Somebody has the experience for a level they have not taken (10). To the
 * owner and staff: the sheet is theirs to walk up.
 */
export interface LevelUpEvent extends BaseEvent {
  kind: 'levelup';
  characterId: string;
  characterName: string;
  level: number;
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
  | VitalsEvent
  | MapEvent
  | WhisperEvent
  | GiftEvent
  | ThingEvent
  | RulesEvent
  | EffectEvent
  | ActionEvent
  | OpportunityEvent
  | CastEvent
  | TimeEvent
  | RestEvent
  | LevelUpEvent;

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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
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
  map: 'map',
  whisper: 'whisper',
  gift: 'chest',
  thing: 'key',
  rules: 'gavel',
  effect: 'hourglass',
  action: 'sword',
  opportunity: 'target',
  cast: 'sparkle',
  time: 'hourglass',
  rest: 'tankard',
  levelup: 'star',
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
      const how = event.secret
        ? ' · behind the screen'
        : event.physical
          ? ' · real dice'
          : '';
      return {
        glyph,
        title: `${event.actorName}${forWhat} · ${event.total}`,
        detail: `${event.notation}${how}`,
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

    case 'map':
      return {
        glyph,
        title:
          event.state === 'lit'
            ? `Look at this — ${event.title}`
            : `${event.title} is put away`,
        tone: 'gold',
      };

    case 'whisper': {
      const toYou = event.toUserIds.includes(viewer.userId);
      // Staff overhear every whisper; for them the corner names both ends,
      // because "Rurik whispers" with no recipient is half a sentence.
      const to = toYou ? 'you' : event.toNames.join(', ') || 'somebody';
      return {
        glyph,
        title: `${event.fromName} whispers to ${to}`,
        detail: event.body,
        tone: 'arcane',
      };
    }

    case 'gift':
      return {
        glyph,
        title: `${event.fromName} gives ${event.toName} ${event.what}`,
        tone: 'gold',
      };

    case 'thing': {
      const words: Record<ThingEvent['what'], string> = {
        opened: `${event.actorName} opens ${event.name}`,
        closed: `${event.actorName} closes ${event.name}`,
        unlocked: `${event.actorName} picks the lock on ${event.name}`,
        held: `${event.name} holds — ${event.actorName} could not pick it`,
        broken: `${event.name} breaks`,
        fired: event.actorName
          ? `${event.actorName} sets off ${event.name}`
          : `${event.name} goes off`,
        spotted: `${event.actorName} spots ${event.name}`,
        near: `${event.actorName} is beside ${event.name}`,
      };
      return {
        glyph,
        title: words[event.what],
        detail: event.detail || undefined,
        tone:
          event.what === 'broken' || event.what === 'fired'
            ? 'danger'
            : event.what === 'near'
              ? 'arcane'
              : 'gold',
        asks: event.what === 'near',
      };
    }

    case 'rules': {
      const where = event.encounterName ? ` for ${event.encounterName}` : '';
      const title = event.modeChanged
        ? event.mode === 'enforce'
          ? `The DM is enforcing the rules${where}`
          : `The DM has loosened the rules${where}`
        : `The DM has changed the rules${where}`;
      return {
        glyph,
        title,
        detail: event.changed.join(' '),
        tone: 'gold',
      };
    }

    case 'effect': {
      const who = event.targets.join(', ');
      const words: Record<EffectEvent['what'], string> = {
        applied: who ? `${event.label} · ${who}` : event.label,
        ended: who ? `${event.label} ends on ${who}` : `${event.label} ends`,
        saved: `${who || 'Somebody'} shakes off ${event.label}`,
        fired: event.label,
        cleared: `A long rest clears ${event.label}`,
      };
      return {
        glyph,
        title: words[event.what],
        detail:
          event.what === 'applied' && event.duration
            ? event.secret
              ? `${event.duration} · behind the screen`
              : event.duration
            : event.secret
              ? 'Behind the screen'
              : undefined,
        // A countdown reaching zero is the one moment here that is actually
        // dangerous — the ceiling came down. Shaking something off is good news.
        tone:
          event.what === 'fired'
            ? 'danger'
            : event.what === 'saved' || event.what === 'cleared'
              ? 'success'
              : 'gold',
      };
    }

    case 'action': {
      if (event.what === 'holding') {
        const held = event.note.includes('→')
          ? event.note
          : `${event.note}${event.note ? ' → ' : ''}${event.action}`;
        return {
          glyph,
          title: `${event.actorLabel} is holding: ${held}`,
          tone: 'arcane',
          asks: true,
        };
      }
      return {
        glyph,
        title: `${event.actorLabel} · ${event.action}${event.again ? ' · again' : ''}`,
        detail:
          [event.note, event.ruling ? "DM's ruling" : '']
            .filter(Boolean)
            .join(' · ') || undefined,
        tone: 'gold',
      };
    }

    case 'cast': {
      if (event.refused) {
        return {
          glyph,
          title: `${event.casterLabel}'s ${event.spell} is refused`,
          tone: 'gold',
        };
      }
      const at =
        event.targets.length > 0 ? ` on ${event.targets.join(', ')}` : '';
      const how = [
        event.ritual
          ? 'as a ritual'
          : event.level > 0
            ? `${ordinal(event.level)} level`
            : 'a cantrip',
        event.concentration ? 'concentrating' : '',
        event.awaiting.length > 0
          ? `waiting on ${event.awaiting.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
      return {
        glyph,
        title: `${event.casterLabel} casts ${event.spell}${at}`,
        detail: how || undefined,
        tone: 'arcane',
      };
    }

    case 'opportunity':
      return {
        glyph,
        title: `${event.attackerLabel} can take an opportunity attack on ${event.moverLabel}`,
        detail: 'A reaction, if they want it.',
        tone: 'arcane',
        asks: true,
      };

    case 'time':
      return {
        glyph,
        title: event.label,
        detail:
          [event.why, ...event.notes].filter(Boolean).join(' · ') || undefined,
        // A note on the line means the road took something — a hungry day,
        // a night without sleep — and that is worth the danger ink.
        tone: event.notes.length > 0 ? 'danger' : 'gold',
      };

    case 'rest': {
      const which = event.restKind === 'long' ? 'long rest' : 'short rest';
      if (event.state === 'called') {
        return {
          glyph,
          title: `The DM calls a ${which}`,
          detail:
            event.restKind === 'short'
              ? `${event.takes} · spend hit dice from your hero panel, then confirm`
              : `${event.takes} · confirm from your hero panel`,
          tone: 'gold',
          asks: true,
        };
      }
      return {
        glyph,
        title:
          event.state === 'done'
            ? `The ${which} is over`
            : `The ${which} is broken`,
        detail: event.state === 'done' ? event.takes : 'Nothing was regained.',
        tone: event.state === 'done' ? 'success' : 'danger',
      };
    }

    case 'levelup': {
      const yours = event.characterId === viewer.characterId;
      return {
        glyph,
        title: yours
          ? `You have enough to reach level ${event.level}`
          : `${event.characterName} has enough to reach level ${event.level}`,
        detail: yours ? 'Walk it up on your sheet.' : undefined,
        tone: 'success',
        asks: yours,
      };
    }

    case 'vitals': {
      const words: Record<VitalsEvent['state'], string> = {
        down: `${event.characterName} goes down`,
        up: `${event.characterName} is back up`,
        dead: `${event.characterName} dies`,
        stable: `${event.characterName} is stable`,
        inspired: `The DM gives ${event.characterName} Heroic Inspiration`,
      };
      return {
        glyph: event.state === 'inspired' ? 'star' : glyph,
        title: words[event.state],
        tone:
          event.state === 'up' ||
          event.state === 'stable' ||
          event.state === 'inspired'
            ? 'success'
            : 'danger',
      };
    }
  }
}
