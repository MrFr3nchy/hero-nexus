'use client';

import { Select, SelectItem } from '@heroui/react';
import { useState } from 'react';

import { DiceSpinner, Glyph } from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { LiveState } from '@/server/session';
import { flattenPlaces, pathLabel, placePath } from '../../lib/world';
import { PlaceDetail } from '../world/PlaceDetail';
import { useWorld } from '../world/useWorld';

const HERE = '__here__';

/**
 * Here: wherever the party is, at the table.
 *
 * The question a DM is asked mid-session is "who else is in this tavern?",
 * and the answer should not be three clicks into the campaign page. This
 * panel follows the journey — the last stop reached — and shows that
 * place's people, shops and fights; the picker looks somewhere else without
 * moving the party, and "where the party is" comes back.
 */
export function HerePanel({
  campaignId,
  viewerRole,
  state,
  onError,
}: {
  campaignId: string;
  viewerRole: CampaignRole;
  state: LiveState | null;
  onError: (message: string) => void;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';
  const { world, error, act } = useWorld(campaignId, isStaff);
  const [looking, setLooking] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  if (!world) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <DiceSpinner label="Finding the party…" />
    );
  }

  const hereId = world.whereabouts.here?.placeId ?? null;
  const placeId =
    looking && world.byId.has(looking)
      ? looking
      : hereId && world.byId.has(hereId)
        ? hereId
        : null;
  const place = placeId ? world.byId.get(placeId)! : null;
  const path = placePath(placeId, world.byId);
  const places = flattenPlaces(world.entries);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Glyph
          name={placeId === hereId && hereId ? 'banner' : 'compass'}
          size={14}
          className="text-gold"
        />
        <span className="min-w-0 flex-1 truncate text-ink">
          {place
            ? pathLabel(path)
            : world.whereabouts.here
              ? world.whereabouts.here.label
              : 'The party is nowhere on a map yet'}
        </span>
        {places.length > 0 && (
          <Select
            size="sm"
            aria-label="Look somewhere else"
            className="w-40"
            classNames={{ trigger: 'h-8 min-h-8' }}
            selectedKeys={[looking ?? HERE]}
            onSelectionChange={keys => {
              const key = String(Array.from(keys)[0] ?? HERE);
              setLooking(key === HERE ? null : key);
              setFocus(null);
            }}
          >
            {[
              <SelectItem key={HERE} textValue="Where the party is">
                Where the party is
              </SelectItem>,
              ...places.map(({ place: p, depth }) => (
                <SelectItem key={p.id} textValue={p.title || 'Somewhere'}>
                  <span style={{ paddingLeft: `${depth * 0.75}rem` }}>
                    {p.title || 'Somewhere'}
                  </span>
                </SelectItem>
              )),
            ]}
          </Select>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {place ? (
        <PlaceDetail
          campaignId={campaignId}
          world={world}
          place={place}
          isStaff={isStaff}
          live={state}
          act={act}
          onError={onError}
          onOpenPlace={id => {
            setLooking(id);
            setFocus(null);
          }}
          onOpenNpc={id => {
            const npc = world.byId.get(id);
            if (npc?.placeId) setLooking(npc.placeId);
            setFocus(id);
          }}
          onEdit={entry =>
            window.open(
              `/campaigns/${campaignId}#world/${
                entry?.kind === 'location'
                  ? `places/${entry.id}`
                  : entry
                    ? `entry/${entry.id}`
                    : 'places'
              }`,
              '_blank'
            )
          }
          focusNpc={focus}
          compact
        />
      ) : (
        <p className="text-ink-subtle">
          {isStaff
            ? 'Put the party on a mark for a place — "The party is here" on the map — and this shows who lives there.'
            : 'When the party arrives somewhere the DM has marked, who lives there shows here.'}
        </p>
      )}

      <a
        href={`/campaigns/${campaignId}#world/places${placeId ? `/${placeId}` : ''}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink"
      >
        <Glyph name="map" size={12} />
        Open in the World
      </a>
    </div>
  );
}
