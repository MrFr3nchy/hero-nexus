'use client';

import { Button } from '@heroui/react';

import { EmptyState, SectionCard, TomeScene } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { spotlightMapAction } from '../../map-actions';
import { PartyMap } from '../PartyMap';

/**
 * The map the DM has put in front of everybody.
 *
 * The same `PartyMap` as the campaign page: the marks, the journey and fog of
 * war, in the same place on every screen because everything is a fraction of
 * the picture. At the table the DM drops "The party is here" as they go, and
 * on an open map a player can mark what they find without leaving the
 * screen. Fog is painted from the campaign page; here it only shows.
 *
 * A player sees only what they may: the filtering is in `listMaps`, which
 * the live read goes through, not here.
 */
export function SpotlightPanel({
  campaignId,
  state,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const map = state.spotlight;

  if (!map) {
    return (
      <SectionCard title="Shared map">
        <EmptyState
          scene={<TomeScene />}
          title="Nothing is up"
          description={
            isStaff
              ? 'Light a map from the Canon tab and it lands on every screen at once.'
              : 'When the DM puts a map up, it appears here.'
          }
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={map.title || 'A shared map'}
      description="Everyone at the table is looking at this."
      actions={
        isStaff && (
          <Button
            size="sm"
            variant="light"
            className="text-ink-muted"
            onPress={async () => {
              const res = await spotlightMapAction(map.id, false);
              if (!res.ok) onError(res.error);
              await refresh();
            }}
          >
            Put it away
          </Button>
        )
      }
    >
      <PartyMap
        campaignId={campaignId}
        map={map}
        isStaff={isStaff}
        refresh={refresh}
        onError={onError}
        compact
      />
    </SectionCard>
  );
}
