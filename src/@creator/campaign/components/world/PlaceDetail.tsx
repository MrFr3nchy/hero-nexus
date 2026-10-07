'use client';

import { Button, Input, Switch } from '@heroui/react';
import { useMemo, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Glyph,
  Pill,
  TomeScene,
} from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import {
  createCanonAction,
  setCanonVisibilityAction,
} from '../../canon-actions';
import { createPlanAction, runPlanAction } from '../../encounter-actions';
import type { CanonEntryRow } from '../../lib/canon';
import { stopLine } from '../../lib/party-map';
import {
  isPlace,
  placeOfStop,
  placesInside,
  placesUnder,
  residentsOf,
} from '../../lib/world';
import { addJourneyStopAction, arriveAtStopAction } from '../../map-actions';
import { CanonCard } from '../CanonPanel';
import { ShopPanel } from '../screen/ShopPanel';
import { PartyNotes } from './PartyNotes';
import { QuickNpc } from './QuickNpc';
import type { Act, World } from './useWorld';

const Heading = ({
  glyph,
  children,
  aside,
}: {
  glyph: Parameters<typeof Glyph>[0]['name'];
  children: React.ReactNode;
  aside?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-1">
    <h3 className="flex items-center gap-2 font-display text-lg text-ink">
      <Glyph name={glyph} size={16} className="text-gold" />
      {children}
    </h3>
    {aside}
  </div>
);

/**
 * One place, and everything that is there: who lives in it, what is for
 * sale, the fights planned in it, the quests that run through it, the places
 * inside it, and when the party passed through.
 *
 * `place` null is the world itself: the outermost places, and anybody who
 * lives nowhere in particular.
 */
export function PlaceDetail({
  campaignId,
  world,
  place,
  isStaff,
  live,
  act,
  onError,
  onOpenPlace,
  onOpenNpc,
  onEdit,
  onMarkOnMap,
  focusNpc,
  compact = false,
}: {
  campaignId: string;
  world: World;
  place: CanonEntryRow | null;
  isStaff: boolean;
  live: LiveState | null;
  act: Act;
  onError: (message: string) => void;
  onOpenPlace: (placeId: string | null, npcId?: string | null) => void;
  onOpenNpc: (entryId: string) => void;
  onEdit: (entry: CanonEntryRow | null, placeId?: string | null) => void;
  /** Put a mark for this place (or a fight in it) on the map in view. */
  onMarkOnMap?: (link: {
    kind: 'place' | 'encounter';
    id: string;
    label: string;
  }) => void;
  /** An NPC to open on arrival. */
  focusNpc: string | null;
  /** In a session-screen panel: one column, and the prep forms left out. */
  compact?: boolean;
}) {
  // Measured against this column, not the window: beside a map it is half
  // the page, under one it is all of it.
  const grid = compact ? 'grid gap-3' : 'grid gap-3 @3xl:grid-cols-2';
  const { entries, maps, plans, whereabouts } = world;
  const placeId = place?.id ?? null;
  const [everyoneInside, setEveryoneInside] = useState(false);
  const [newPlace, setNewPlace] = useState('');
  const [newFight, setNewFight] = useState('');
  const [ran, setRan] = useState<string | null>(null);

  const under = useMemo(
    () => (placeId ? placesUnder(placeId, entries) : new Set<string>()),
    [placeId, entries]
  );
  const inside = placesInside(placeId, entries);

  const residents = placeId
    ? residentsOf(placeId, entries)
    : entries
        .filter(e => !isPlace(e) && !e.placeId)
        .sort((a, b) => a.title.localeCompare(b.title));
  const insideResidents =
    placeId && everyoneInside
      ? entries
          .filter(e => !isPlace(e) && e.placeId && under.has(e.placeId))
          .sort((a, b) => a.title.localeCompare(b.title))
      : [];
  const npcs = [...residents, ...insideResidents].filter(e => e.kind === 'npc');
  const others = residents.filter(e => e.kind !== 'npc');

  // A mark for this place, for "the party is here" — preferring a map of the
  // place it sits in, which is the map a DM would put the party on.
  const markFor = useMemo(() => {
    if (!placeId) return null;
    const candidates = maps.flatMap(m =>
      m.pins
        .filter(p => p.canonEntryId === placeId)
        .map(p => ({ map: m, pin: p }))
    );
    return (
      candidates.find(c => c.map.placeId === place?.placeId) ??
      candidates[0] ??
      null
    );
  }, [maps, placeId, place?.placeId]);
  const plannedHere = markFor
    ? (markFor.map.journey.find(s => s.planned && s.pinId === markFor.pin.id) ??
      null)
    : null;

  const here = whereabouts.here?.placeId === placeId && placeId !== null;
  const hereInside =
    !here && whereabouts.here?.placeId && under.has(whereabouts.here.placeId);
  const headed =
    placeId !== null && whereabouts.headed.some(h => h.placeId === placeId);

  // The fights planned here, and the battle marks the party can see.
  const fights = placeId ? plans.filter(p => p.placeId === placeId) : [];
  const battleMarks = maps.flatMap(m =>
    m.pins
      .filter(
        p =>
          p.battle &&
          (m.placeId === placeId ||
            (placeId !== null && p.canonEntryId === placeId))
      )
      .map(p => ({ map: m, pin: p }))
  );

  // Quests that run through here: a mark in this place, or on its map.
  const quests = useMemo(() => {
    if (!placeId) return [];
    const seen = new Map<string, string>();
    for (const m of maps) {
      for (const p of m.pins) {
        if (!p.quest) continue;
        if (m.placeId === placeId || p.canonEntryId === placeId) {
          seen.set(p.quest.id, p.quest.title);
        }
      }
    }
    return [...seen].map(([id, title]) => ({ id, title }));
  }, [maps, placeId]);

  // When the party was here, or anywhere inside here.
  const visits = useMemo(() => {
    if (!placeId) return [];
    const places = new Set(entries.filter(isPlace).map(e => e.id));
    const within = new Set([placeId, ...under]);
    return maps.flatMap(m => {
      const reached = m.journey.filter(s => !s.planned);
      return reached
        .filter(s => {
          const at = placeOfStop(s, m, places);
          return at !== null && within.has(at);
        })
        .map(s => ({ map: m, stop: s, of: reached.length }));
    });
  }, [maps, entries, placeId, under]);

  const peopleIn = (id: string) =>
    entries.filter(
      e =>
        e.kind === 'npc' &&
        e.placeId &&
        (e.placeId === id || placesUnder(id, entries).has(e.placeId))
    ).length;

  const card = (entry: CanonEntryRow) => (
    <div
      key={entry.id}
      id={`world-entry-${entry.id}`}
      className={
        entry.id === focusNpc
          ? 'rounded-[var(--radius-card)] ring-2 ring-gold/60'
          : ''
      }
    >
      <CanonCard
        campaignId={campaignId}
        entry={entry}
        entries={entries}
        shelves={world.shelves}
        members={world.members}
        isStaff={isStaff}
        act={act}
        onEdit={() => onEdit(entry)}
        onOpenPlace={id => onOpenPlace(id)}
        defaultOpen={entry.id === focusNpc}
      />
    </div>
  );

  return (
    <div className="@container space-y-6">
      {/* ---- the place itself ---- */}
      {place ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {here && <Pill tone="gold">The party is here</Pill>}
            {hereInside && <Pill tone="gold">The party is inside</Pill>}
            {headed && <Pill tone="arcane">Headed here</Pill>}
            {!here && whereabouts.been.has(place.id) && (
              <Pill tone="default">Been here</Pill>
            )}
            {isStaff &&
              (place.visibility === 'shared' ? (
                <Pill tone="gold">Party knows</Pill>
              ) : (
                <Pill tone="warning">Only you</Pill>
              ))}
            {place.fields.type && (
              <span className="text-xs text-ink-subtle">
                {place.fields.type}
              </span>
            )}
          </div>
          {place.partyBody.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-ink">
              {place.partyBody}
            </p>
          ) : (
            isStaff && (
              <p className="text-sm text-ink-subtle">
                Nothing written for the party yet.
              </p>
            )
          )}
          {isStaff && place.dmBody?.trim() && (
            <p className="whitespace-pre-wrap text-sm text-arcane">
              Only you: {place.dmBody}
            </p>
          )}
          {isStaff && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="flat" onPress={() => onEdit(place)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="flat"
                startContent={
                  place.visibility === 'shared' ? undefined : (
                    <Glyph name="candle" size={13} />
                  )
                }
                onPress={() =>
                  act(
                    setCanonVisibilityAction(
                      campaignId,
                      place.id,
                      place.visibility === 'shared' ? 'dm' : 'shared'
                    )
                  )
                }
              >
                {place.visibility === 'shared'
                  ? 'Hide again'
                  : 'Show the party'}
              </Button>
              {markFor ? (
                <>
                  {!here && (
                    <Button
                      size="sm"
                      variant="flat"
                      startContent={<Glyph name="banner" size={13} />}
                      onPress={() =>
                        act(
                          plannedHere
                            ? arriveAtStopAction(plannedHere.id)
                            : addJourneyStopAction(markFor.map.id, {
                                x: markFor.pin.x,
                                y: markFor.pin.y,
                                pinId: markFor.pin.id,
                              })
                        )
                      }
                    >
                      The party is here
                    </Button>
                  )}
                  {!plannedHere && !here && (
                    <Button
                      size="sm"
                      variant="light"
                      startContent={<Glyph name="arrow-right" size={13} />}
                      onPress={() =>
                        act(
                          addJourneyStopAction(markFor.map.id, {
                            x: markFor.pin.x,
                            y: markFor.pin.y,
                            pinId: markFor.pin.id,
                            planned: true,
                          })
                        )
                      }
                    >
                      Headed here
                    </Button>
                  )}
                </>
              ) : (
                maps.length > 0 &&
                onMarkOnMap && (
                  <Button
                    size="sm"
                    variant="light"
                    startContent={<Glyph name="compass" size={13} />}
                    onPress={() =>
                      onMarkOnMap({
                        kind: 'place',
                        id: place.id,
                        label: place.title,
                      })
                    }
                  >
                    Mark it on the map
                  </Button>
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          {isStaff
            ? 'Every place in this world, from the outside in. Pick one to see who lives there.'
            : 'Every place the party knows of. Pick one to see who the party has met there.'}
        </p>
      )}

      {/* ---- who lives here ---- */}
      <section className="space-y-3">
        <Heading
          glyph="person"
          aside={
            placeId &&
            under.size > 0 && (
              <Switch
                size="sm"
                isSelected={everyoneInside}
                onValueChange={setEveryoneInside}
              >
                <span className="text-xs text-ink-muted">
                  and everyone inside
                </span>
              </Switch>
            )
          }
        >
          {place ? 'People here' : 'Nowhere in particular'}
        </Heading>
        {npcs.length === 0 ? (
          <p className="text-sm text-ink-subtle">
            {place
              ? isStaff
                ? 'Nobody lives here yet.'
                : 'Nobody the party has met lives here.'
              : 'Everyone has a home.'}
          </p>
        ) : (
          <div className={grid}>{npcs.map(card)}</div>
        )}
        {isStaff && place && (
          <QuickNpc
            campaignId={campaignId}
            placeId={place.id}
            placeName={place.title}
            tables={world.tables}
            act={act}
            onError={onError}
            onMade={id => onOpenPlace(place.id, id)}
          />
        )}
      </section>

      {others.length > 0 && (
        <section className="space-y-3">
          <Heading glyph="tome">Also here</Heading>
          <div className={grid}>{others.map(card)}</div>
        </section>
      )}

      {/* ---- shops ---- */}
      {place && (
        <section className="space-y-3">
          <Heading glyph="coins">Shops</Heading>
          {live ? (
            <ShopPanel
              campaignId={campaignId}
              state={live}
              isStaff={isStaff}
              onError={onError}
              placeId={place.id}
              placeName={place.title}
              onOpenNpc={onOpenNpc}
            />
          ) : (
            <DiceSpinner label="Opening the shutters…" />
          )}
        </section>
      )}

      {/* ---- fights ---- */}
      {place && (isStaff || battleMarks.length > 0) && (
        <section className="space-y-3">
          <Heading glyph="crossed-swords">Fights</Heading>
          {isStaff &&
            fights.map(plan => {
              const marked = maps.some(m =>
                m.pins.some(p => p.encounter?.id === plan.id)
              );
              return (
                <div
                  key={plan.id}
                  className="rounded-md border border-line bg-surface p-3 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{plan.name}</p>
                    <span className="text-xs text-ink-subtle">
                      {plan.ranAt
                        ? plan.ranSession
                          ? `Fought in ${plan.ranSession}`
                          : 'Fought'
                        : 'Still to come'}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {plan.lines.length === 0
                      ? 'Nobody in it yet — add monsters under Encounters.'
                      : plan.lines
                          .map(l => `${l.count} × ${l.name}`)
                          .join(', ')}
                    {plan.maths.totalExperience > 0 &&
                      ` · ${plan.maths.totalExperience.toLocaleString()} XP`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      isDisabled={plan.lines.length === 0}
                      startContent={<Glyph name="crossed-swords" size={13} />}
                      onPress={async () => {
                        const res = await runPlanAction(campaignId, plan.id);
                        if (!res.ok) onError(res.error);
                        else setRan(plan.id);
                        await act(Promise.resolve({ ok: true }));
                      }}
                    >
                      Roll for initiative
                    </Button>
                    {!marked && maps.length > 0 && onMarkOnMap && (
                      <Button
                        size="sm"
                        variant="light"
                        startContent={<Glyph name="compass" size={13} />}
                        onPress={() =>
                          onMarkOnMap({
                            kind: 'encounter',
                            id: plan.id,
                            label: plan.name,
                          })
                        }
                      >
                        Mark the spot
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="light"
                      as="a"
                      href={`/campaigns/${campaignId}#encounters`}
                    >
                      Who is in it
                    </Button>
                  </div>
                  {ran === plan.id && (
                    <p className="mt-2 text-xs text-success">
                      The fight is on.{' '}
                      <a
                        href={`/campaigns/${campaignId}/screen`}
                        className="underline"
                      >
                        To the session screen
                      </a>
                    </p>
                  )}
                </div>
              );
            })}
          {!isStaff &&
            battleMarks.map(({ map, pin }) => (
              <p
                key={pin.id}
                className="flex items-center gap-2 text-sm text-ink-muted"
              >
                <Glyph name="crossed-swords" size={13} className="text-gold" />
                {pin.label || 'A fight'}
                <span className="text-xs text-ink-subtle">
                  · {map.title || 'the map'}
                </span>
              </p>
            ))}
          {isStaff && !compact && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async e => {
                e.preventDefault();
                if (!newFight.trim()) return;
                await act(
                  createPlanAction(campaignId, {
                    name: newFight.trim(),
                    placeId: place.id,
                  })
                );
                setNewFight('');
              }}
            >
              <Input
                size="sm"
                label="Plan a fight here"
                labelPlacement="outside"
                placeholder="Ambush in the alley"
                value={newFight}
                onValueChange={setNewFight}
                className="min-w-48 flex-1"
              />
              <Button
                size="sm"
                type="submit"
                variant="flat"
                isDisabled={!newFight.trim()}
              >
                Plan it
              </Button>
            </form>
          )}
        </section>
      )}

      {/* ---- quests ---- */}
      {quests.length > 0 && (
        <section className="space-y-2">
          <Heading glyph="scroll">Quests here</Heading>
          <ul className="space-y-1 text-sm">
            {quests.map(q => (
              <li key={q.id}>
                <a
                  href={`/campaigns/${campaignId}#quests`}
                  className="text-ink underline-offset-2 hover:underline"
                >
                  {q.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- places inside ---- */}
      <section className="space-y-3">
        <Heading glyph="castle">
          {place ? `Inside ${place.title || 'here'}` : 'Places'}
        </Heading>
        {inside.length === 0 ? (
          !isStaff && (
            <p className="text-sm text-ink-subtle">
              {place
                ? 'Nowhere inside it the party knows of.'
                : 'The party knows of nowhere yet.'}
            </p>
          )
        ) : (
          <ul className={compact ? 'grid gap-2' : 'grid gap-2 @lg:grid-cols-2'}>
            {inside.map(p => {
              const count = peopleIn(p.id);
              const isHere = whereabouts.here?.placeId === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPlace(p.id)}
                    className={`flex w-full items-center gap-2 rounded-md border bg-surface px-3 py-2 text-left text-sm transition-colors hover:border-gold/60 ${
                      p.visibility === 'shared'
                        ? 'border-line'
                        : 'border-arcane/40'
                    }`}
                  >
                    <Glyph
                      name={isHere ? 'banner' : 'castle'}
                      size={15}
                      className={isHere ? 'text-gold' : 'text-ink-subtle'}
                    />
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {p.title || 'Somewhere'}
                    </span>
                    {count > 0 && (
                      <span className="text-xs tabular-nums text-ink-subtle">
                        {count} {count === 1 ? 'person' : 'people'}
                      </span>
                    )}
                    {whereabouts.been.has(p.id) && !isHere && (
                      <Glyph
                        name="banner"
                        size={12}
                        className="text-ink-subtle"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {isStaff && !compact && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async e => {
              e.preventDefault();
              if (!newPlace.trim()) return;
              const res = await createCanonAction(campaignId, {
                kind: 'location',
                title: newPlace.trim(),
                dmBody: '',
                partyBody: '',
                placeId,
              });
              if (!res.ok) onError(res.error);
              setNewPlace('');
              await act(Promise.resolve({ ok: true }));
            }}
          >
            <Input
              size="sm"
              label={place ? `A place inside ${place.title}` : 'A place'}
              labelPlacement="outside"
              placeholder={place ? 'The Dock Ward' : 'The Sword Coast'}
              value={newPlace}
              onValueChange={setNewPlace}
              className="min-w-48 flex-1"
            />
            <Button
              size="sm"
              type="submit"
              variant="flat"
              isDisabled={!newPlace.trim()}
            >
              Add it
            </Button>
          </form>
        )}
        {!place && inside.length === 0 && isStaff && (
          <EmptyState
            scene={<TomeScene />}
            title="A world with no places in it"
            description="Start with the biggest: a region, a kingdom, a valley. Then put the towns inside it, the districts inside those, and the people in their homes."
          />
        )}
      </section>

      {/* ---- when the party was here ---- */}
      {visits.length > 0 && !compact && (
        <section className="space-y-2">
          <Heading glyph="banner">When the party was here</Heading>
          <ul className="space-y-1 text-sm">
            {visits.map(({ map, stop, of }) => (
              <li key={stop.id} className="text-ink-muted">
                <span className="text-ink">
                  {stop.label || `Stop ${stop.seq}`}
                </span>
                <span className="text-xs text-ink-subtle">
                  {' '}
                  · {stopLine(stop, of)} · {map.title || 'the map'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- what the party wrote ---- */}
      {place && (
        <section className="space-y-2">
          <PartyNotes
            campaignId={campaignId}
            entryId={place.id}
            notes={place.partyNotes}
            act={act}
            place
          />
        </section>
      )}
    </div>
  );
}
