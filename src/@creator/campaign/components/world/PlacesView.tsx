'use client';

import { Button, Input, Select, SelectItem } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { EmptyState, Glyph, Pill, TomeScene } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import type { CanonEntryRow } from '../../lib/canon';
import {
  mapForPlace,
  nearbyPlaces,
  threadsAt,
  type NearWhy,
} from '../../lib/world';
import type { Scope } from '../../lib/world-route';
import {
  createMapAction,
  promoteRumourAction,
  setMapVisibilityAction,
  spotlightMapAction,
} from '../../map-actions';
import { ImagePicker } from '../ImagePicker';
import { PartyMap, type PendingLink } from '../PartyMap';
import { AddToPlace } from './AddToPlace';
import { PlaceDetail, type EditFn } from './PlaceDetail';
import { placeGlyph } from './PlaceChip';
import type { Act, World } from './useWorld';

/**
 * Here and Nearby: the map is the page, and the place is a sheet beside it.
 *
 * Opening a place shows its own map if it has one, or the nearest map above
 * it if not, so the region map's Waterdeep opens Waterdeep, and the Yawning
 * Portal — which has no map of its own — still shows on Waterdeep's. A mark
 * for a place opens the place; the breadcrumb walks back out.
 *
 * Side by side when the pane is wide enough for both; on a narrower one the
 * sheet follows the map, and on a phone it rides up over the map's foot like
 * a sheet of paper laid on it.
 */
