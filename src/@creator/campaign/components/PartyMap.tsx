'use client';

import {
  Button,
  Input,
  Select,
  SelectItem,
  Slider,
  Switch,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ControlRow, Glyph, Marginalia } from '@/@shared/components/ui';
import type { MapPinRow, MapRow } from '@/server/maps';
import { listCanonAction } from '../canon-actions';
import { listSessionsAction } from '../chronicle-actions';
import { listJournalsAction } from '../journal-actions';
import {
  FOG_COLS,
  FOG_ROWS,
  MARK_KINDS,
  MARK_KIND_META,
  cellsInBrush,
  fogRuns,
  journeyUpTo,
  stopLine,
  trailPoints,
  type MarkKind,
} from '../lib/party-map';
import {
  addJourneyStopAction,
  addPinAction,
  deletePinAction,
  removeJourneyStopAction,
  renameJourneyStopAction,
  revealMapCellsAction,
  setMapFogAction,
  setMarksOpenAction,
  updatePinAction,
} from '../map-actions';
import { listQuestsAction } from '../quest-actions';

type Mode = 'look' | 'mark' | 'stop' | 'reveal' | 'cover';

/** Something elsewhere in the record a new mark should point at. */
export interface PendingLink {
  kind: 'quest' | 'session' | 'journal';
  id: string;
}

const BRUSHES = [
  { id: 's', label: 'Small', r: 0.035 },
  { id: 'm', label: 'Medium', r: 0.07 },
  { id: 'l', label: 'Large', r: 0.13 },
] as const;

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<boolean>;

/**
 * The party's map: the picture, the marks on it, the journey across it and
 * fog of war over it — one widget, on the campaign page and on the session
 * screen alike, so both say the same thing about the same map.
 *
 * Everything is placed in fractions of the picture and multiplied by its
 * rendered size only when drawn.
 */
