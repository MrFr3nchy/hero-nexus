'use client';

import { Button } from '@heroui/react';
import { useState } from 'react';

import {
  EmptyState,
  Glyph,
  Marginalia,
  SectionCard,
  TomeScene,
} from '@/@shared/components/ui';
import type { MapPinRow } from '@/server/maps';
import type { LiveState } from '@/server/session';
import { spotlightMapAction } from '../../map-actions';

/**
 * The map the DM has put in front of everybody.
 *
 * Still not a battle grid — `MapPanel`'s standing decision holds, and there
 * are no tokens, no fog and no lattice here either. This is the other half of
 * what a table uses a map for: the DM says "look at this" and it is on five
 * screens, in the same place on each, because pins are fractions of the image
 * rather than pixels on somebody's monitor.
 *
 * A player sees only the pins they have been shown; the filtering is in
 * `listMaps`, which the live read goes through, not here.
 */
function Pin({
  pin,
  selected,
  onSelect,
}: {
  pin: MapPinRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={pin.label || 'A place'}
      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border p-1 transition-colors ${
        selected
          ? 'border-gold bg-gold text-bg'
          : 'border-gold/60 bg-surface/90 text-gold-strong hover:bg-surface dark:text-gold'
      }`}
    >
      <Glyph name="compass" size={12} />
    </button>
  );
}

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
  const [selected, setSelected] = useState<string | null>(null);
  const map = state.spotlight;

  if (!map) {
    return (
      <SectionCard title="On the table">
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

  const pin = map.pins.find(p => p.id === selected) ?? null;

  return (
    <SectionCard
      title={map.title || 'On the table'}
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
      bodyClassName="space-y-2"
    >
      <div className="relative overflow-hidden rounded-md border border-line">
        {/* Deliberately an <img>, as everywhere else that reads a campaign
            image: the file is served through a role-checked route, which
            next/image's optimiser cannot fetch on the server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/campaigns/${campaignId}/images/${map.imageId}`}
          alt={map.title || 'A map'}
          className="block w-full"
        />
        {map.pins.map(p => (
          <Pin
            key={p.id}
            pin={p}
            selected={p.id === selected}
            onSelect={() => setSelected(p.id === selected ? null : p.id)}
          />
        ))}
      </div>

      {pin ? (
        <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
          <p className="text-sm text-ink">{pin.label || 'A place'}</p>
          {pin.dmNote && (
            <p className="mt-0.5 text-xs text-ink-muted">{pin.dmNote}</p>
          )}
        </div>
      ) : (
        map.pins.length > 0 && (
          <Marginalia dash>tap a mark to see what it is</Marginalia>
        )
      )}
    </SectionCard>
  );
}
