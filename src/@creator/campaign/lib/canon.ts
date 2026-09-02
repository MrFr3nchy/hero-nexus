/**
 * Party canon — shared types and constants.
 *
 * Client-safe (no `server-only`): imported by both the canon server module and
 * the canon UI, the same split `campaign/lib/rules.ts` uses.
 */

export const CANON_KINDS = [
  'npc',
  'location',
  'item',
  'faction',
  'lore',
] as const;
export type CanonKind = (typeof CANON_KINDS)[number];

export const CANON_KIND_LABELS: Record<CanonKind, string> = {
  npc: 'NPC',
  location: 'Location',
  item: 'Item',
  faction: 'Faction',
  lore: 'Lore',
};

export type CanonVisibility = 'dm' | 'shared';

export interface CanonLinkRef {
  id: string;
  title: string;
  kind: CanonKind;
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
  createdAt: string;
  updatedAt: string;
  links: CanonLinkRef[];
  /** Staff only: users this entry has been individually revealed to. */
  revealedTo: { userId: string; name: string | null }[];
}

export interface CanonInput {
  kind: CanonKind;
  title: string;
  dmBody: string;
  partyBody: string;
  visibility?: CanonVisibility;
}
