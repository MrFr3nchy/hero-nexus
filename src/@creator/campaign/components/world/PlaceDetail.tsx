'use client';

import { Button, Input, Select, SelectItem, Switch } from '@heroui/react';
import { useMemo, useState, type ReactNode } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Glyph,
  Marginalia,
  Pill,
  Ribbon,
  TomeScene,
  type GlyphName,
} from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import {
  createCanonAction,
  setCanonVisibilityAction,
} from '../../canon-actions';
import { createClockAction } from '../../clock-actions';
import { createPlanAction, runPlanAction } from '../../encounter-actions';
import type { CanonEntryRow, CanonKind } from '../../lib/canon';
import { CLOCK_SEGMENTS } from '../../lib/clocks';
import { stopLine } from '../../lib/party-map';
import {
  isPlace,
  placeOfStop,
  placesInside,
  placesUnder,
  residentsOf,
  threadsAt,
} from '../../lib/world';
import { addJourneyStopAction, arriveAtStopAction } from '../../map-actions';
import { createQuestAction } from '../../quest-actions';
import { CanonCard } from '../CanonPanel';
import { ClockCard } from '../ClocksPanel';
import { ShopPanel } from '../screen/ShopPanel';
import { ClockLine, QuestLine } from './Lines';
import { PartyNotes } from './PartyNotes';
import { placeGlyph } from './PlaceChip';
import { QuickNpc } from './QuickNpc';
import type { Act, World } from './useWorld';

/** The tabs of a place's sheet, in the order they sit. */
export type PlaceTab =
  | 'glance'
  | 'people'
  | 'shops'
  | 'quests'
  | 'encounters'
  | 'clocks'
  | 'notes'
  | 'inside';

const TAB_DEFS: { key: PlaceTab; label: string; glyph: GlyphName }[] = [
  { key: 'glance', label: 'At a glance', glyph: 'compass' },
  { key: 'people', label: 'People', glyph: 'person' },
  { key: 'shops', label: 'Shops', glyph: 'coins' },
  { key: 'quests', label: 'Quests', glyph: 'scroll' },
  { key: 'encounters', label: 'Encounters', glyph: 'crossed-swords' },
  { key: 'clocks', label: 'Clocks', glyph: 'hourglass' },
  { key: 'notes', label: 'Party notes', glyph: 'quill' },
  { key: 'inside', label: 'Inside', glyph: 'castle' },
];

export type EditFn = (
  kind: CanonKind
) => (entry: CanonEntryRow | null, placeId?: string | null) => void;

