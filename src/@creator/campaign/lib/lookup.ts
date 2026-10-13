/**
 * Search on the session screen: what can be looked up, how a hit is named,
 * and how the books are matched as somebody types.
 *
 * Pure and client-safe. The books (spells, the bestiary, items, house rules)
 * arrive once as a small index and are filtered here, in the browser, so a
 * keystroke never reads the SRD; the campaign's own record is searched on the
 * server, which alone knows what a viewer may read. The SRD rules passages
 * and the conditions are already pure modules and are matched here too.
 */
import type { ContentEntry, ContentRef, ContentType } from '@/@shared/content';
import {
  parseContentData,
  type CreatureData,
  type ItemData,
  type RuleData,
  type SpellData,
} from '@/@shared/content';
import type { GlyphName } from '@/@shared/components/ui/Glyph';
import {
  CONDITIONS,
  CONDITION_KEYS,
  type ConditionDef,
  type ConditionKey,
} from './conditions';
import { RULES_REFERENCE, type RuleEntry } from './rules-reference';

/** The kinds of the campaign's own record that Search reaches. */
export const RECORD_KINDS = [
  'canon',
  'quest',
  'session',
  'handout',
  'loot',
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** The book types Search lists. */
export const BOOK_TYPES = ['spell', 'creature', 'item', 'rule'] as const;
export type BookType = (typeof BOOK_TYPES)[number];

/**
 * Something Search can open. A reference, never a copy (content-model rule
 * 1): a kept homebrew spell shows its author's current text.
 */
export type LookupRef =
  | { kind: 'book'; ref: ContentRef }
  | { kind: 'record'; record: RecordKind; id: string }
  | { kind: 'condition'; key: ConditionKey }
  | { kind: 'rule'; section: string; key: string };

export function lookupKey(ref: LookupRef): string {
  switch (ref.kind) {
    case 'book':
      return `book:${ref.ref.source}:${ref.ref.type}:${ref.ref.key}`;
    case 'record':
      return `record:${ref.record}:${ref.id}`;
    case 'condition':
      return `condition:${ref.key}`;
    case 'rule':
      return `rule:${ref.section}:${ref.key}`;
  }
}

const isString = (v: unknown, max = 200): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;

/** Whether something stored or sent is a reference this build can open. */
export function isLookupRef(value: unknown): value is LookupRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case 'book': {
      const r = v.ref as Record<string, unknown> | null;
      return (
        !!r &&
        (r.source === 'srd' || r.source === 'homebrew') &&
        (BOOK_TYPES as readonly unknown[]).includes(r.type) &&
        isString(r.key)
      );
    }
    case 'record':
      return (
        (RECORD_KINDS as readonly unknown[]).includes(v.record) &&
        isString(v.id, 80)
      );
    case 'condition':
      return (CONDITION_KEYS as readonly unknown[]).includes(v.key);
    case 'rule':
      return RULES_REFERENCE.some(
        s => s.key === v.section && s.entries.some(e => e.key === v.key)
      );
    default:
      return false;
  }
}

/** Only the fields a ref is made of — what is stored, never extra baggage. */
export function cleanLookupRef(ref: LookupRef): LookupRef {
  switch (ref.kind) {
    case 'book':
      return {
        kind: 'book',
        ref: { source: ref.ref.source, type: ref.ref.type, key: ref.ref.key },
      };
    case 'record':
      return { kind: 'record', record: ref.record, id: ref.id };
    case 'condition':
      return { kind: 'condition', key: ref.key };
    case 'rule':
      return { kind: 'rule', section: ref.section, key: ref.key };
  }
}

/* --- the books ----------------------------------------------------------- */

