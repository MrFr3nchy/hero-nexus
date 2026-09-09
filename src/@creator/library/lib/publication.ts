/**
 * The vocabulary of the Wandering Library.
 *
 * Pure: no database, no React, no server. `@/server/library` does the loading
 * and the components import their labels from here, which is the same split
 * `@/@creator/campaign/lib/canon` uses.
 *
 * Three words in this repo are not the same word, and this module only ever
 * means the first:
 *
 * - **the Wandering Library** — the public shelf. `publications`, `/library`.
 * - **your shelf** — one reader's own collection. `ShelfItem`.
 * - **a campaign library** — what is in play at one table. `campaign_homebrew`.
 *
 * The verbs are *publish* and *adopt*. Nothing here is bought or sold, so
 * nothing here says "buy", "price" or "download".
 */
import type { GlyphName } from '@/@shared/components/ui/Glyph';
import type { ContentEntry, ContentType } from '@/@shared/content';

/**
 * What a listing offers, and — the load-bearing part — how it is delivered.
 *
 * `homebrew` is live-linked: an adopter gets a link to the author's row, so a
 * later correction reaches every table using it. Everything else is a snapshot,
 * because a sheet and a campaign are mutable play state and a borrowed one has
 * to stop moving the moment it is taken.
 */
export const PUBLICATION_KINDS = [
  'homebrew',
  'character',
  'campaign',
  'image',
  'bundle',
] as const;

export type PublicationKind = (typeof PUBLICATION_KINDS)[number];

export function isPublicationKind(value: string): value is PublicationKind {
  return (PUBLICATION_KINDS as readonly string[]).includes(value);
}

/** True for the one kind whose content stays the author's to correct. */
export function isLiveLinked(kind: PublicationKind): boolean {
  return kind === 'homebrew';
}

export type PublicationVisibility = 'public' | 'unlisted';
export type PublicationStatus = 'listed' | 'withdrawn';

/** How a reader took something: a link to the author's row, or their own copy. */
export type AdoptionMode = 'linked' | 'forked';

export interface PublicationKindMeta {
  id: PublicationKind;
  label: string;
  plural: string;
  glyph: GlyphName;
  /** One line, shown under the kind in a filter. */
  description: string;
}

export const PUBLICATION_KIND_META: Record<
  PublicationKind,
  PublicationKindMeta
> = {
  homebrew: {
    id: 'homebrew',
    label: 'Homebrew',
    plural: 'Homebrew',
    glyph: 'anvil',
    description: 'A spell, an item, a species — one forged thing.',
  },
  character: {
    id: 'character',
    label: 'Hero',
    plural: 'Heroes',
    glyph: 'person',
    description: 'A finished sheet, ready to hand to a player.',
  },
  campaign: {
    id: 'campaign',
    label: 'Campaign',
    plural: 'Campaigns',
    glyph: 'banner',
    description: 'Somebody’s prep, whole: canon, quests, maps, notes.',
  },
  image: {
    id: 'image',
    label: 'Picture',
    plural: 'Pictures',
    glyph: 'map',
    description: 'A map, a portrait, a page torn from a notebook.',
  },
  bundle: {
    id: 'bundle',
    label: 'Bundle',
    plural: 'Bundles',
    glyph: 'chest',
    description: 'Several things that only make sense together.',
  },
};

export const PUBLICATION_KIND_ORDER: PublicationKind[] = [
  'homebrew',
  'character',
  'campaign',
  'image',
  'bundle',
];

export function publicationKindMeta(
  kind: PublicationKind
): PublicationKindMeta {
  return PUBLICATION_KIND_META[kind];
}

/** One listing, as anything that draws a card needs it. */
export interface PublicationCard {
  id: string;
  ownerId: string;
  kind: PublicationKind;
  /** The live row behind a live-linked listing. Null once the author deletes it. */
  homebrewId: string | null;
  /** The narrow type when the listing is one piece of content. */
  contentType: ContentType | null;
  title: string;
  summary: string;
  tags: string[];
  /** Who wrote it, as the shelf says it. Frozen at publish time. */
  credit: string;
  visibility: PublicationVisibility;
  status: PublicationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** How many readers have taken it. Counted, never denormalised. */
  adoptions: number;
  /** True when the signed-in reader wrote it. */
  mine: boolean;
  /** How the signed-in reader took it, if they did. */
  adopted: AdoptionMode | null;
  /** How many pieces travel with it. `1` for a plain homebrew listing. */
  itemCount: number;
  /**
   * The thing itself, ready for the real `StatBlock` (content-model rule 5, and
   * design rule 1 — a shelf of listings should show what is on it, not
   * paragraphs about what is on it).
   *
   * The author's live row where there still is one, the frozen payload where
   * there is not. `null` for the kinds that have no stat block to draw.
   */
  preview: ContentEntry | null;
  /** The picture drawn on the card, when the listing has one. */
  coverUrl: string | null;
}

/**
 * Tags are a flat list of short lowercase words, stored as JSON on the row.
 *
 * Deliberately not a join table: nothing else in the app needs to ask "what is
 * tagged x" except this one shelf, and at the scale a self-hosted instance
 * reaches, a `LIKE` over a JSON column is honest.
 */
export function normaliseTags(raw: unknown): string[] {
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : [];
  const out: string[] = [];
  for (const value of values) {
    const tag = String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9 \-']/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 32);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === 8) break;
  }
  return out;
}
