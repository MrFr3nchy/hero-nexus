/**
 * The vocabulary shared by SRD reference rows and homebrew rows.
 *
 * The app has two sources of game content and, until this module, two unrelated
 * shapes for it: `reference_data` holds raw Open5e JSON that
 * `@/@creator/character/lib/srd/parse` turns into typed defs, while
 * `homebrew.data` held `{}` and was never read. One renderer, one picker and
 * one validator cannot serve two vocabularies, so everything downstream speaks
 * `ContentEntry` and neither source is special.
 *
 * Nothing here touches the database, the server or React — the wizard, the
 * server and the forms all import from this file.
 */

/** Every kind of content the app can author, approve, and put on a sheet. */
export const CONTENT_TYPES = [
  'class',
  'subclass',
  'species',
  'background',
  'feat',
  'spell',
  'item',
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * A pointer to one piece of content.
 *
 * The load-bearing rule of this module: **a sheet references content, it never
 * copies its stats.** A copied stat block is a fork — the GM's correction to a
 * homebrew item never reaches the character carrying it, and the same item on
 * two sheets silently drifts apart. `key` is the `reference_data.slug` for an
 * SRD row and the `homebrew.id` for a homebrew row.
 */
export interface ContentRef {
  source: 'srd' | 'homebrew';
  /**
   * Part of the identity, not decoration.
   *
   * `reference_data` is keyed on `(category, slug)`, so a slug is unique only
   * *within* a category — the SRD ships `srd-2024_shield` as both a piece of
   * armour and a 1st-level spell. A reference by slug alone is ambiguous, and
   * resolving one to the other silently changed a character's armour class.
   */
  type: ContentType;
  key: string;
}

export function refKey(ref: ContentRef): string {
  return `${ref.source}:${ref.type}:${ref.key}`;
}

export function sameRef(a: ContentRef, b: ContentRef): boolean {
  return a.source === b.source && a.type === b.type && a.key === b.key;
}

/**
 * One piece of content, whatever it came from.
 *
 * `data` is the type's own stat shape, validated by that type's schema in
 * `./schemas`. It is deliberately `unknown` here: this file is the vocabulary,
 * `./registry` is where a type meets its schema and its renderer.
 */
export interface ContentEntry {
  ref: ContentRef;
  type: ContentType;
  name: string;
  /** Prose. The SRD's `desc`, or the author's description. */
  description: string;
  data: unknown;
  /** Homebrew only: who wrote it, for attribution in a picker. */
  ownerId?: string;
}