export function PlacesView({
  campaignId,
  world,
  scope,
  placeId,
  focusNpc,
  focusMark,
  isStaff,
  live,
  act,
  onError,
  onOpenPlace,
  onOpenNpc,
  onScope,
  onEdit,
  refresh,
  adding = false,
  onCloseAdd,
}: {
  campaignId: string;
  world: World;
  scope: Exclude<Scope, 'everywhere'>;
  placeId: string | null;
  focusNpc: string | null;
  focusMark: string | null;
  isStaff: boolean;
  live: LiveState | null;
  act: Act;
  onError: (message: string) => void;
  onOpenPlace: (placeId: string | null, npcId?: string | null) => void;
  onOpenNpc: (entryId: string) => void;
  onScope: (scope: Scope, placeId?: string | null) => void;
  onEdit: EditFn;
  refresh: () => Promise<void>;
  /** "Add to <place>" is open: it takes the sheet's place. */
  adding?: boolean;
  onCloseAdd?: () => void;
}) {
  const { byId, maps, whereabouts } = world;
  const place = placeId ? (byId.get(placeId) ?? null) : null;

  const stage = useRef<HTMLDivElement>(null);
  // A map picked by hand, for the place it was picked at: moving to another
  // place lets that place choose its own map again.
  const [picked, setPicked] = useState<{
    mapId: string;
    at: string | null;
  } | null>(null);
  const mapOverride = picked && picked.at === placeId ? picked.mapId : null;
  const setMapOverride = (mapId: string | null, at = placeId) =>
    setPicked(mapId ? { mapId, at } : null);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [newMap, setNewMap] = useState<{ imageId: string | null } | null>(null);

  // A mark sent here from elsewhere (`?mark=`) opens on the map holding it.
  useEffect(() => {
    if (!focusMark) return;
    const holder = maps.find(m => m.pins.some(p => p.id === focusMark));
    if (holder) setPicked({ mapId: holder.id, at: placeId });
    // Only on arrival: a later move to another place is the reader's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMark, maps.length]);

  // A new place, a new map: the override belonged to the last one.
  useEffect(() => {
    setPendingLink(null);
    setNewMap(null);
  }, [placeId]);

  // Bring the NPC that was asked for into view.
  useEffect(() => {
    if (!focusNpc) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`world-entry-${focusNpc}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusNpc, placeId]);

  const ownMaps = placeId ? maps.filter(m => m.placeId === placeId) : [];
  const override = mapOverride
    ? (maps.find(m => m.id === mapOverride) ?? null)
    : null;
  const map = override ?? mapForPlace(placeId, maps, byId);
  const mapPlace = map?.placeId ? byId.get(map.placeId) : null;

  const open = (id: string | null, npcId: string | null = null) => {
    setMapOverride(null);
    onOpenPlace(id, npcId);
  };
  const openMap = (mapId: string) => {
    const target = maps.find(m => m.id === mapId);
    if (!target) return;
    if (target.placeId) {
      onOpenPlace(target.placeId);
      setMapOverride(mapId, target.placeId);
    } else setMapOverride(mapId);
  };

  const here = whereabouts.here;
  const hereId = here?.placeId && byId.has(here.placeId) ? here.placeId : null;

  return (
    <div className="@container">
      <div className="flex flex-col gap-4 @6xl:flex-row @6xl:items-start">
        {/* ---- the map ---- */}
        <div
          ref={stage}
          className="min-w-0 flex-1 scroll-mt-4 space-y-3 @6xl:sticky @6xl:top-4"
        >
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            {map && (
              <span className="min-w-0 truncate text-xs text-ink-muted">
                <Glyph
                  name="map"
                  size={12}
                  className="mr-1 inline text-ink-subtle"
                />
                {map.title || 'A map'}
                {place && mapPlace && mapPlace.id !== place.id && (
                  <> — {place.title} is on it</>
                )}
              </span>
            )}
            {hereId && hereId !== placeId && (
              <button
                type="button"
                onClick={() => open(hereId)}
                className="inline-flex items-center gap-1 text-xs text-ink hover:underline"
              >
                <Glyph name="banner" size={12} className="text-gold" />
                The party is in {byId.get(hereId)?.title || 'a place'}
              </button>
            )}
            {ownMaps.length > 1 && (
              <Select
                size="sm"
                aria-label="Which map"
                className="ml-auto w-44"
                selectedKeys={map ? [map.id] : []}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  if (key) setMapOverride(String(key));
                }}
              >
                {ownMaps.map(m => (
                  <SelectItem key={m.id} textValue={m.title || 'A map'}>
                    {m.title || 'A map'}
                  </SelectItem>
                ))}
              </Select>
            )}
          </div>

          {map ? (
            <>
              {isStaff && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() =>
                      act(
                        setMapVisibilityAction(
                          campaignId,
                          map.id,
                          map.visibility === 'shared' ? 'dm' : 'shared'
                        )
                      )
                    }
                  >
                    {map.visibility === 'shared'
                      ? 'Hide the map again'
                      : 'Show the party the map'}
                  </Button>
                  <Button
                    size="sm"
                    variant={map.spotlighted ? 'solid' : 'flat'}
                    color={map.spotlighted ? 'primary' : 'default'}
                    onPress={() =>
                      act(spotlightMapAction(map.id, !map.spotlighted))
                    }
                  >
                    {map.spotlighted ? 'Put it away' : 'Look at this'}
                  </Button>
                  {place && ownMaps.length === 0 && !newMap && (
                    <Button
                      size="sm"
                      variant="light"
                      startContent={<Glyph name="plus" size={13} />}
                      onPress={() => setNewMap({ imageId: null })}
                    >
                      A map of {place.title}
                    </Button>
                  )}
                </div>
              )}
              {newMap && place && (
                <NewMapOf
                  campaignId={campaignId}
                  place={place}
                  onDone={async () => {
                    setNewMap(null);
                    setMapOverride(null);
                    await refresh();
                  }}
                  onError={onError}
                />
              )}
              {pendingLink && (
                <p
                  role="status"
                  className="rounded-md border border-gold/40 bg-gold/[0.06] px-3 py-2 text-sm text-ink"
                >
                  Tap the map where {pendingLink.label || 'it'} is.{' '}
                  <button
                    type="button"
                    onClick={() => setPendingLink(null)}
                    className="text-xs text-ink-subtle underline-offset-2 hover:underline"
                  >
                    never mind
                  </button>
                </p>
              )}
              <PartyMap
                key={map.id}
                campaignId={campaignId}
                map={map}
                isStaff={isStaff}
                refresh={refresh}
                onError={onError}
                focusMark={
                  map.pins.some(p => p.id === focusMark) ? focusMark : null
                }
                pendingLink={pendingLink}
                onPlacedLink={() => setPendingLink(null)}
                onOpenPlace={id => open(id)}
                onOpenMap={openMap}
              />
            </>
          ) : isStaff && place ? (
            newMap ? (
              <NewMapOf
                campaignId={campaignId}
                place={place}
                onDone={async () => {
                  setNewMap(null);
                  await refresh();
                }}
                onError={onError}
              />
            ) : (
              <EmptyState
                scene={<TomeScene />}
                title={`No map of ${place.title || 'this place'}`}
                description="Pin up a picture of it, and mark where everybody lives."
                action={
                  <Button
                    size="sm"
                    color="primary"
                    onPress={() => setNewMap({ imageId: null })}
                  >
                    Pin up a map
                  </Button>
                }
              />
            )
          ) : (
            <EmptyState
              scene={<TomeScene />}
              title="No map yet"
              description={
                isStaff
                  ? 'Pin up a map under Everywhere › Maps, or open a place and give it one.'
                  : 'When the DM has a map to show you, it will be here.'
              }
            />
          )}
        </div>

        {/* ---- the place, as a sheet ---- */}
        <aside
          aria-label={place?.title || 'The world'}
          className="relative z-10 min-w-0 overflow-hidden rounded-[14px] border border-line bg-surface [box-shadow:var(--shadow-card)] max-sm:-mx-1 max-sm:-mt-14 max-sm:rounded-b-none max-sm:rounded-t-[18px] @6xl:w-[440px] @6xl:shrink-0"
        >
          <div aria-hidden className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-line" />
          </div>
          {adding ? (
            <AddToPlace
              campaignId={campaignId}
              world={world}
              placeId={placeId}
              act={act}
              onClose={() => onCloseAdd?.()}
              onOpenPlace={id => {
                onCloseAdd?.();
                open(id);
              }}
              onOpenEntry={id => {
                onCloseAdd?.();
                onOpenNpc(id);
              }}
              onMarkOnMap={
                map
                  ? link => {
                      setPendingLink(link);
                      stage.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }
                  : undefined
              }
            />
          ) : scope === 'nearby' ? (
            <NearbySheet
              campaignId={campaignId}
              world={world}
              placeId={placeId}
              mapId={map?.id ?? null}
              isStaff={isStaff}
              act={act}
              onOpen={id => onScope('here', id)}
            />
          ) : (
            <PlaceDetail
              key={placeId ?? 'world'}
              campaignId={campaignId}
              world={world}
              place={place}
              isStaff={isStaff}
              live={live}
              act={act}
              onError={onError}
              onOpenPlace={open}
              onOpenNpc={onOpenNpc}
              onEdit={onEdit}
              focusNpc={focusNpc}
              ownMapCount={
                ownMaps.length > 0 && map?.placeId !== placeId
                  ? ownMaps.length
                  : 0
              }
              onOpenOwnMap={() => ownMaps[0] && openMap(ownMaps[0].id)}
              onMarkOnMap={link => {
                setPendingLink(link);
                // Under the place, the map is above the button pressed.
                stage.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

const WHY: Record<NearWhy, string> = {
  headed: 'where the party is headed',
  around: 'around it',
  inside: 'inside it',
  'next door': 'next door',
};

/**
 * Nearby: where the party could plausibly be next session, and what is
 * waiting there. No distances — the world has places inside places, not
 * roads — so each says why it is near instead.
 */
function NearbySheet({
  campaignId,
  world,
  placeId,
  mapId,
  isStaff,
  act,
  onOpen,
}: {
  campaignId: string;
  world: World;
  placeId: string | null;
  /** The map in view: its rumours are guesses near here. */
  mapId: string | null;
  isStaff: boolean;
  act: Act;
  onOpen: (placeId: string) => void;
}) {
  const { byId, entries, whereabouts } = world;
  const place = placeId ? byId.get(placeId) : null;
  const { near, further } = nearbyPlaces(placeId, entries, whereabouts);
  const [showFurther, setShowFurther] = useState(false);
  // What the party has guessed at on the map in view, not yet made real.
  const guesses = (world.maps.find(m => m.id === mapId)?.pins ?? []).filter(
    p => p.kind === 'rumour' && !p.canonEntryId
  );

  const row = (id: string, why: string | null) => {
    const p = byId.get(id);
    if (!p) return null;
    const people = entries.filter(
      e => e.kind === 'npc' && e.placeId === id
    ).length;
    const t = threadsAt(
      id,
      { quests: world.quests, clocks: world.clocks },
      byId
    );
    const isHere = whereabouts.here?.placeId === id;
    const facts = [
      isHere ? 'the party is here' : why,
      people > 0 && `${people} ${people === 1 ? 'person' : 'people'}`,
      t.quests.length > 0 &&
        `${t.quests.length} ${t.quests.length === 1 ? 'quest' : 'quests'}`,
      t.clocks.length > 0 &&
        `${t.clocks.length} ${t.clocks.length === 1 ? 'clock' : 'clocks'}`,
    ].filter(Boolean);
    return (
      <li key={id}>
        <button
          type="button"
          onClick={() => onOpen(id)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 text-left hover:border-gold/60 ${
            isStaff && p.visibility !== 'shared'
              ? 'status-hatch border-dotted border-arcane/50'
              : 'border-line bg-bg'
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2">
            <Glyph
              name={isHere ? 'banner' : placeGlyph(p)}
              size={15}
              className={isHere ? 'text-gold' : 'text-ink-muted'}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">
              {p.title || 'Somewhere'}
            </span>
            <span className="block truncate text-xs text-ink-muted">
              {facts.join(' · ')}
            </span>
          </span>
          {isStaff && p.visibility !== 'shared' && (
            <Pill tone="arcane">Only you</Pill>
          )}
          <Glyph name="chevron-right" size={14} className="text-ink-subtle" />
        </button>
      </li>
    );
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-1 border-b border-line px-4 pb-3 pt-4 @md:px-5">
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Glyph name="compass" size={13} />
          {place ? `Around ${place.title || 'here'}` : 'Around the party'}
        </p>
        <h3 className="font-display text-[1.6rem] leading-tight text-ink">
          {place ? `Near ${place.title || 'here'}` : 'The world, near and far'}
        </h3>
        <p className="text-sm text-ink-muted">
          Where the party could end up next, and what is waiting there.
        </p>
      </div>
      <div className="space-y-3 px-4 py-4 @md:px-5">
        {near.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            Nowhere else is written down yet.
          </p>
        ) : (
          <ul className="space-y-2">{near.map(n => row(n.id, WHY[n.why]))}</ul>
        )}
        {further.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowFurther(v => !v)}
              className="flex items-center gap-1 text-xs text-ink-subtle hover:text-ink"
            >
              <Glyph
                name={showFurther ? 'chevron-up' : 'chevron-down'}
                size={12}
              />
              Further out ({further.length})
            </button>
            {showFurther && (
              <ul className="space-y-2">{further.map(id => row(id, null))}</ul>
            )}
          </div>
        )}
        {guesses.length > 0 && (
          <div className="space-y-2">
            <p className="pt-1 text-xs text-ink-subtle">Rumours on the map</p>
            <ul className="space-y-2">
              {guesses.map(g => (
                <li
                  key={g.id}
                  className="flex min-h-11 items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-arcane/60 bg-bg px-3 py-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-arcane text-arcane">
                    <Glyph name="question" size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">
                      {g.label === 'New mark'
                        ? 'A rumour'
                        : g.label || 'A rumour'}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {[g.byName ? `${g.byName}’s rumour` : 'A rumour', g.note]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {isStaff && (
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={async () => {
                        const res = await promoteRumourAction(campaignId, g.id);
                        await act(Promise.resolve(res));
                        if (res.ok) onOpen(res.data.id);
                      }}
                    >
                      Make it real
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** Pin up a map that shows this place. */
function NewMapOf({
  campaignId,
  place,
  onDone,
  onError,
}: {
  campaignId: string;
  place: CanonEntryRow;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [imageId, setImageId] = useState<string | null>(null);
  const [title, setTitle] = useState(place.title);
  return (
    <div className="space-y-3 rounded-md border border-line bg-surface-2/50 p-3">
      <ImagePicker
        campaignId={campaignId}
        value={imageId}
        onChange={setImageId}
        label={`A map of ${place.title}`}
      />
      <div className="flex flex-wrap items-end gap-2">
        <Input
          size="sm"
          label="Title"
          labelPlacement="outside"
          value={title}
          onValueChange={setTitle}
          className="min-w-40 flex-1"
        />
        <Button
          size="sm"
          color="primary"
          isDisabled={!imageId}
          onPress={async () => {
            if (!imageId) return;
            const res = await createMapAction(
              campaignId,
              imageId,
              title,
              place.id
            );
            if (!res.ok) onError(res.error);
            await onDone();
          }}
        >
          Pin it up
        </Button>
        <Button size="sm" variant="light" onPress={() => onDone()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
