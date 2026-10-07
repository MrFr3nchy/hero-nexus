import type { ContentRef } from '@/@shared/content';

import type { Attitude } from './standing';
import type { GlyphName } from '@/@shared/components/ui/Glyph';

/**
 * Party canon — shared types and constants.
 *
 * Client-safe (no `server-only`): imported by both the canon server module and
 * the canon UI, the same split `campaign/lib/rules.ts` uses.
 *
 * An entry is one thing the table can know about: a person, a place, a spell,
 * a page of somebody's notebook. Each kind carries a handful of structured
 * facts of its own — a spell has a level, an NPC has a status — kept in a
 * small JSON blob rather than eight nullable columns, because the set of
 * facts is presentation, not something the database ever queries on.
 */

export const CANON_KINDS = [
  'npc',
  'creature',
  'location',
  'faction',
  'item',
  'spell',
  'lore',
  'note',
] as const;
export type CanonKind = (typeof CANON_KINDS)[number];

export const CANON_KIND_LABELS: Record<CanonKind, string> = {
  npc: 'NPC',
  creature: 'Creature',
  location: 'Location',
  faction: 'Faction',
  item: 'Item',
  spell: 'Spell',
  lore: 'Lore',
  note: 'Note',
};

/** A glyph per kind, so a shelf of cards is scannable before it is read. */
export const CANON_KIND_GLYPHS: Record<CanonKind, GlyphName> = {
  npc: 'person',
  creature: 'dragon',
  location: 'map',
  faction: 'banner',
  item: 'sword',
  spell: 'sparkle',
  lore: 'scroll',
  note: 'notebook',
};

export interface CanonFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  /** A sentence rather than a word: kept to 400 characters, not 120. */
  long?: boolean;
}

/**
 * The structured facts each kind shows on its card. Deliberately short: a card
 * is a glance, and anything longer belongs in the body text.
 */
export const CANON_KIND_FIELDS: Record<CanonKind, CanonFieldDef[]> = {
  npc: [
    { key: 'role', label: 'Role', placeholder: 'Innkeeper, captain, rival…' },
    { key: 'faction', label: 'Faction', placeholder: 'Who they answer to' },
    { key: 'status', label: 'Status', placeholder: 'Alive, missing, dead…' },
    { key: 'whereabouts', label: 'Last seen', placeholder: 'Where, and when' },
    // What the party would notice across a counter. Secrets and motives
    // belong in the DM notes: these facts reach a player unfiltered.
    {
      key: 'personality',
      label: 'Personality',
      placeholder: 'Gruff, kind underneath, hates bards',
      long: true,
    },
    {
      key: 'voice',
      label: 'Voice & mannerisms',
      placeholder: 'Slow, low, taps the bar twice',
      long: true,
    },
    {
      key: 'appearance',
      label: 'Looks',
      placeholder: 'Scarred, bald, an apron like a flag',
      long: true,
    },
  ],
  creature: [
    { key: 'cr', label: 'Challenge', placeholder: 'CR 5' },
    { key: 'type', label: 'Type', placeholder: 'Aberration, beast…' },
    { key: 'habitat', label: 'Habitat', placeholder: 'Where it is found' },
  ],
  location: [
    {
      key: 'type',
      label: 'What it is',
      placeholder: 'Region, city, district, tavern…',
    },
    { key: 'region', label: 'Region', placeholder: 'The wider map' },
    { key: 'ruler', label: 'Held by', placeholder: 'Who runs the place' },
    { key: 'danger', label: 'Danger', placeholder: 'Quiet, uneasy, hostile…' },
  ],
  faction: [
    { key: 'leader', label: 'Led by', placeholder: 'Name' },
    { key: 'seat', label: 'Seat', placeholder: 'Where they operate' },
    { key: 'goal', label: 'Wants', placeholder: 'What they are after' },
  ],
  item: [
    {
      key: 'rarity',
      label: 'Rarity',
      placeholder: 'Uncommon, rare, legendary…',
    },
    { key: 'attunement', label: 'Attunement', placeholder: 'Required?' },
    { key: 'holder', label: 'Held by', placeholder: 'Who has it now' },
  ],
  spell: [
    { key: 'level', label: 'Level', placeholder: '3rd' },
    { key: 'school', label: 'School', placeholder: 'Evocation' },
    { key: 'casting', label: 'Casting time', placeholder: '1 action' },
    { key: 'range', label: 'Range', placeholder: '60 feet' },
  ],
  lore: [
    { key: 'era', label: 'Era', placeholder: 'When this was true' },
    { key: 'source', label: 'Heard from', placeholder: 'Who told the party' },
  ],
  note: [],
};

