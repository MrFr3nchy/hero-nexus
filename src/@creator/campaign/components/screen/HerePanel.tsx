'use client';

import { Button, Select, SelectItem } from '@heroui/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  DiceSpinner,
  Glyph,
  StatusChip,
  StatusMark,
  type GlyphName,
} from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { LiveState } from '@/server/session';
import { setCanonVisibilityAction } from '../../canon-actions';
import { tickClockAction } from '../../clock-actions';
import { runPlanAction } from '../../encounter-actions';
import { ATTITUDE_LABEL } from '../../lib/standing';
import {
  flattenPlaces,
  pathLabel,
  placePath,
  residentsOf,
  threadsAt,
} from '../../lib/world';
import {
  addJourneyStopAction,
  addPlaceStopAction,
  arriveAtStopAction,
} from '../../map-actions';
import { placeGlyph } from '../world/PlaceChip';
import { QuickNpc } from '../world/QuickNpc';
import { useWorld } from '../world/useWorld';
import { ShopPanel } from './ShopPanel';

const HERE = '__here__';

/** A sub-heading inside the panel: the panel's own title bar is the heading. */
const Label = ({ children }: { children: ReactNode }) => (
  <p className="pt-1 text-[0.7rem] text-ink-subtle">{children}</p>
);

/** One line in the panel: a mark or a glyph, the words, and its controls. */
function Line({
  glyph,
  initial,
  title,
  sub,
  hidden = false,
  children,
}: {
  glyph?: GlyphName;
  initial?: string;
  title: string;
  sub?: string;
  /** Not shown to the party: the `hidden` state, hatched and dotted. */
  hidden?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`flex min-h-10 items-center gap-2 rounded-md border px-2 py-1.5 ${
        hidden
          ? 'status-hatch border-dotted border-ink-subtle'
          : 'border-line bg-surface'
      }`}
    >
      {initial ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-display text-xs text-ink">
          {initial.slice(0, 1)}
        </span>
      ) : (
        glyph && (
          <Glyph name={glyph} size={15} className="shrink-0 text-ink-subtle" />
        )
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{title}</span>
        {sub && (
          <span className="block truncate text-xs text-ink-muted">{sub}</span>
        )}
      </span>
      {hidden && <StatusMark kind="hidden" />}
      {children}
    </div>
  );
}

