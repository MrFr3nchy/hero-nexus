'use client';

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { EmptyState, Glyph, TomeScene } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { CANON_KIND_GLYPHS, type CanonEntryRow } from '../../lib/canon';
import {
  flattenPlaces,
  isPlace,
  mapForPlace,
  pathLabel,
  placePath,
} from '../../lib/world';
import {
  createMapAction,
  setMapVisibilityAction,
  spotlightMapAction,
} from '../../map-actions';
import { ImagePicker } from '../ImagePicker';
import { PartyMap, type PendingLink } from '../PartyMap';
import { PlaceDetail } from './PlaceDetail';
import type { Act, World } from './useWorld';

/**
 * The Places tab: the map on one side, the place on the other.
 *
 * Opening a place shows its own map if it has one, or the nearest map above
 * it if not, so the region map's Waterdeep opens Waterdeep, and the Yawning
 * Portal — which has no map of its own — still shows on Waterdeep's. A mark
 * for a place opens the place; the breadcrumb walks back out.
 */
export function PlacesView({
  campaignId,
  world,
  placeId,
  focusNpc,
  focusMark,
  isStaff,
  live,
  act,
  onError,
  onOpenPlace,
  onOpenNpc,
  onEdit,
  refresh,
}: {
  campaignId: string;
  world: World;
  placeId: string | null;
  focusNpc: string | null;
  focusMark: string | null;
  isStaff: boolean;
  live: LiveState | null;
  act: Act;
  onError: (message: string) => void;
  onOpenPlace: (placeId: string | null, npcId?: string | null) => void;
  onOpenNpc: (entryId: string) => void;
  onEdit: (entry: CanonEntryRow | null, placeId?: string | null) => void;
  refresh: () => Promise<void>;
}) {
  const { entries, byId, maps, whereabouts } = world;
  const place = placeId ? (byId.get(placeId) ?? null) : null;
  const path = placePath(placeId, byId);

  const [view, setView] = useState<'map' | 'list'>('map');
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
    }, 80);
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

  /* --- jump to --------------------------------------------------------- */

  const jumpItems = useMemo(
    () =>
      entries
        .filter(e => isPlace(e) || e.kind === 'npc')
        .map(e => ({
          id: e.id,
          title: e.title || 'Untitled',
          kind: e.kind,
          where: pathLabel(placePath(isPlace(e) ? e.placeId : e.placeId, byId)),
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [entries, byId]
  );

  const here = whereabouts.here;
  const hereLabel = here
    ? here.placeId
      ? (byId.get(here.placeId)?.title ?? here.label)
      : here.label
    : null;

  return (
    <div className="@container space-y-4">
      {/* ---- where we are, and where the party is ---- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav
          aria-label="Where in the world"
          className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
        >
          <button
            type="button"
            onClick={() => open(null)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-2 ${
              placeId ? 'text-ink-muted' : 'text-ink'
            }`}
          >
            <Glyph name="compass" size={14} className="text-gold" />
            The world
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              <span className="text-ink-subtle">›</span>
              <button
                type="button"
                onClick={() => open(p.id)}
                className={`rounded px-1.5 py-0.5 hover:bg-surface-2 ${
                  i === path.length - 1 ? 'text-ink' : 'text-ink-muted'
                }`}
              >
                {p.title || 'Somewhere'}
              </button>
            </span>
          ))}
        </nav>
        <Autocomplete
          size="sm"
          aria-label="Jump to a place or a person"
          placeholder="Jump to a place or a person…"
          className="w-full sm:w-72"
          defaultItems={jumpItems}
          startContent={
            <Glyph name="magnifier" size={13} className="text-ink-subtle" />
          }
          selectedKey={null}
          onSelectionChange={key => {
            if (!key) return;
            const entry = byId.get(String(key));
            if (!entry) return;
            if (isPlace(entry)) open(entry.id);
            else onOpenNpc(entry.id);
          }}
        >
          {item => (
            <AutocompleteItem key={item.id} textValue={item.title}>
              <span className="flex items-center gap-2">
                <Glyph
                  name={CANON_KIND_GLYPHS[item.kind]}
                  size={13}
                  className="text-ink-subtle"
                />
                <span className="min-w-0">
                  <span className="block truncate">{item.title}</span>
                  {item.where && (
                    <span className="block truncate text-xs text-ink-subtle">
                      {item.where}
                    </span>
                  )}
                </span>
              </span>
            </AutocompleteItem>
          )}
        </Autocomplete>
      </div>

      {(here || whereabouts.headed.length > 0) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {here && (
            <button
              type="button"
              onClick={() =>
                here.placeId ? open(here.placeId) : openMap(here.mapId)
              }
              className="inline-flex items-center gap-1.5 text-ink hover:underline"
            >
              <Glyph name="banner" size={14} className="text-gold" />
              <span className="text-ink-muted">The party is in</span>
              {hereLabel}
            </button>
          )}
          {whereabouts.headed.slice(0, 3).map(h => (
            <button
              key={h.stopId}
              type="button"
              onClick={() => (h.placeId ? open(h.placeId) : openMap(h.mapId))}
              className="inline-flex items-center gap-1.5 text-ink hover:underline"
            >
              <Glyph name="arrow-right" size={14} className="text-arcane" />
              <span className="text-ink-muted">headed for</span>
              {h.placeId ? (byId.get(h.placeId)?.title ?? h.label) : h.label}
            </button>
          ))}
          {whereabouts.been.size > 0 && (
            <button
              type="button"
              onClick={() => setView('list')}
              className="text-ink-muted hover:text-ink hover:underline"
            >
              been to {whereabouts.been.size}{' '}
              {whereabouts.been.size === 1 ? 'place' : 'places'}
            </button>
          )}
        </p>
      )}

      {/* Side by side only when the pane is wide enough for both to be
          read; otherwise the map leads and the place follows under it. */}
      <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ---- the map, or the list ---- */}
        <div
          ref={stage}
          className="min-w-0 scroll-mt-4 space-y-3 @5xl:sticky @5xl:top-4 @5xl:self-start"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Show the places as"
              className="flex rounded-md border border-line p-0.5"
            >
              {(['map', 'list'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
                    view === v
                      ? 'bg-surface-2 text-ink'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Glyph name={v === 'map' ? 'map' : 'scroll'} size={13} />
                  {v === 'map' ? 'Map' : 'List'}
                </button>
              ))}
            </div>
            {view === 'map' && map && (
              <span className="min-w-0 truncate text-xs text-ink-muted">
                {map.title || 'A map'}
                {place && mapPlace && mapPlace.id !== place.id && (
                  <> — {place.title} is on it</>
                )}
              </span>
            )}
            {view === 'map' && ownMaps.length > 1 && (
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

          {view === 'list' ? (
            <PlaceList
              world={world}
              selected={placeId}
              onOpen={open}
              isStaff={isStaff}
            />
          ) : map ? (
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
                  ? 'Pin up a map under the Maps tab, or open a place and give it one.'
                  : 'When the DM has a map to show you, it will be here.'
              }
            />
          )}
        </div>

        {/* ---- the place ---- */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-2xl text-ink">
              <Glyph
                name={place ? 'castle' : 'compass'}
                size={20}
                className="text-gold"
              />
              {place ? place.title || 'Somewhere' : 'The world'}
            </h3>
            {isStaff && !place && (
              <Button size="sm" variant="flat" onPress={() => onEdit(null)}>
                New entry
              </Button>
            )}
          </div>
          <PlaceDetail
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
            onMarkOnMap={link => {
              setView('map');
              setPendingLink(link);
              // Under the place, the map is above the button pressed.
              stage.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Every place, indented: the view for finding one by name. */
function PlaceList({
  world,
  selected,
  onOpen,
  isStaff,
}: {
  world: World;
  selected: string | null;
  onOpen: (id: string) => void;
  isStaff: boolean;
}) {
  const flat = flattenPlaces(world.entries);
  const count = useMemo(() => {
    const out = new Map<string, number>();
    for (const e of world.entries) {
      if (e.kind === 'npc' && e.placeId) {
        out.set(e.placeId, (out.get(e.placeId) ?? 0) + 1);
      }
    }
    return out;
  }, [world.entries]);
  if (flat.length === 0) {
    return (
      <p className="text-sm text-ink-subtle">
        {isStaff
          ? 'No places yet. Add the first one beside this.'
          : 'The party knows of nowhere yet.'}
      </p>
    );
  }
  const { here, headed, been } = world.whereabouts;
  return (
    <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
      {flat.map(({ place, depth }) => {
        const isHere = here?.placeId === place.id;
        const isHeaded = headed.some(h => h.placeId === place.id);
        const n = count.get(place.id) ?? 0;
        return (
          <li key={place.id}>
            <button
              type="button"
              onClick={() => onOpen(place.id)}
              style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
              className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm hover:bg-surface-2 ${
                selected === place.id ? 'bg-surface-2' : ''
              }`}
            >
              <Glyph
                name={isHere ? 'banner' : isHeaded ? 'arrow-right' : 'castle'}
                size={14}
                className={
                  isHere
                    ? 'text-gold'
                    : isHeaded
                      ? 'text-arcane'
                      : 'text-ink-subtle'
                }
              />
              <span
                className={`min-w-0 flex-1 truncate ${
                  place.visibility === 'shared' || !isStaff
                    ? 'text-ink'
                    : 'text-arcane'
                }`}
              >
                {place.title || 'Somewhere'}
              </span>
              {been.has(place.id) && !isHere && (
                <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
                  been
                </span>
              )}
              {n > 0 && (
                <span className="text-xs tabular-nums text-ink-subtle">
                  {n}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
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