export type CanonVisibility = 'dm' | 'shared';

/** What the party has written about an entry (0072), signed. */
export interface PartyNoteRow {
  id: string;
  body: string;
  /** Who wrote it. */
  byName: string;
  /** The viewer wrote it. */
  mine: boolean;
  /** The viewer may change or take it down: its author, or staff. */
  canEdit: boolean;
  createdAt: string;
}

export interface CanonLinkRef {
  id: string;
  title: string;
  kind: CanonKind;
}

/**
 * A shelf: the Bestiary, the party's notebook, a spellbook someone looted.
 * Entries file into one, or sit loose. Collections carry no visibility of
 * their own — every entry is revealed on its own terms, so a half-known
 * bestiary shows a player exactly the monsters they have met.
 */
export interface CanonCollectionRow {
  id: string;
  campaignId: string;
  title: string;
  blurb: string;
  /** An emoji for the shelf's spine. */
  icon: string;
  imageId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CanonCollectionInput {
  title: string;
  blurb?: string;
  icon?: string;
  imageId?: string | null;
  sortOrder?: number;
}

export interface CanonEntryRow {
  id: string;
  campaignId: string;
  kind: CanonKind;
  title: string;
  /** The party-facing text. Always present. */
  partyBody: string;
  /** The DM's private notes. `null` for non-staff viewers — never sent. */
  dmBody: string | null;
  visibility: CanonVisibility;
  /** True when this viewer sees the entry only because it was revealed to them. */
  revealedToMe: boolean;
  /** The shelf it is filed on, or null for a loose entry. */
  collectionId: string | null;
  imageId: string | null;
  /** Kind-specific facts, keyed by `CANON_KIND_FIELDS`. */
  fields: Record<string, string>;
  /**
   * Where it is (0072): the place a place sits inside, an NPC's home.
   * Null for a player when that place has not been shown to them.
   */
  placeId: string | null;
  /** What the party has written about it, oldest first. */
  partyNotes: PartyNoteRow[];
  createdAt: string;
  updatedAt: string;
  links: CanonLinkRef[];
  /** Staff only: users this entry has been individually revealed to. */
  revealedTo: { userId: string; name: string | null }[];
  /** An NPC's attitude toward the party (0069). Null for non-staff — never sent. */
  attitude: Attitude | null;
  /**
   * The stat block it acts with (0069). Staff only; null for players.
   * `available` is false when the ref no longer resolves at this campaign —
   * a homebrew creature outside its library, or one its author deleted.
   */
  stat: { ref: ContentRef; name: string | null; available: boolean } | null;
  /**
   * A faction's standing with the party (0069). `shown` is what the party
   * has been shown; `total` is the whole sum, staff only (null for players).
   * Null for anything that is not a faction.
   */
  standing: { shown: number; total: number | null } | null;
}

export interface CanonInput {
  kind: CanonKind;
  title: string;
  dmBody: string;
  partyBody: string;
  visibility?: CanonVisibility;
  collectionId?: string | null;
  imageId?: string | null;
  fields?: Record<string, string>;
  /** Where it is: a `location` entry in the same campaign, or null. */
  placeId?: string | null;
}

/** Kinds that can carry a stat block and be placed in an encounter. */
export const STAT_KINDS: readonly CanonKind[] = ['npc', 'creature'];

/** Drop empty values so a card only shows facts that were actually filled in. */
export function tidyFields(
  kind: CanonKind,
  raw: Record<string, string> | undefined
): Record<string, string> {
  const defs = new Map(CANON_KIND_FIELDS[kind].map(f => [f.key, f]));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    const def = defs.get(key);
    if (!def) continue;
    const text = value.trim().slice(0, def.long ? 400 : 120);
    if (text) out[key] = text;
  }
  return out;
}
