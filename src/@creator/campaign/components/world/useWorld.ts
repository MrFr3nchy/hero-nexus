'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CampaignMemberRow } from '@/server/campaigns';
import type { PlanRow } from '@/server/encounter-plans';
import type { MapRow } from '@/server/maps';
import { listMembersAction } from '../../actions';
import {
  listCanonAction,
  listCanonCollectionsAction,
} from '../../canon-actions';
import { listPlansAction } from '../../encounter-actions';
import type { CanonCollectionRow, CanonEntryRow } from '../../lib/canon';
import type { RandomTableRow } from '../../lib/random-tables';
import { partyWhereabouts } from '../../lib/world';
import { listMapsAction } from '../../map-actions';
import { listRandomTablesAction } from '../../random-table-actions';

export type Act = (
  p: Promise<{ ok: boolean; error?: string }>
) => Promise<void>;

export interface World {
  entries: CanonEntryRow[];
  byId: Map<string, CanonEntryRow>;
  shelves: CanonCollectionRow[];
  members: CampaignMemberRow[];
  maps: MapRow[];
  /** Staff only; empty for a player. */
  plans: PlanRow[];
  /** Staff only; empty for a player. */
  tables: RandomTableRow[];
  whereabouts: ReturnType<typeof partyWhereabouts>;
}

/**
 * Everything the World reads, read together: canon, the maps, and — for
 * staff — the encounter plans and random tables that hang off places.
 *
 * One read for the whole view rather than one per panel, because every part
 * of it is about the same few rows: the place you are looking at, who lives
 * there, and where on which map it is.
 */
export function useWorld(campaignId: string, isStaff: boolean) {
  const [data, setData] = useState<Omit<World, 'byId' | 'whereabouts'> | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [entries, shelves, maps, members, plans, tables] =
        await Promise.all([
          listCanonAction(campaignId),
          listCanonCollectionsAction(campaignId),
          listMapsAction(campaignId),
          isStaff ? listMembersAction(campaignId) : Promise.resolve([]),
          isStaff ? listPlansAction(campaignId) : Promise.resolve([]),
          isStaff
            ? listRandomTablesAction(campaignId).then(r => (r.ok ? r.data : []))
            : Promise.resolve([]),
        ]);
      setData({ entries, shelves, maps, members, plans, tables });
    } catch {
      setError('Failed to unroll the world.');
    }
  }, [campaignId, isStaff]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const world: World | null = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      byId: new Map(data.entries.map(e => [e.id, e])),
      whereabouts: partyWhereabouts(data.maps, data.entries),
    };
  }, [data]);

  const act: Act = useCallback(
    async p => {
      const res = await p;
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else setError(null);
      await refresh();
    },
    [refresh]
  );

  return { world, error, setError, refresh, act };
}
