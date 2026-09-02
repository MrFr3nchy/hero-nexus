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
  other: 'Other',
};

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
}