/** One line in the book index: enough to list it, not to read it. */
export interface BookHit {
  ref: ContentRef;
  name: string;
  /** "2nd-level enchantment", "Medium undead · CR 1", "Common · 50 gp". */
  line: string;
  /** Somebody forged it: wears the Homebrew mark. */
  homebrew: boolean;
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

function cr(value: number): string {
  if (value === 0.125) return '1/8';
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  return String(value);
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The one descriptive line a hit wears under its name. */
export function bookLine(entry: ContentEntry): string {
  switch (entry.type) {
    case 'spell': {
      const d: SpellData = parseContentData('spell', entry.data);
      const school = d.school ?? '';
      return d.level === 0
        ? `Cantrip${school ? ` · ${school}` : ''}`
        : `${ORDINAL[d.level] ?? d.level}-level${school ? ` ${school}` : ''}`;
    }
    case 'creature': {
      const d: CreatureData = parseContentData('creature', entry.data);
      return [
        [cap(d.size), d.creature_type].filter(Boolean).join(' '),
        `CR ${cr(d.challenge_rating)}`,
        `AC ${d.armor_class}`,
      ].join(' · ');
    }
    case 'item': {
      const d: ItemData = parseContentData('item', entry.data);
      return [cap(d.rarity), d.cost ? `${d.cost} gp` : null]
        .filter(Boolean)
        .join(' · ');
    }
    case 'rule': {
      const d: RuleData = parseContentData('rule', entry.data);
      return d.summary || 'House rule';
    }
    default:
      return '';
  }
}

/** Where a book hit is shelved, in the section's own word. */
export const BOOK_WHERE: Record<BookType, string> = {
  spell: 'Spells',
  creature: 'Bestiary',
  item: 'Items',
  rule: 'Rules',
};

export const BOOK_GLYPH: Record<BookType, GlyphName> = {
  spell: 'sparkle',
  creature: 'dragon',
  item: 'chest',
  rule: 'gavel',
};

/**
 * How well a name answers what was typed: 3 a prefix, 2 a word inside it
 * starting with it, 1 anywhere, 0 not at all. A table typing "ghou" wants
 * the Ghoul before the Ghoul's Tooth before something with "ghou" mid-word.
 */
export function nameScore(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (n.startsWith(q)) return 3;
  if (n.split(/[\s,'’()-]+/).some(w => w.startsWith(q))) return 2;
  return n.includes(q) ? 1 : 0;
}

function ranked<T>(
  items: readonly T[],
  query: string,
  nameOf: (t: T) => string,
  limit: number
): T[] {
  return items
    .map(item => ({ item, score: nameScore(nameOf(item), query) }))
    .filter(x => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || nameOf(a.item).localeCompare(nameOf(b.item))
    )
    .slice(0, limit)
    .map(x => x.item);
}

export function matchBooks(
  index: readonly BookHit[],
  query: string,
  limit = 8
): BookHit[] {
  if (query.trim().length < 2) return [];
  return ranked(index, query, h => h.name, limit);
}

export function matchConditions(query: string, limit = 3): ConditionDef[] {
  if (query.trim().length < 2) return [];
  return ranked(CONDITIONS, query, c => c.label, limit);
}

export interface RuleHit {
  section: string;
  sectionTitle: string;
  entry: RuleEntry;
}

/** Rules passages by title first; a body match only when no title does. */
export function matchRules(query: string, limit = 3): RuleHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const all: RuleHit[] = RULES_REFERENCE.flatMap(s =>
    s.entries.map(entry => ({ section: s.key, sectionTitle: s.title, entry }))
  );
  const byTitle = ranked(all, q, h => h.entry.title, limit);
  if (byTitle.length > 0) return byTitle;
  return all
    .filter(h => h.entry.body.toLowerCase().includes(q))
    .slice(0, limit);
}

export function findRule(section: string, key: string): RuleHit | null {
  const s = RULES_REFERENCE.find(x => x.key === section);
  const entry = s?.entries.find(e => e.key === key);
  return s && entry ? { section, sectionTitle: s.title, entry } : null;
}

export function findCondition(key: ConditionKey): ConditionDef | null {
  return CONDITIONS.find(c => c.key === key) ?? null;
}

/** Content types the book index carries, for narrowing a `ContentType`. */
export function isBookType(type: ContentType): type is BookType {
  return (BOOK_TYPES as readonly string[]).includes(type);
}

/* --- the record ---------------------------------------------------------- */

/** Where a record hit lives, in naming.md's words. */
export const RECORD_WHERE: Record<RecordKind, string> = {
  canon: 'World',
  quest: 'Quests',
  session: 'Sessions',
  handout: 'Handouts',
  loot: 'Loot',
};

export const RECORD_GLYPH: Record<RecordKind, GlyphName> = {
  canon: 'tome',
  quest: 'scroll',
  session: 'notebook',
  handout: 'letter',
  loot: 'coins',
};

/** The campaign page's address for a record kind, for "Open on the campaign page". */
export const RECORD_SECTION: Record<RecordKind, string> = {
  canon: 'world',
  quest: 'world/everywhere/quests',
  session: 'sessions',
  handout: 'sessions',
  loot: 'loot',
};

/* --- what is kept on the screen ----------------------------------------- */

/** How many lookups one screen keeps. A shelf, not an archive. */
export const KEPT_LIMIT = 12;

/**
 * A lookup kept on the screen: the reference, and the name it had when it was
 * kept. The name is the one denormalisation content-model rule 1 allows — so
 * the Lookups panel can list a dozen rows without opening a dozen entries, and
 * a kept thing that has since been deleted still reads as a word.
 */
export interface KeptLookup {
  ref: LookupRef;
  name: string;
}

/** Coerce stored kept lookups: valid, unique, at most `KEPT_LIMIT`. */
export function normalizeKept(raw: unknown): KeptLookup[] {
  const out: KeptLookup[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    const v = item as { ref?: unknown; name?: unknown } | null;
    if (!v || !isLookupRef(v.ref)) continue;
    const ref = cleanLookupRef(v.ref);
    const key = lookupKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const name =
      typeof v.name === 'string' && v.name.trim()
        ? v.name.trim().slice(0, 120)
        : 'Untitled';
    out.push({ ref, name });
    if (out.length >= KEPT_LIMIT) break;
  }
  return out;
}

/** Put one at the top, once, and keep at most `KEPT_LIMIT`. */
export function withKept(
  kept: readonly KeptLookup[],
  item: KeptLookup
): KeptLookup[] {
  const key = lookupKey(item.ref);
  return [item, ...kept.filter(k => lookupKey(k.ref) !== key)].slice(
    0,
    KEPT_LIMIT
  );
}