/**
 * Here: wherever the party is, at the table.
 *
 * The question a DM is asked mid-session is "who else is in this tavern?",
 * and the answer should not be three clicks into the campaign page. This
 * panel follows the journey — the last stop reached — and reads the place
 * as the evening needs it: who is in the room, what could start, what is
 * open, what is ticking (here and in the places above), and which quest step
 * happens here. The picker looks somewhere else without moving the party;
 * "The party is here" moves it.
 *
 * An operating surface (design rule 9): states are said in the status
 * language, a clock is a readout, and nothing here moves on its own.
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
  const { world, error, act, refresh } = useWorld(campaignId, isStaff);
  const [looking, setLooking] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  // The table changed — a clock ticked, the party moved: read the world
  // again, at most every couple of seconds.
  const last = useRef(0);
  useEffect(() => {
    if (!state) return;
    const now = Date.now();
    if (now - last.current < 2000) return;
    last.current = now;
    void refresh();
  }, [state, refresh]);

  if (!world) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <DiceSpinner label="Finding the party…" />
    );
  }

  const { byId, entries, maps } = world;
  const hereId = world.whereabouts.here?.placeId ?? null;
  const placeId =
    looking && byId.has(looking)
      ? looking
      : hereId && byId.has(hereId)
        ? hereId
        : null;
  const place = placeId ? byId.get(placeId)! : null;
  const path = placePath(placeId, byId);
  const places = flattenPlaces(entries);
  const atHere = placeId !== null && placeId === hereId;

  // A mark for this place, for "The party is here".
  const markFor = placeId
    ? (maps
        .flatMap(m =>
          m.pins
            .filter(p => p.canonEntryId === placeId)
            .map(p => ({ map: m, pin: p }))
        )
        .sort(
          (a, b) =>
            Number(b.map.placeId === place?.placeId) -
            Number(a.map.placeId === place?.placeId)
        )[0] ?? null)
    : null;
  const plannedHere = markFor
    ? (markFor.map.journey.find(s => s.planned && s.pinId === markFor.pin.id) ??
      null)
    : null;

  const people = placeId
    ? residentsOf(placeId, entries).filter(e => e.kind === 'npc')
    : [];
  const threads = placeId
    ? threadsAt(placeId, { quests: world.quests, clocks: world.clocks }, byId)
    : null;
  const clocks = threads
    ? [
        ...threads.clocks.filter(c => c.status === 'running'),
        ...threads.fromAbove.clocks,
      ]
    : [];
  const steps = placeId
    ? world.quests.flatMap(q =>
        q.objectives
          .filter(o => !o.done && o.placeId === placeId)
          .map(o => ({ quest: q, step: o }))
      )
    : [];
  const fights = placeId
    ? world.plans.filter(p => p.placeId === placeId && !p.ranAt)
    : [];
  const shops = placeId ? world.shops.filter(s => s.placeId === placeId) : [];

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Glyph
          name={atHere ? 'banner' : place ? placeGlyph(place) : 'compass'}
          size={14}
          className="text-gold"
        />
        <span className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] truncate text-xs text-ink-muted">
          {place
            ? pathLabel(path)
            : world.whereabouts.here
              ? world.whereabouts.here.label
              : 'The party is nowhere on a map yet'}
        </span>
        {atHere && <StatusChip kind="live" detail="the party is here" />}
        {isStaff && place && !atHere && (
          <Button
            size="sm"
            variant="flat"
            startContent={<Glyph name="banner" size={13} />}
            onPress={async () => {
              const planned =
                plannedHere ??
                world.placeStops.find(
                  s => s.planned && s.placeId === place.id
                ) ??
                null;
              await act(
                planned
                  ? arriveAtStopAction(planned.id)
                  : markFor
                    ? addJourneyStopAction(markFor.map.id, {
                        x: markFor.pin.x,
                        y: markFor.pin.y,
                        pinId: markFor.pin.id,
                      })
                    : addPlaceStopAction(campaignId, place.id)
              );
              setLooking(null);
            }}
          >
            The party is here
          </Button>
        )}
        {places.length > 0 && (
          <Select
            size="sm"
            aria-label="Look somewhere else"
            className="w-40"
            selectedKeys={[looking ?? HERE]}
            onSelectionChange={keys => {
              const key = String(Array.from(keys)[0] ?? HERE);
              setLooking(key === HERE ? null : key);
              setShopOpen(false);
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

      {!place ? (
        <p className="text-ink-subtle">
          {isStaff
            ? 'Put the party on a mark for a place — "The party is here" on the map — and this shows who lives there.'
            : 'When the party arrives somewhere the DM has marked, who lives there shows here.'}
        </p>
      ) : (
        <>
          {/* ---- who is in the room ---- */}
          <Label>In the room</Label>
          {people.length === 0 && (
            <p className="text-xs text-ink-subtle">Nobody lives here yet.</p>
          )}
          {people.map(n => (
            <Line
              key={n.id}
              initial={n.title || '?'}
              title={n.title || 'Somebody'}
              sub={[
                isStaff && n.attitude ? ATTITUDE_LABEL[n.attitude] : null,
                n.fields.role,
              ]
                .filter(Boolean)
                .join(' · ')}
              hidden={isStaff && n.visibility !== 'shared'}
            >
              {isStaff && n.visibility !== 'shared' && (
                <Button
                  size="sm"
                  variant="flat"
                  aria-label={`Show the party ${n.title}`}
                  startContent={<Glyph name="candle" size={13} />}
                  onPress={() =>
                    act(setCanonVisibilityAction(campaignId, n.id, 'shared'))
                  }
                >
                  Show the party
                </Button>
              )}
            </Line>
          ))}
          {isStaff && (
            <QuickNpc
              campaignId={campaignId}
              placeId={place.id}
              placeName={place.title}
              tables={world.tables}
              act={act}
              onError={onError}
              onMade={() => undefined}
            />
          )}

          {/* ---- what could start ---- */}
          {isStaff && fights.length > 0 && (
            <>
              <Label>Could start here</Label>
              {fights.map(plan => (
                <Line
                  key={plan.id}
                  glyph="crossed-swords"
                  title={plan.name || 'An encounter'}
                  sub={plan.lines.map(l => `${l.count} × ${l.name}`).join(', ')}
                  hidden
                >
                  <Button
                    size="sm"
                    color="primary"
                    isDisabled={plan.lines.length === 0}
                    startContent={<Glyph name="die" size={13} />}
                    onPress={async () => {
                      const res = await runPlanAction(campaignId, plan.id);
                      if (!res.ok) onError(res.error);
                      await refresh();
                    }}
                  >
                    Roll for initiative
                  </Button>
                </Line>
              ))}
            </>
          )}

          {/* ---- what is open ---- */}
          {shops.length > 0 && (
            <>
              <Label>Open for business</Label>
              {shopOpen && state ? (
                <div className="space-y-1">
                  <ShopPanel
                    campaignId={campaignId}
                    state={state}
                    isStaff={isStaff}
                    onError={onError}
                    placeId={place.id}
                    placeName={place.title}
                  />
                  <button
                    type="button"
                    onClick={() => setShopOpen(false)}
                    className="text-xs text-ink-subtle hover:text-ink"
                  >
                    Close the shop
                  </button>
                </div>
              ) : (
                shops.map(s => (
                  <Line
                    key={s.id}
                    glyph="stall"
                    title={s.name || 'A shop'}
                    sub={[
                      s.keeper && `kept by ${s.keeper.title}`,
                      `${s.stock.length} ${s.stock.length === 1 ? 'thing' : 'things'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    hidden={isStaff && s.visibility !== 'shared'}
                  >
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => setShopOpen(true)}
                    >
                      Open shop
                    </Button>
                  </Line>
                ))
              )}
            </>
          )}

          {/* ---- what is ticking, here and above ---- */}
          {clocks.length > 0 && (
            <>
              <Label>Ticking</Label>
              {clocks.map(c => (
                <Line
                  key={c.id}
                  glyph="hourglass"
                  title={c.title || 'A clock'}
                  sub={
                    c.placeId && c.placeId !== place.id
                      ? `from ${byId.get(c.placeId)?.title ?? 'up the road'}`
                      : undefined
                  }
                  hidden={isStaff && c.visibility !== 'shared'}
                >
                  <span
                    className={`font-medium tabular-nums ${
                      c.filled >= c.segments - 1 ? 'text-warning' : 'text-ink'
                    }`}
                  >
                    {c.filled}/{c.segments}
                  </span>
                  {isStaff && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="flat"
                      aria-label={`Tick ${c.title}`}
                      isDisabled={c.filled >= c.segments}
                      onPress={() => act(tickClockAction(campaignId, c.id, 1))}
                    >
                      <Glyph name="plus" size={13} />
                    </Button>
                  )}
                </Line>
              ))}
            </>
          )}

          {/* ---- the quest step that happens here ---- */}
          {steps.length > 0 && (
            <>
              <Label>Quest step here</Label>
              {steps.map(({ quest, step }) => (
                <Line
                  key={step.id}
                  glyph="scroll"
                  title={step.body}
                  sub={quest.title}
                  hidden={
                    isStaff &&
                    (quest.visibility === 'dm' || step.visibility === 'dm')
                  }
                />
              ))}
            </>
          )}
        </>
      )}

      <a
        href={`/campaigns/${campaignId}#world/here${placeId ? `/${placeId}` : ''}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 pt-1 text-xs text-ink-subtle hover:text-ink"
      >
        <Glyph name="map" size={12} />
        Open in the World
      </a>
    </div>
  );
}
