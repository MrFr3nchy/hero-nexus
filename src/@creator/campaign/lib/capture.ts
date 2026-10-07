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
 * And a trailing `@Place name` says where it is, for the kinds that can be
 * somewhere — `+ clock The tide, 6 @Gullrow Docks`. Read first, before the
 * comma, and only at the end of the line after a space: an `@` inside a word
 * or a title is the title's.
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
  | 'random-table'
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
  /** It can stand in a place, so a trailing `@Place` means something. */
  placeable: boolean;
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
    placeable: true,
  },
  {
    kind: 'clock',
    words: ['clock'],
    article: 'a clock',
    tail: 'segments',
    hint: 'A hidden deadline. After a comma: how many segments (4, 6, 8…).',
    players: false,
    placeable: true,
  },
  {
    kind: 'session',
    words: ['session', 'sitting'],
    article: 'a session',
    tail: 'date',
    hint: 'A night on the books. After a comma: the date, as 2026-10-02.',
    players: false,
    placeable: false,
  },
  {
    kind: 'note',
    words: ['note'],
    article: 'a note',
    tail: 'body',
    hint: 'A line of your own prep. After a comma: the note itself.',
    players: false,
    placeable: false,
  },
  {
    kind: 'loot',
    words: ['loot', 'item'],
    article: 'a piece of loot',
    tail: 'quantity',
    hint: 'Something the party is carrying. After a comma: how many.',
    players: false,
    placeable: false,
  },
  {
    // Two words, always: "table" alone is the people playing (naming.md).
    kind: 'random-table',
    words: ['random table', 'random-table'],
    article: 'a random table',
    tail: null,
    hint: 'A random table to roll on. Its entries go in on the campaign page; roll it with “roll <its name>”.',
    players: false,
    placeable: false,
  },
  {
    kind: 'npc',
    words: ['npc', 'person'],
    article: 'an NPC',
    tail: 'summary',
    hint: 'Somebody in the world. After a comma: who they are.',
    players: false,
    placeable: true,
  },
  {
    kind: 'location',
    words: ['location', 'place'],
    article: 'a location',
    tail: 'summary',
    hint: 'Somewhere in the world. After a comma: what it is.',
    players: false,
    placeable: true,
  },
  {
    kind: 'faction',
    words: ['faction'],
    article: 'a faction',
    tail: 'summary',
    hint: 'A group with its own designs. After a comma: what they want.',
    players: false,
    placeable: true,
  },
  {
    kind: 'creature',
    words: ['creature', 'monster'],
    article: 'a creature',
    tail: 'summary',
    hint: 'A creature in the world. After a comma: what it is.',
    players: false,
    placeable: true,
  },
  {
    kind: 'item',
    words: ['relic', 'artifact'],
    article: 'an item in the canon',
    tail: 'summary',
    hint: 'A thing with a story. After a comma: what it is.',
    players: false,
    placeable: true,
  },
  {
    kind: 'lore',
    words: ['lore'],
    article: 'a piece of lore',
    tail: 'summary',
    hint: 'Something true about the world. After a comma: what it says.',
    players: false,
    placeable: true,
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
  /**
   * The place named after a trailing `@`, as typed — not yet a place, only
   * a name to look for. Empty when the line ended in a bare `@`; null when
   * it named none.
   */
  at: string | null;
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

  // The longest word that the line starts with, so a two-word kind
  // ("random table") is read whole rather than as "random".
  const lower = rest.toLowerCase();
  const match = CAPTURE_SPECS.flatMap(sp => sp.words.map(w => ({ sp, w })))
    .filter(({ w }) => lower.startsWith(w) && /\s/.test(rest[w.length] ?? ''))
    .sort((a, b) => b.w.length - a.w.length)[0];
  if (!match) return null;
  const spec = match.sp;

  let body = rest.slice(match.w.length).trim();
  if (!body) return null;

  // Where it is, read off the end first: the place's name may hold a comma
  // of its own, and the comma tail must not swallow it.
  let at: string | null = null;
  if (spec.placeable) {
    const m = /^(.*\S)\s+@([^@]*)$/.exec(body);
    if (m) {
      body = m[1].trim();
      at = m[2].trim();
    }
  }

  // A kind with no second field keeps its commas: "Quill, keeper of the
  // chapel" is one name, not a name and a number.
  if (spec.tail === null) {
    return { spec, title: body, tail: '', number: null, at };
  }

  // The first comma, so a summary may carry commas of its own: "Quill,
  // keeper of the chapel, warden of the bells" is a name and one summary.
  const comma = body.indexOf(',');
  if (comma < 0) return { spec, title: body, tail: '', number: null, at };

  const title = body.slice(0, comma).trim();
  const tail = body.slice(comma + 1).trim();
  if (!title) return { spec, title: body, tail: '', number: null, at };

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
    at,
  };
}

/**
 * The place a typed `@name` means: the one place whose title is that name,
 * ignoring case. None, or more than one, is null with the candidates — the
 * box asks, and never guesses.
 */
export function resolveCapturePlace<
  T extends { id: string; title: string; kind: string },
>(name: string, entries: readonly T[]): { place: T | null; candidates: T[] } {
  const want = name.trim().toLowerCase();
  if (!want) return { place: null, candidates: [] };
  const candidates = entries.filter(
    e => e.kind === 'location' && e.title.trim().toLowerCase() === want
  );
  return {
    place: candidates.length === 1 ? candidates[0] : null,
    candidates,
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

/**
 * `roll Tavern names` — roll on a random table by its name. No `+`, because
 * it writes nothing to the record but a line in Dice; `+` keeps meaning
 * "write". Null for anything else, which stays a search.
 */
export function parseRollCapture(line: string): string | null {
  const m = /^roll\s+(.+)$/i.exec(line.trim());
  return m ? m[1].trim() : null;
}

/** Whether a canon kind is what this capture writes. */
export function isCanonCapture(kind: CaptureKind): kind is CanonKind {
  return (CANON_KINDS as readonly string[]).includes(kind);
}
