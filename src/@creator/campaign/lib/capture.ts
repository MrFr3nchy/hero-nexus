/**
 * One line of typing, turned into one thing written down.
 *
 * Setting a campaign up was slow not because any one card was hard but
 * because an idea — _the miller's daughter is missing, the sexton knows why,
 * the crypt floods on the sixth night_ — had to be cut into a quest, a canon
 * entry and a clock and typed into three cards on two sections. Half of what
 * made it feel slow was finding the right card. This removes the finding: one
 * box, one grammar, and the long forms stay where they are for the rest.
 *
 * Grammar: `+ <kind> <title>` with two optional tails —
 *
 *   `+ quest The miller's daughter`
 *   `+ npc Sexton Ambrose Quill, keeper of the chapel`
 *   `+ clock The tide takes the crypt, 6`
 *   `+ session The bells of Saltmere, 2026-10-02`
 *
 * Everything after the first comma is the kind's second field: a clock's
 * segment count, a session's date, a note's body, an entry's summary. A kind
 * that has no second field keeps the comma in the title, because "Quill,
 * keeper of the chapel" is a name.
 *
 * Pure: no React, no server, no database. The box parses, shows what it is
 * about to write, and only then calls an action.
 */
import { CANON_KINDS, type CanonKind } from './canon';

/** What a parsed line will become. */
export type CaptureKind =
  | 'quest'
  | 'clock'
  | 'session'
  | 'note'
  | 'loot'
  | CanonKind;

export interface CaptureSpec {
  kind: CaptureKind;
  /** Every word that means this kind. The first is the canonical one. */
  words: readonly string[];
  /** What the line reads as, for the preview: "a quest". */
  article: string;
  /** What the tail after the comma means here, or null when there is none. */
  tail: 'segments' | 'date' | 'body' | 'summary' | 'quantity' | null;
  /** One line under the box while this kind is being typed. */
  hint: string;
  /** False for anything a player has no business writing. */
  players: boolean;
}

/**
 * Every kind the box writes, and the words that reach it.
 *
 * `npc` and the rest of the canon kinds are here by name rather than by a
 * `canon` prefix: a DM types what the thing is, not which table it lands in.
 */
export const CAPTURE_SPECS: readonly CaptureSpec[] = [
  {
    kind: 'quest',
    words: ['quest', 'thread', 'q'],
    article: 'a quest',
    tail: 'summary',
    hint: 'A quest the party can pull on. After a comma: what it is about.',
    players: false,
  },
  {
    kind: 'clock',
    words: ['clock'],
    article: 'a clock',
    tail: 'segments',
    hint: 'A hidden deadline. After a comma: how many segments (4, 6, 8…).',
    players: false,
  },
  {
    kind: 'session',
    words: ['session', 'sitting'],
    article: 'a session',
    tail: 'date',
    hint: 'A night on the books. After a comma: the date, as 2026-10-02.',
    players: false,
  },
  {
    kind: 'note',
    words: ['note'],
    article: 'a note',
    tail: 'body',
    hint: 'A line of your own prep. After a comma: the note itself.',
    players: false,
  },
  {
    kind: 'loot',
    words: ['loot', 'item'],
    article: 'a piece of loot',
    tail: 'quantity',
    hint: 'Something the party is carrying. After a comma: how many.',
    players: false,
  },
  {
    kind: 'npc',
    words: ['npc', 'person'],
    article: 'an NPC',
    tail: 'summary',
    hint: 'Somebody in the world. After a comma: who they are.',
    players: false,
  },
  {
    kind: 'location',
    words: ['location', 'place'],
    article: 'a location',
    tail: 'summary',
    hint: 'Somewhere in the world. After a comma: what it is.',
    players: false,
  },
  {
    kind: 'faction',
    words: ['faction'],
    article: 'a faction',
    tail: 'summary',
    hint: 'A group with its own designs. After a comma: what they want.',
    players: false,
  },
  {
    kind: 'creature',
    words: ['creature', 'monster'],
    article: 'a creature',
    tail: 'summary',
    hint: 'A creature in the world. After a comma: what it is.',
    players: false,
  },
  {
    kind: 'item',
    words: ['relic', 'artifact'],
    article: 'an item in the canon',
    tail: 'summary',
    hint: 'A thing with a story. After a comma: what it is.',
    players: false,
  },
  {
    kind: 'lore',
    words: ['lore'],
    article: 'a piece of lore',
    tail: 'summary',
    hint: 'Something true about the world. After a comma: what it says.',
    players: false,
  },
];

/** The spec a word reaches, or null. Case and a leading `+` are ignored. */
export function specFor(word: string): CaptureSpec | null {
  const w = word.trim().toLowerCase().replace(/^\+/, '');
  return CAPTURE_SPECS.find(s => s.words.includes(w)) ?? null;
}

/** Every word the box will answer to, for the hint list. */
export function captureWords(): string[] {
  return CAPTURE_SPECS.map(s => s.words[0]);
}

export interface Capture {
  spec: CaptureSpec;
  title: string;
  /** The text after the first comma, trimmed. Empty when there was none. */
  tail: string;
  /** `tail` read as a number, when the kind wants one. */
  number: number | null;
}

/**
 * Read a line. Returns null for anything that is not a capture — which is
 * every line that does not begin with `+`, so ordinary searching is never
 * interrupted by a word that happens to be a kind.
 */
export function parseCapture(line: string): Capture | null {
  const text = line.trim();
  if (!text.startsWith('+')) return null;

  const rest = text.slice(1).trim();
  if (!rest) return null;

  const space = rest.search(/\s/);
  if (space < 0) return null;
  const spec = specFor(rest.slice(0, space));
  if (!spec) return null;

  const body = rest.slice(space + 1).trim();
  if (!body) return null;

  // A kind with no second field keeps its commas: "Quill, keeper of the
  // chapel" is one name, not a name and a number.
  if (spec.tail === null) {
    return { spec, title: body, tail: '', number: null };
  }

  const comma = body.lastIndexOf(',');
  if (comma < 0) return { spec, title: body, tail: '', number: null };

  const title = body.slice(0, comma).trim();
  const tail = body.slice(comma + 1).trim();
  if (!title) return { spec, title: body, tail: '', number: null };

  // A numeric tail is only a number for the kinds that want one; "Ambrose
  // Quill, 3rd of his name" is not a clock with three segments, and those
  // kinds take `summary`, so the text survives either way.
  const asNumber =
    spec.tail === 'segments' || spec.tail === 'quantity'
      ? Number.parseInt(tail, 10)
      : Number.NaN;

  return {
    spec,
    title,
    tail,
    number: Number.isFinite(asNumber) ? asNumber : null,
  };
}

/** "a clock called The tide takes the crypt, 6 segments" — the preview line. */
export function describeCapture(capture: Capture): string {
  const { spec, title, tail, number } = capture;
  const head = `${spec.article} — ${title}`;
  if (!tail) return head;
  switch (spec.tail) {
    case 'segments':
      return `${head}, ${number ?? 6} segments`;
    case 'quantity':
      return `${head}, ${number ?? 1} of them`;
    case 'date':
      return `${head}, on ${tail}`;
    default:
      return `${head} — ${tail}`;
  }
}

/** Whether a canon kind is what this capture writes. */
export function isCanonCapture(kind: CaptureKind): kind is CanonKind {
  return (CANON_KINDS as readonly string[]).includes(kind);
}
