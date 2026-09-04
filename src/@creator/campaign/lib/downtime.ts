import type { GlyphName } from '@/@shared/components/ui/Glyph';

/**
 * Between-session downtime — shared types and constants. Client-safe.
 */

export const DOWNTIME_KINDS = [
  'shopping',
  'crafting',
  'research',
  'training',
  'carousing',
  'letter',
  'travel',
  'scheming',
  'recovery',
  'faith',
  'other',
] as const;
export type DowntimeKind = (typeof DOWNTIME_KINDS)[number];

export const DOWNTIME_KIND_LABELS: Record<DowntimeKind, string> = {
  shopping: 'Shopping',
  crafting: 'Crafting',
  research: 'Research',
  training: 'Training',
  carousing: 'Carousing',
  letter: 'Letter / correspondence',
  travel: 'Travel',
  scheming: 'Scheming',
  recovery: 'Rest & recovery',
  faith: 'Prayer & ritual',
  other: 'Other',
};

/** A glyph per kind, so a period reads as a week of activity at a glance. */
export const DOWNTIME_KIND_GLYPHS: Record<DowntimeKind, GlyphName> = {
  shopping: 'coins',
  crafting: 'hammer',
  research: 'magnifier',
  training: 'target',
  carousing: 'tankard',
  letter: 'letter',
  travel: 'compass',
  scheming: 'candle',
  recovery: 'bed',
  faith: 'holy-symbol',
  other: 'question',
};

/** Who may read an action and the DM's answer to it. */
export type DowntimeVisibility = 'player' | 'party';

export type DowntimePeriodStatus = 'open' | 'closed';
export type DowntimeActionStatus = 'submitted' | 'resolved' | 'rejected';

export interface DowntimeActionRow {
  id: string;
  periodId: string;
  characterId: string | null;
  characterName: string | null;
  actorUserId: string;
  actorName: string | null;
  kind: string;
  body: string;
  imageId: string | null;
  visibility: DowntimeVisibility;
  dmResponse: string | null;
  status: DowntimeActionStatus;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** True when the current viewer submitted this action. */
  mine: boolean;
}

export interface DowntimePeriodRow {
  id: string;
  campaignId: string;
  label: string;
  opensAt: string | null;
  closesAt: string | null;
  status: DowntimePeriodStatus;
  createdAt: string;
  actions: DowntimeActionRow[];
}

export interface DowntimePeriodInput {
  label: string;
  opensAt?: string | null;
  closesAt?: string | null;
}

export interface DowntimeActionInput {
  characterId: string | null;
  kind: DowntimeKind;
  body: string;
  imageId?: string | null;
  visibility?: DowntimeVisibility;
}