/** A muted line under a tab, saying what the list is. */
const Caption = ({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-ink-subtle">
    <span>{children}</span>
    {aside}
  </div>
);

/** A thin form at the foot of a tab: one line, one button, one size. */
function AddLine({
  label,
  placeholder,
  button,
  onAdd,
  children,
}: {
  label: string;
  placeholder: string;
  button: string;
  onAdd: (text: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    await onAdd(text.trim());
    setBusy(false);
    setText('');
  };
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border border-dashed border-line p-2"
      onSubmit={e => {
        e.preventDefault();
        void submit();
      }}
    >
      <Input
        size="sm"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onValueChange={setText}
        className="min-w-40 flex-1"
        startContent={
          <Glyph name="plus" size={13} className="text-ink-subtle" />
        }
      />
      {children}
      <Button
        size="sm"
        type="submit"
        variant="flat"
        isDisabled={!text.trim()}
        isLoading={busy}
      >
        {button}
      </Button>
    </form>
  );
}

/**
 * One place, as a sheet beside its map: who lives in it, what is for sale,
 * the quests and clocks in it, the encounters planned there, what the party
 * wrote, and the places inside it — one tab each, so the place is read a
 * question at a time instead of all at once.
 *
 * Every tab shows, with its count, even empty: an empty tab is where the
 * next thing goes. The sheet opens on the first that has something in it —
 * for a player, on what the party knows of the place.
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
  ownMapCount = 0,
  onOpenOwnMap,
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
  onEdit: EditFn;
  /** Put a mark for this place (or an encounter in it) on the map in view. */
  onMarkOnMap?: (link: {
    kind: 'place' | 'encounter';
    id: string;
    label: string;
  }) => void;
  /** An NPC to open on arrival. */
  focusNpc: string | null;
  /** How many maps are drawn of this place, for "Open the map of …". */
  ownMapCount?: number;
  onOpenOwnMap?: () => void;
  /** In a session-screen panel: one column, and the prep forms left out. */
  compact?: boolean;
}) {
  const grid = compact ? 'grid gap-3' : 'grid gap-3';
  const { entries, maps, plans, whereabouts, byId } = world;
  const placeId = place?.id ?? null;
  const [everyoneInside, setEveryoneInside] = useState(false);
  const [ran, setRan] = useState<string | null>(null);
  const [openQuest, setOpenQuest] = useState<string | null>(null);
  const [segments, setSegments] = useState(6);

  const under = useMemo(
    () => (placeId ? placesUnder(placeId, entries) : new Set<string>()),
    [placeId, entries]
  );
  const inside = placesInside(placeId, entries);
  const parent = place?.placeId ? byId.get(place.placeId) : undefined;

  /* --- who lives here ---------------------------------------------------- */

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

  /* --- where the party is ------------------------------------------------ */

  // A mark for this place, for "The party is here" — preferring a map of the
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

  /* --- what is going on here --------------------------------------------- */

  const threads = useMemo(
    () =>
      placeId
        ? threadsAt(
            placeId,
            { quests: world.quests, clocks: world.clocks },
            byId,
            { inside: everyoneInside }
          )
        : null,
    [placeId, world.quests, world.clocks, byId, everyoneInside]
  );
  const shops = placeId ? world.shops.filter(s => s.placeId === placeId) : [];

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

  /* --- the tabs ----------------------------------------------------------- */

  const count: Record<PlaceTab, number> = {
    glance: 0,
    people: npcs.length,
    shops: shops.length,
    quests: threads?.quests.length ?? 0,
    encounters: isStaff ? fights.length : battleMarks.length,
    clocks: threads?.clocks.length ?? 0,
    notes: (place?.partyNotes.length ?? 0) + (isStaff && place?.dmBody ? 1 : 0),
    inside: inside.length + others.length,
  };
  const tabs = TAB_DEFS.filter(t => {
    if (!place) return t.key === 'inside' || t.key === 'people';
    if (t.key === 'glance') return !isStaff;
    // A player sees an encounter only as a battle mark on a map.
    if (t.key === 'encounters') return isStaff || battleMarks.length > 0;
    return true;
  });
  const firstFull =
    !isStaff && place
      ? 'glance'
      : (tabs.find(t => count[t.key] > 0)?.key ?? tabs[0].key);
  // A new place opens on its own first tab; somebody sent here opens People.
  const arrival: PlaceTab = focusNpc ? 'people' : firstFull;
  const [picked, setPicked] = useState<{ at: string | null; tab: PlaceTab }>({
    at: placeId,
    tab: arrival,
  });
  const tab: PlaceTab =
    picked.at === placeId && tabs.some(t => t.key === picked.tab)
      ? picked.tab
      : arrival;
  const pick = (t: PlaceTab) => setPicked({ at: placeId, tab: t });

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
        onEdit={() => onEdit(entry.kind)(entry)}
        onOpenPlace={id => onOpenPlace(id)}
        defaultOpen={entry.id === focusNpc}
      />
    </div>
  );

  const questWorld = {
    entries,
    byId,
    onOpenPlace: (id: string) => onOpenPlace(id),
  };

  const refreshWorld = () => act(Promise.resolve({ ok: true }));
  const questRow = (q: (typeof world.quests)[number], muted = false) => (
    <QuestLine
      key={q.id}
      campaignId={campaignId}
      quest={q}
      world={world}
      isStaff={isStaff}
      here={placeId}
      muted={muted}
      defaultOpen={q.id === openQuest}
      onOpenPlace={id => onOpenPlace(id)}
      onError={onError}
      refresh={refreshWorld}
    />
  );
  const clockRow = (c: (typeof world.clocks)[number]) => (
    <ClockLine key={c.id} clock={c} isStaff={isStaff} muted />
  );

  const fromAbove = threads?.fromAbove;
  const upTheRoad = (what: 'quests' | 'clocks') => {
    const list = what === 'quests' ? fromAbove?.quests : fromAbove?.clocks;
    if (!parent || !list || list.length === 0) return null;
    return (
      <div className="space-y-2 pt-2">
        <Caption>
          From up the road, in {parent.title || 'the place above'}
        </Caption>
        {what === 'quests'
          ? fromAbove!.quests.map(q => questRow(q, true))
          : fromAbove!.clocks.map(clockRow)}
      </div>
    );
  };

  /* --- the sheet ---------------------------------------------------------- */

  const kindLine = place
    ? [place.fields.type, parent ? `in ${parent.title || 'somewhere'}` : null]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <div className="@container flex flex-col">
      {/* ---- the place itself ---- */}
      <div className="space-y-2 border-b border-line px-4 pb-3 pt-4 @md:px-5">
        {place ? (
          <>
            {kindLine && (
              <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Glyph name={placeGlyph(place)} size={13} />
                {kindLine}
              </p>
            )}
            <h3 className="font-display text-[1.75rem] leading-tight text-ink">
              {place.title || 'Somewhere'}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {here && (
                <Ribbon tone="gold">
                  {isStaff ? 'The party is here' : 'You are here'}
                </Ribbon>
              )}
              {hereInside && <Pill tone="gold">The party is inside</Pill>}
              {headed && <Pill tone="arcane">Headed here</Pill>}
              {!here && whereabouts.been.has(place.id) && (
                <Pill tone="default">Been here</Pill>
              )}
              {isStaff && place.visibility !== 'shared' && (
                <Pill tone="arcane">Only you</Pill>
              )}
            </div>
            {place.partyBody.trim() ? (
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-ink">
                {place.partyBody}
              </p>
            ) : (
              isStaff && (
                <p className="text-sm text-ink-subtle">
                  Nothing written for the party yet.
                </p>
              )
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {ownMapCount > 0 && onOpenOwnMap && (
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<Glyph name="map" size={13} />}
                  onPress={onOpenOwnMap}
                >
                  Open the map of {place.title || 'it'}
                </Button>
              )}
              {isStaff && (
                <>
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => onEdit('location')(place)}
                  >
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
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <h3 className="flex items-center gap-2 font-display text-[1.75rem] leading-tight text-ink">
              <Glyph name="compass" size={20} className="text-gold" />
              The world
            </h3>
            <p className="text-sm text-ink-muted">
              {isStaff
                ? 'Every place in it, from the outside in. Pick one to see who lives there.'
                : 'Every place the party knows of. Pick one to see who the party has met there.'}
            </p>
          </>
        )}
      </div>

      <div
        role="tablist"
        aria-label={`What is in ${place?.title || 'the world'}`}
        className="flex gap-0.5 overflow-x-auto overflow-y-hidden border-b border-line px-2 @md:px-3"
      >
        {tabs.map(t => {
          const lit = t.key === tab;
          const n = count[t.key];
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={lit}
              onClick={() => pick(t.key)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-sm ${
                lit
                  ? 'border-gold font-medium text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Glyph
                name={t.glyph}
                size={13}
                className={lit ? 'text-gold-strong dark:text-gold' : ''}
              />
              {t.label}
              {n > 0 && (
                <span className="text-[0.7rem] tabular-nums text-ink-subtle">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="space-y-3 px-4 py-4 @md:px-5">
        {/* ---- at a glance: a player's first look ---- */}
        {tab === 'glance' && place && (
          <>
            {(threads?.quests.length ?? 0) > 0 && (
              <div className="space-y-2">
                {threads!.quests.map(q => questRow(q))}
              </div>
            )}
            {npcs.length > 0 && (
              <div className="space-y-1.5">
                <Caption>People the party has met here</Caption>
                <div className="flex flex-wrap gap-2">
                  {npcs.map(n => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        pick('people');
                        onOpenPlace(placeId, n.id);
                      }}
                      className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-3 text-sm text-ink hover:border-gold"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface-2 font-display text-xs">
                        {(n.title || '?').slice(0, 1)}
                      </span>
                      {n.title || 'Somebody'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {shops.length > 0 && (
              <div className="space-y-1.5">
                <Caption>Open for business</Caption>
                {shops.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick('shops')}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-3 py-2.5 text-left hover:border-gold"
                  >
                    <Glyph name="stall" size={16} className="text-ink-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">
                        {s.name || 'A shop'}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {[
                          s.keeper?.title,
                          `${s.stock.length} ${s.stock.length === 1 ? 'thing' : 'things'} for sale`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <PartyNotes
              campaignId={campaignId}
              entryId={place.id}
              notes={place.partyNotes}
              act={act}
              place
            />
            {(threads?.quests.length ?? 0) === 0 &&
              npcs.length === 0 &&
              shops.length === 0 && (
                <Marginalia>nobody has told you much about it yet</Marginalia>
              )}
          </>
        )}

        {/* ---- who lives here ---- */}
        {tab === 'people' && (
          <>
            <Caption
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
              {place
                ? isStaff
                  ? 'Who lives here'
                  : 'Who the party has met here'
                : 'Nowhere in particular'}
            </Caption>
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
          </>
        )}

        {/* ---- shops ---- */}
        {tab === 'shops' && place && (
          <>
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
          </>
        )}

        {/* ---- quests ---- */}
        {tab === 'quests' && place && threads && (
          <>
            {threads.quests.length === 0 ? (
              <p className="text-sm text-ink-subtle">
                {isStaff
                  ? 'No quest starts or runs through here yet.'
                  : 'Nothing the party has heard of happens here.'}
              </p>
            ) : (
              <div className="space-y-2">
                {threads.quests.map(q => questRow(q))}
              </div>
            )}
            {isStaff && !compact && (
              <AddLine
                label={`A quest that starts in ${place.title}`}
                placeholder="A quest starts here…"
                button="Write it"
                onAdd={async title => {
                  const res = await createQuestAction(campaignId, {
                    title,
                    placeId: place.id,
                  });
                  await act(Promise.resolve(res));
                  if (res.ok) setOpenQuest(res.data.id);
                }}
              />
            )}
            {upTheRoad('quests')}
          </>
        )}

        {/* ---- encounters ---- */}
        {tab === 'encounters' && place && (
          <>
            {isStaff && fights.length === 0 && (
              <p className="text-sm text-ink-subtle">
                No encounter is planned here yet.
              </p>
            )}
            {isStaff &&
              fights.map(plan => {
                const marked = maps.some(m =>
                  m.pins.some(p => p.encounter?.id === plan.id)
                );
                return (
                  <div
                    key={plan.id}
                    className="rounded-[var(--radius-card)] border border-line bg-surface p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium text-ink">
                        <Glyph
                          name="crossed-swords"
                          size={14}
                          className="text-ink-subtle"
                        />
                        {plan.name}
                      </p>
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
                        startContent={<Glyph name="die" size={13} />}
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
                          startContent={<Glyph name="target" size={13} />}
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
                        href={`/campaigns/${campaignId}#world/everywhere/encounters/${place.id}`}
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
                  <Glyph
                    name="crossed-swords"
                    size={13}
                    className="text-gold"
                  />
                  {pin.label || 'A fight'}
                  <span className="text-xs text-ink-subtle">
                    · {map.title || 'the map'}
                  </span>
                </p>
              ))}
            {isStaff && !compact && (
              <AddLine
                label={`An encounter in ${place.title}`}
                placeholder="Plan an encounter here…"
                button="Plan it"
                onAdd={async name => {
                  await act(
                    createPlanAction(campaignId, { name, placeId: place.id })
                  );
                }}
              />
            )}
          </>
        )}

        {/* ---- clocks ---- */}
        {tab === 'clocks' && place && threads && (
          <>
            {threads.clocks.length === 0 ? (
              <p className="text-sm text-ink-subtle">
                {isStaff
                  ? 'Nothing is ticking here yet.'
                  : 'Nothing you can see is closing in here.'}
              </p>
            ) : (
              <div className="rounded-[var(--radius-card)] border border-line bg-surface px-3">
                {threads.clocks.map(c => (
                  <ClockCard
                    key={c.id}
                    campaignId={campaignId}
                    clock={c}
                    isStaff={isStaff}
                    refresh={refreshWorld}
                    onError={onError}
                    world={questWorld}
                  />
                ))}
              </div>
            )}
            {isStaff && !compact && (
              <AddLine
                label={`A clock ticking in ${place.title}`}
                placeholder="A clock starts ticking here…"
                button="Wind it"
                onAdd={async title => {
                  await act(
                    createClockAction(campaignId, {
                      title,
                      segments,
                      placeId: place.id,
                    })
                  );
                }}
              >
                <Select
                  aria-label="Segments"
                  size="sm"
                  className="w-24"
                  selectedKeys={[String(segments)]}
                  onSelectionChange={keys => {
                    const key = Array.from(keys)[0];
                    if (key) setSegments(Number(key));
                  }}
                >
                  {CLOCK_SEGMENTS.map(s => (
                    <SelectItem key={String(s)} textValue={`${s}`}>
                      {`${s}`}
                    </SelectItem>
                  ))}
                </Select>
              </AddLine>
            )}
            {upTheRoad('clocks')}
          </>
        )}

        {/* ---- what the party wrote ---- */}
        {tab === 'notes' && place && (
          <>
            {isStaff && place.dmBody?.trim() && (
              <div className="status-hatch rounded-[var(--radius-card)] border border-dotted border-arcane/50 px-3 py-2.5">
                <p className="whitespace-pre-wrap text-sm text-ink">
                  {place.dmBody}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  Your prep · only you
                </p>
              </div>
            )}
            <PartyNotes
              campaignId={campaignId}
              entryId={place.id}
              notes={place.partyNotes}
              act={act}
              place
            />
            {visits.length > 0 && !compact && (
              <div className="space-y-1 pt-2">
                <Caption>When the party was here</Caption>
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
              </div>
            )}
          </>
        )}

        {/* ---- places inside, and the rest of the canon here ---- */}
        {tab === 'inside' && (
          <>
            {inside.length === 0 ? (
              !isStaff && (
                <p className="text-sm text-ink-subtle">
                  {place
                    ? 'Nowhere inside it the party knows of.'
                    : 'The party knows of nowhere yet.'}
                </p>
              )
            ) : (
              <ul className="grid gap-2 @lg:grid-cols-2">
                {inside.map(p => {
                  const isHere = whereabouts.here?.placeId === p.id;
                  const people = entries.filter(
                    e =>
                      e.kind === 'npc' &&
                      e.placeId &&
                      (e.placeId === p.id ||
                        placesUnder(p.id, entries).has(e.placeId))
                  ).length;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => onOpenPlace(p.id)}
                        className={`flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-left text-sm transition-colors hover:border-gold/60 ${
                          p.visibility === 'shared' || !isStaff
                            ? 'border-line bg-surface'
                            : 'status-hatch border-dotted border-arcane/50'
                        }`}
                      >
                        <Glyph
                          name={isHere ? 'banner' : placeGlyph(p)}
                          size={15}
                          className={isHere ? 'text-gold' : 'text-ink-subtle'}
                        />
                        <span className="min-w-0 flex-1 truncate text-ink">
                          {p.title || 'Somewhere'}
                        </span>
                        {people > 0 && (
                          <span className="text-xs tabular-nums text-ink-subtle">
                            {people} {people === 1 ? 'person' : 'people'}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {isStaff && !compact && (
              <AddLine
                label={place ? `A place inside ${place.title}` : 'A place'}
                placeholder={
                  place
                    ? 'A place inside it — The Dock Ward'
                    : 'The Sword Coast'
                }
                button="Add it"
                onAdd={async title => {
                  const res = await createCanonAction(campaignId, {
                    kind: 'location',
                    title,
                    dmBody: '',
                    partyBody: '',
                    placeId,
                  });
                  if (!res.ok) onError(res.error);
                  await act(Promise.resolve({ ok: true }));
                }}
              />
            )}
            {!place && inside.length === 0 && isStaff && (
              <EmptyState
                scene={<TomeScene />}
                title="A world with no places in it"
                description="Start with the biggest: a region, a kingdom, a valley. Then put the towns inside it, the districts inside those, and the people in their homes."
              />
            )}
            {others.length > 0 && (
              <div className="space-y-2 pt-2">
                <Caption>Also here</Caption>
                <div className={grid}>{others.map(card)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