export function PartyMap({
  campaignId,
  map,
  isStaff,
  refresh,
  onError,
  compact = false,
  focusMark = null,
  pendingLink = null,
  onPlacedLink,
}: {
  campaignId: string;
  map: MapRow;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
  /** On the session screen: fewer controls, same map. */
  compact?: boolean;
  /** Open this mark's card on arrival (a chip elsewhere pointed here). */
  focusMark?: string | null;
  /** "Put it on the map": the next mark placed links to this. */
  pendingLink?: PendingLink | null;
  onPlacedLink?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(pendingLink ? 'mark' : 'look');
  const [brush, setBrush] = useState<(typeof BRUSHES)[number]['id']>('m');
  const [selected, setSelected] = useState<string | null>(focusMark);
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const [aspect, setAspect] = useState(0.75);
  const [stroke, setStroke] = useState<Set<number> | null>(null);
  const [upTo, setUpTo] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusMark) setSelected(focusMark);
  }, [focusMark]);
  useEffect(() => {
    if (pendingLink) setMode('mark');
  }, [pendingLink]);

  const act: Act = useCallback(
    async p => {
      const res = await p;
      if (!res.ok) onError(res.error ?? 'Something went wrong.');
      await refresh();
      return res.ok;
    },
    [onError, refresh]
  );

  const canMark = isStaff || (map.marksOpen && map.visibility === 'shared');
  const journey = map.journey;
  const last = journey.length;
  const showing = upTo === null ? last : Math.min(upTo, last);
  const stops = journeyUpTo(journey, showing);
  const here = stops[stops.length - 1] ?? null;

  // What is revealed, with the stroke being painted shown at once.
  const revealed = useMemo(() => {
    const set = new Set(map.revealed);
    if (stroke) {
      for (const c of stroke) {
        if (mode === 'reveal') set.add(c);
        else set.delete(c);
      }
    }
    return set;
  }, [map.revealed, stroke, mode]);
  const runs = useMemo(
    () => (map.fogged ? fogRuns(revealed) : []),
    [map.fogged, revealed]
  );

  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  const radius = BRUSHES.find(b => b.id === brush)!.r;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'reveal' && mode !== 'cover') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    setStroke(new Set(cellsInBrush(p.x, p.y, radius, aspect)));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!stroke) return;
    const p = at(e);
    const next = new Set(stroke);
    for (const c of cellsInBrush(p.x, p.y, radius, aspect)) next.add(c);
    if (next.size !== stroke.size) setStroke(next);
  };
  const onPointerUp = async () => {
    if (!stroke) return;
    const cells = [...stroke];
    const reveal = mode === 'reveal';
    await act(revealMapCellsAction(map.id, cells, reveal));
    setStroke(null);
  };

  const onClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== 'mark' && mode !== 'stop') return;
    const p = at(e);
    if (mode === 'mark') {
      const link = pendingLink
        ? {
            [pendingLink.kind === 'quest'
              ? 'questId'
              : pendingLink.kind === 'session'
                ? 'sessionId'
                : 'journalId']: pendingLink.id,
          }
        : {};
      const res = await addPinAction(campaignId, map.id, {
        x: p.x,
        y: p.y,
        label: 'New mark',
        visibility: isStaff ? 'dm' : 'shared',
        ...link,
      });
      if (!res.ok) onError(res.error);
      else {
        setSelected(res.data.id);
        if (pendingLink) onPlacedLink?.();
      }
      await refresh();
    } else {
      const res = await addJourneyStopAction(map.id, { x: p.x, y: p.y });
      if (!res.ok) onError(res.error);
      else {
        // Open it, so the DM can name the place while it is fresh.
        setSelected(null);
        setSelectedStop(res.data.id);
      }
      await refresh();
      setUpTo(null);
    }
    setMode('look');
  };

  const pin = map.pins.find(p => p.id === selected) ?? null;
  const stop = journey.find(s => s.id === selectedStop) ?? null;

  const modeHint: Record<Mode, string> = {
    look: '',
    mark: pendingLink
      ? 'Tap where it happened.'
      : 'Tap the map where the mark goes.',
    stop: 'Tap where the party is now.',
    reveal: 'Drag over what the party can see.',
    cover: 'Drag over what should go back into fog.',
  };

  return (
    <div className="space-y-3">
      {/* The tools: what a tap on the picture does next. */}
      {(canMark || isStaff) && (
        <div className="flex flex-wrap items-center gap-2">
          {canMark && (
            <Button
              size="sm"
              variant={mode === 'mark' ? 'solid' : 'flat'}
              color={mode === 'mark' ? 'primary' : 'default'}
              startContent={<Glyph name="compass" size={14} />}
              onPress={() => setMode(mode === 'mark' ? 'look' : 'mark')}
            >
              Mark a place
            </Button>
          )}
          {isStaff && (
            <Button
              size="sm"
              variant={mode === 'stop' ? 'solid' : 'flat'}
              color={mode === 'stop' ? 'primary' : 'default'}
              startContent={<Glyph name="banner" size={14} />}
              onPress={() => setMode(mode === 'stop' ? 'look' : 'stop')}
            >
              The party is here
            </Button>
          )}
          {isStaff && map.fogged && !compact && (
            <>
              <Button
                size="sm"
                variant={mode === 'reveal' ? 'solid' : 'flat'}
                color={mode === 'reveal' ? 'primary' : 'default'}
                onPress={() => setMode(mode === 'reveal' ? 'look' : 'reveal')}
              >
                Reveal
              </Button>
              <Button
                size="sm"
                variant={mode === 'cover' ? 'solid' : 'flat'}
                color={mode === 'cover' ? 'primary' : 'default'}
                onPress={() => setMode(mode === 'cover' ? 'look' : 'cover')}
              >
                Fog again
              </Button>
              {(mode === 'reveal' || mode === 'cover') && (
                <div
                  className="flex gap-1"
                  role="radiogroup"
                  aria-label="Brush"
                >
                  {BRUSHES.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={brush === b.id}
                      onClick={() => setBrush(b.id)}
                      className={`h-8 rounded-md border px-2 text-xs ${
                        brush === b.id
                          ? 'border-gold bg-gold text-bg'
                          : 'border-line text-ink-muted hover:text-ink'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {modeHint[mode] && (
            <span className="text-xs text-ink-muted">{modeHint[mode]}</span>
          )}
        </div>
      )}

      <div
        ref={box}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`relative touch-none select-none overflow-hidden rounded-[var(--radius-card)] border border-line ${
          mode === 'look' ? '' : 'cursor-crosshair'
        }`}
      >
        {/* Deliberately an <img>: the file is served through a role-checked
            route, which next/image's optimiser cannot fetch on the server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/campaigns/${campaignId}/images/${map.imageId}`}
          alt={map.title || 'Map'}
          className="block w-full"
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget;
            if (img.naturalWidth)
              setAspect(img.naturalHeight / img.naturalWidth);
          }}
        />

        {/* Fog of war: parchment over what has not been revealed. Staff see
            through it, hatched; the party sees parchment. */}
        {map.fogged && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${FOG_COLS} ${FOG_ROWS}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* One path, not a rect per run: separate rectangles leave
                hairline seams where their antialiased edges meet. */}
            <path
              d={runs
                .map(
                  r =>
                    `M${r.from} ${r.row}h${r.to - r.from}v1h${r.from - r.to}z`
                )
                .join('')}
              fill="var(--surface-2)"
              opacity={isStaff ? 0.6 : 1}
            />
          </svg>
        )}

        {/* The journey: a dashed trail through the stops, in order. */}
        {stops.length > 1 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline
              points={trailPoints(stops)}
              fill="none"
              stroke="var(--gold)"
              strokeWidth={3}
              strokeDasharray="6 5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}

        {map.pins.map(p => (
          <MarkButton
            key={p.id}
            pin={p}
            selected={p.id === selected}
            onSelect={() => {
              if (mode !== 'look') return;
              setSelectedStop(null);
              setSelected(p.id === selected ? null : p.id);
            }}
          />
        ))}

        {stops.map(s => {
          const isHere = s.id === here?.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-label={
                isHere ? `The party is here: stop ${s.seq}` : `Stop ${s.seq}`
              }
              onClick={e => {
                e.stopPropagation();
                if (mode !== 'look') return;
                setSelected(null);
                setSelectedStop(s.id === selectedStop ? null : s.id);
              }}
              style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border font-mono font-semibold tabular-nums shadow ${
                isHere
                  ? 'h-8 min-w-8 border-2 border-gold bg-bg px-1 text-sm text-gold-strong dark:text-gold'
                  : 'h-6 min-w-6 border-gold/70 bg-surface px-1 text-[11px] text-ink'
              }`}
            >
              {isHere ? <Glyph name="banner" size={15} /> : s.seq}
            </button>
          );
        })}
      </div>

      {/* The journey, replayed: drag back through the stops. */}
      {last > 0 && (
        <div className="space-y-1">
          {last > 1 && (
            <Slider
              size="sm"
              aria-label="Replay the journey"
              minValue={1}
              maxValue={last}
              step={1}
              value={showing}
              onChange={v => {
                const n = Array.isArray(v) ? v[0] : v;
                setUpTo(n >= last ? null : n);
              }}
              className="max-w-md"
            />
          )}
          {here && (
            <p className="text-xs text-ink-muted">
              {showing === last ? 'The party is here — ' : ''}
              <span className="text-ink">
                {here.label || `Stop ${here.seq}`}
              </span>
              {' · '}
              {stopLine(here, last)}
            </p>
          )}
        </div>
      )}

      {stop && (
        <div className="rounded-md border border-line bg-surface-2 p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-subtle">
              Stop {stop.seq}
            </span>
            {isStaff ? (
              <Input
                key={stop.id}
                size="sm"
                aria-label="What the place is called"
                placeholder="Name this stop"
                defaultValue={stop.label}
                className="flex-1"
                onBlur={e => {
                  if (e.target.value.trim() !== stop.label) {
                    void act(renameJourneyStopAction(stop.id, e.target.value));
                  }
                }}
              />
            ) : (
              <span className="flex-1 text-ink">
                {stop.label || 'On the road'}
              </span>
            )}
            <button
              type="button"
              onClick={() => setSelectedStop(null)}
              className="text-xs text-ink-subtle hover:text-ink"
            >
              close
            </button>
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {stopLine(stop, last)}
          </p>
          {isStaff && (
            <button
              type="button"
              onClick={async () => {
                await act(removeJourneyStopAction(stop.id));
                setSelectedStop(null);
              }}
              className="mt-2 text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-danger"
            >
              take this stop off the journey
            </button>
          )}
        </div>
      )}

      {pin && (
        <MarkCard
          key={pin.id}
          campaignId={campaignId}
          mapId={map.id}
          pin={pin}
          isStaff={isStaff}
          act={act}
          onClose={() => setSelected(null)}
          onRemoved={() => setSelected(null)}
        />
      )}

      {isStaff && !compact && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-sm">
          <Switch
            size="sm"
            isSelected={map.marksOpen}
            onValueChange={v => act(setMarksOpenAction(map.id, v))}
          >
            <span className="text-sm">
              Players can mark it
              <span className="ml-1 text-xs text-ink-subtle">
                (seen by everyone at once)
              </span>
            </span>
          </Switch>
          <Switch
            size="sm"
            isSelected={map.fogged}
            onValueChange={v => act(setMapFogAction(map.id, v))}
          >
            <span className="text-sm">
              Fog of war
              <span className="ml-1 text-xs text-ink-subtle">
                (the party sees only what you reveal)
              </span>
            </span>
          </Switch>
        </div>
      )}

      {!isStaff && map.marksOpen && map.pins.length === 0 && (
        <Marginalia dash>
          the DM has opened this map — mark what you find
        </Marginalia>
      )}
    </div>
  );
}

/** A mark on the picture, in its kind's glyph. */
function MarkButton({
  pin,
  selected,
  onSelect,
}: {
  pin: MapPinRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = MARK_KIND_META[pin.kind];
  // Gold is what the party can see, arcane what they cannot (rule 6); a
  // player's own mark wears a solid ring so they can find theirs.
  const tone =
    pin.visibility === 'shared'
      ? 'border-gold/70 text-gold-strong dark:text-gold'
      : 'border-arcane/70 text-arcane';
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onSelect();
      }}
      aria-label={`${meta.label}: ${pin.label || 'a mark'}`}
      title={pin.label || meta.label}
      style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
      className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-surface/90 shadow ${tone} ${
        selected ? 'scale-125 border-2' : ''
      } ${pin.mine ? 'ring-2 ring-ink/60' : ''}`}
    >
      <Glyph name={meta.glyph} size={14} />
    </button>
  );
}

interface Options {
  canon: { id: string; title: string }[];
  quests: { id: string; title: string }[];
  sessions: { id: string; title: string }[];
  journals: { id: string; title: string }[];
}

/**
 * One mark, open: what it is, what the party wrote, what else in the record
 * happened here, and — for whoever may — the controls to change it.
 */
function MarkCard({
  campaignId,
  mapId,
  pin,
  isStaff,
  act,
  onClose,
  onRemoved,
}: {
  campaignId: string;
  mapId: string;
  pin: MapPinRow;
  isStaff: boolean;
  act: Act;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [editing, setEditing] = useState(
    pin.label === 'New mark' && pin.canEdit
  );
  const [label, setLabel] = useState(pin.label === 'New mark' ? '' : pin.label);
  const [note, setNote] = useState(pin.note);
  const [dmNote, setDmNote] = useState(pin.dmNote ?? '');
  const [kind, setKind] = useState<MarkKind>(pin.kind);
  const [options, setOptions] = useState<Options | null>(null);
  const meta = MARK_KIND_META[pin.kind];

  useEffect(() => {
    if (!editing || options) return;
    Promise.all([
      listCanonAction(campaignId).catch(() => []),
      listQuestsAction(campaignId).catch(() => []),
      listSessionsAction(campaignId).catch(() => []),
      listJournalsAction(campaignId).catch(() => []),
    ]).then(([canon, quests, sessions, journals]) =>
      setOptions({
        canon: canon.map(c => ({ id: c.id, title: c.title || 'Untitled' })),
        quests: quests.map(q => ({ id: q.id, title: q.title || 'A quest' })),
        sessions: sessions.map(s => ({
          id: s.id,
          title: s.title
            ? `Session ${s.number} · ${s.title}`
            : `Session ${s.number}`,
        })),
        journals: journals.map(j => ({
          id: j.id,
          title: j.title || 'A journal page',
        })),
      })
    );
  }, [editing, options, campaignId]);

  const save = async () => {
    const ok = await act(
      updatePinAction(campaignId, pin.id, {
        label: label.trim() || meta.label,
        note,
        kind,
        ...(isStaff ? { dmNote } : {}),
      })
    );
    if (ok) setEditing(false);
  };

  const linkSelect = (
    field: 'canonEntryId' | 'questId' | 'sessionId' | 'journalId',
    label: string,
    list: { id: string; title: string }[],
    value: string | null
  ) => (
    <Select
      size="sm"
      aria-label={label}
      label={label}
      labelPlacement="outside"
      placeholder="Nothing"
      className="w-full"
      selectedKeys={value ? [value] : []}
      onSelectionChange={keys => {
        const k = Array.from(keys)[0];
        void act(
          updatePinAction(campaignId, pin.id, { [field]: k ? String(k) : null })
        );
      }}
    >
      {list.map(o => (
        <SelectItem key={o.id} textValue={o.title}>
          {o.title}
        </SelectItem>
      ))}
    </Select>
  );

  const links = [
    pin.canonTitle && {
      glyph: 'tome' as const,
      text: pin.canonTitle,
      where: 'Canon',
    },
    pin.quest && {
      glyph: 'scroll' as const,
      text: pin.quest.title,
      where: 'Quests',
    },
    pin.session && {
      glyph: 'notebook' as const,
      text: pin.session.title,
      where: 'Sessions',
    },
    pin.journal && {
      glyph: 'journal' as const,
      text: pin.journal.title,
      where: 'Journal',
    },
  ].filter(Boolean) as { glyph: 'tome'; text: string; where: string }[];

  return (
    <div className="space-y-2 rounded-md border border-line bg-surface-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Glyph name={meta.glyph} size={16} className="text-gold" />
        <span className="flex-1 font-medium text-ink">
          {pin.label || meta.label}
        </span>
        <span className="text-xs text-ink-subtle">
          {meta.label}
          {pin.mine
            ? ' · yours'
            : pin.byName
              ? ` · marked by ${pin.byName}`
              : ''}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-ink-subtle hover:text-ink"
        >
          close
        </button>
      </div>

      {!editing && (
        <>
          {pin.note && (
            <p className="whitespace-pre-wrap text-ink-muted">{pin.note}</p>
          )}
          {isStaff && pin.dmNote && (
            <p className="whitespace-pre-wrap text-xs text-arcane">
              Only you: {pin.dmNote}
            </p>
          )}
          {(links.length > 0 || pin.stops.length > 0) && (
            <ul className="space-y-0.5 text-xs text-ink-muted">
              {links.map(l => (
                <li key={l.where} className="flex items-center gap-1.5">
                  <Glyph name={l.glyph} size={13} className="text-gold" />
                  {l.text}
                  <span className="text-ink-subtle">— {l.where}</span>
                </li>
              ))}
              {pin.stops.length > 0 && (
                <li className="flex items-center gap-1.5">
                  <Glyph name="banner" size={13} className="text-gold" />
                  The party was here: stop {pin.stops.join(', ')}
                </li>
              )}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {pin.canEdit && (
              <Button size="sm" variant="flat" onPress={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {isStaff && (
              <>
                <Button
                  size="sm"
                  variant="light"
                  startContent={<Glyph name="banner" size={13} />}
                  onPress={() =>
                    act(
                      addJourneyStopAction(mapId, {
                        x: pin.x,
                        y: pin.y,
                        pinId: pin.id,
                      })
                    )
                  }
                >
                  The party is here
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  startContent={
                    pin.visibility === 'shared' ? undefined : (
                      <Glyph name="candle" size={13} />
                    )
                  }
                  onPress={() =>
                    act(
                      updatePinAction(campaignId, pin.id, {
                        visibility:
                          pin.visibility === 'shared' ? 'dm' : 'shared',
                      })
                    )
                  }
                >
                  {pin.visibility === 'shared'
                    ? 'Hide again'
                    : 'Show the party'}
                </Button>
              </>
            )}
            {pin.canEdit && (
              <Button
                size="sm"
                variant="light"
                className="text-ink-muted data-[hover=true]:text-danger"
                onPress={async () => {
                  if (await act(deletePinAction(campaignId, pin.id)))
                    onRemoved();
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </>
      )}

      {editing && (
        <div className="space-y-3">
          <Input
            size="sm"
            label="Called"
            labelPlacement="outside"
            placeholder="The Drowned Bell"
            value={label}
            onValueChange={setLabel}
            autoFocus
          />
          <div
            className="flex flex-wrap gap-1"
            role="radiogroup"
            aria-label="Kind"
          >
            {MARK_KINDS.map(k => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                title={MARK_KIND_META[k].hint}
                onClick={() => setKind(k)}
                className={`flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs ${
                  kind === k
                    ? 'border-gold bg-gold text-bg'
                    : 'border-line text-ink-muted hover:text-ink'
                }`}
              >
                <Glyph name={MARK_KIND_META[k].glyph} size={13} />
                {MARK_KIND_META[k].label}
              </button>
            ))}
          </div>
          <Textarea
            size="sm"
            label="What the party knows"
            labelPlacement="outside"
            placeholder="Good ale, a nervous barkeep."
            minRows={2}
            value={note}
            onValueChange={setNote}
          />
          {isStaff && (
            <Textarea
              size="sm"
              label="Only you"
              labelPlacement="outside"
              placeholder="The barkeep reports to the cult."
              minRows={2}
              value={dmNote}
              onValueChange={setDmNote}
            />
          )}
          {options && (
            <div className="grid gap-3 sm:grid-cols-2">
              {linkSelect(
                'questId',
                'A quest here',
                options.quests,
                pin.quest?.id ?? null
              )}
              {linkSelect(
                'sessionId',
                'A session here',
                options.sessions,
                pin.session?.id ?? null
              )}
              {linkSelect(
                'journalId',
                'A journal page here',
                options.journals,
                pin.journal?.id ?? null
              )}
              {linkSelect(
                'canonEntryId',
                'In the canon',
                options.canon,
                pin.canonEntryId
              )}
            </div>
          )}
          <ControlRow size="sm">
            <Button color="primary" onPress={save}>
              Save
            </Button>
            <Button variant="light" onPress={() => setEditing(false)}>
              Cancel
            </Button>
          </ControlRow>
        </div>
      )}
    </div>
  );
}
