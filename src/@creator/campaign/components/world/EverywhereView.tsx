'use client';

import { Button, Checkbox, Input, Select, SelectItem } from '@heroui/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  EmptyState,
  Glyph,
  Marginalia,
  Pill,
  QuestScene,
  Ribbon,
  type GlyphName,
} from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { ClockRow } from '@/server/clocks';
import type { PlanRow } from '@/server/encounter-plans';
import type { QuestRow } from '@/server/quests';
import type { ShopRow } from '@/server/shops';
import { updateCanonAction } from '../../canon-actions';
import { createClockAction, updateClockAction } from '../../clock-actions';
import { updatePlanAction } from '../../encounter-actions';
import type { CanonEntryRow } from '../../lib/canon';
import { CLOCK_SEGMENTS } from '../../lib/clocks';
import { ATTITUDE_LABEL } from '../../lib/standing';
import { flattenPlaces, isPlace, placesUnder } from '../../lib/world';
import type { Filter } from '../../lib/world-route';
import { createQuestAction, updateQuestAction } from '../../quest-actions';
import { updateShopAction } from '../../shop-actions';
import { CanonPanel } from '../CanonPanel';
import { EncounterPlanner } from '../EncounterPlanner';
import { MapPanel } from '../MapPanel';
import { RandomTablesPanel } from '../RandomTablesPanel';
import { ClockLine, QuestLine } from './Lines';
import { PlaceChip, placeGlyph } from './PlaceChip';
import { PlacePicker } from './PlacePicker';
import type { EditFn } from './PlaceDetail';
import type { Act, World } from './useWorld';

const FILTER_DEFS: {
  key: Filter;
  label: string;
  glyph: GlyphName;
  staffOnly?: boolean;
}[] = [
  { key: 'everything', label: 'Everything', glyph: 'compass' },
  { key: 'people', label: 'People', glyph: 'person' },
  { key: 'shops', label: 'Shops', glyph: 'coins' },
  { key: 'quests', label: 'Quests', glyph: 'scroll' },
  {
    key: 'encounters',
    label: 'Encounters',
    glyph: 'crossed-swords',
    staffOnly: true,
  },
  { key: 'clocks', label: 'Clocks', glyph: 'hourglass' },
  { key: 'canon', label: 'Canon', glyph: 'tome' },
  { key: 'maps', label: 'Maps', glyph: 'map' },
  {
    key: 'random-tables',
    label: 'Random tables',
    glyph: 'die',
    staffOnly: true,
  },
];

/** The filters the ledger lists itself, grouped by place. */
type Listed = Exclude<Filter, 'canon' | 'maps' | 'random-tables'>;
const isListed = (f: Filter): f is Listed =>
  f !== 'canon' && f !== 'maps' && f !== 'random-tables';

/** Everything that can stand in a place, as one row of the ledger. */
type Item =
  | { kind: 'person'; id: string; placeId: string | null; row: CanonEntryRow }
  | { kind: 'shop'; id: string; placeId: string | null; row: ShopRow }
  | { kind: 'quest'; id: string; placeId: string | null; row: QuestRow }
  | { kind: 'encounter'; id: string; placeId: string | null; row: PlanRow }
  | { kind: 'clock'; id: string; placeId: string | null; row: ClockRow };

const KIND_OF: Record<Listed, Item['kind'][]> = {
  everything: ['person', 'shop', 'quest', 'encounter', 'clock'],
  people: ['person'],
  shops: ['shop'],
  quests: ['quest'],
  encounters: ['encounter'],
  clocks: ['clock'],
};

const hiddenFromParty = (i: Item): boolean =>
  i.kind === 'encounter' ||
  ('visibility' in i.row && i.row.visibility !== 'shared');

/**
 * Everywhere: the whole world as one ledger, grouped by where things are.
 *
 * Quests, encounters and random tables used to be sections of their own,
 * and finding the fight thing meant knowing it was called "Encounters"
 * under "Battle". Here they are filters of one list, every row under the
 * place it happens in, and the things with no place yet at the top asking
 * for one. Canon, Maps and Random tables are the panels they always were.
 */
export function EverywhereView({
  campaignId,
  viewerId,
  viewerRole,
  world,
  filter: asked,
  placeId,
  focusEntry,
  isStaff,
  act,
  refresh,
  onError,
  onFilter,
  onPick,
  onOpenPlace,
  onOpenEntry,
  onEdit,
}: {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
  world: World;
  filter: Filter;
  /** The place picked in the tree: only it and what is inside it. */
  placeId: string | null;
  focusEntry: string | null;
  isStaff: boolean;
  act: Act;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onFilter: (filter: Filter) => void;
  onPick: (placeId: string | null) => void;
  onOpenPlace: (placeId: string) => void;
  onOpenEntry: (entryId: string) => void;
  onEdit: EditFn;
}) {
  const { entries, byId, whereabouts } = world;
  const filters = FILTER_DEFS.filter(f => isStaff || !f.staffOnly);
  const filter = filters.some(f => f.key === asked) ? asked : 'everything';
  // The DM's preview of the player's ledger: only what has been shown.
  const [asParty, setAsParty] = useState(false);
  // "Leave it everywhere": a nudge dismissed for this visit, written nowhere.
  const [leftEverywhere, setLeftEverywhere] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (!focusEntry) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`ledger-${focusEntry}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusEntry]);

  /* --- every row, with where it is ---------------------------------------- */

  const items: Item[] = useMemo(() => {
    const places = new Set(entries.filter(isPlace).map(e => e.id));
    const at = (id: string | null) => (id && places.has(id) ? id : null);
    return [
      ...entries
        .filter(e => e.kind === 'npc')
        .map(row => ({
          kind: 'person' as const,
          id: row.id,
          placeId: at(row.placeId),
          row,
        })),
      ...world.shops.map(row => ({
        kind: 'shop' as const,
        id: row.id,
        placeId: at(row.placeId),
        row,
      })),
      ...world.quests.map(row => ({
        kind: 'quest' as const,
        id: row.id,
        placeId: at(row.placeId),
        row,
      })),
      ...world.plans.map(row => ({
        kind: 'encounter' as const,
        id: row.id,
        placeId: at(row.placeId),
        row,
      })),
      ...world.clocks.map(row => ({
        kind: 'clock' as const,
        id: row.id,
        placeId: at(row.placeId),
        row,
      })),
    ];
  }, [entries, world.shops, world.quests, world.plans, world.clocks]);

  const kinds = isListed(filter) ? KIND_OF[filter] : [];
  const shown = items.filter(
    i => kinds.includes(i.kind) && !(asParty && hiddenFromParty(i))
  );

  // A quest is "in" a place through any of its steps too; it is listed under
  // its own place, and under each place a step of it happens in.
  const placesOf = (i: Item): string[] => {
    if (i.kind !== 'quest') return i.placeId ? [i.placeId] : [];
    const out = new Set<string>(i.placeId ? [i.placeId] : []);
    for (const o of i.row.objectives) {
      if (o.placeId && byId.has(o.placeId)) out.add(o.placeId);
    }
    return [...out];
  };

  const scope = placeId
    ? new Set([placeId, ...placesUnder(placeId, entries)])
    : null;
  const tree = flattenPlaces(entries).filter(
    ({ place }) => !(asParty && place.visibility !== 'shared')
  );
  const countAt = new Map<string, number>();
  for (const i of shown) {
    for (const p of placesOf(i)) countAt.set(p, (countAt.get(p) ?? 0) + 1);
  }

  const unplaced = shown.filter(
    i => placesOf(i).length === 0 && !leftEverywhere.has(i.id)
  );
  const groups = tree
    .filter(({ place }) => !scope || scope.has(place.id))
    .map(({ place }) => ({
      place,
      items: shown.filter(i => placesOf(i).includes(place.id)),
    }))
    .filter(g => g.items.length > 0);

  /* --- one row ------------------------------------------------------------ */

  const move = (i: Item) => async (next: string | null) => {
    if (i.kind === 'person') {
      await act(updateCanonAction(campaignId, i.id, { placeId: next }));
    } else if (i.kind === 'shop') {
      await act(updateShopAction(i.id, { placeId: next }));
    } else if (i.kind === 'quest') {
      await act(updateQuestAction(campaignId, i.id, { placeId: next }));
    } else if (i.kind === 'encounter') {
      await act(updatePlanAction(campaignId, i.id, { placeId: next }));
    } else {
      await act(updateClockAction(campaignId, i.id, { placeId: next }));
    }
  };

  const placeIt = (i: Item) =>
    isStaff ? (
      <PlaceChip
        placeId={null}
        entries={entries}
        byId={byId}
        label="Where it is"
        onChange={move(i)}
      />
    ) : null;

  const line = (i: Item, at: string | null): ReactNode => {
    const loose = at === null;
    const key = `${i.kind}-${i.id}-${at ?? 'nowhere'}`;
    const wrap = (child: ReactNode) => (
      <div
        key={key}
        id={`ledger-${i.id}`}
        className={
          i.id === focusEntry
            ? 'rounded-[var(--radius-card)] ring-2 ring-gold/60'
            : ''
        }
      >
        {child}
      </div>
    );
    switch (i.kind) {
      case 'quest':
        return wrap(
          <QuestLine
            campaignId={campaignId}
            quest={i.row}
            world={world}
            isStaff={isStaff}
            here={at}
            onOpenPlace={onOpenPlace}
            onError={onError}
            refresh={refresh}
            extra={
              loose &&
              isStaff && (
                <>
                  {placeIt(i)}
                  <button
                    type="button"
                    onClick={() => setLeftEverywhere(s => new Set(s).add(i.id))}
                    className="text-xs text-ink-subtle hover:text-ink"
                  >
                    Leave it everywhere
                  </button>
                </>
              )
            }
          />
        );
      case 'clock':
        return wrap(
          <ClockLine
            clock={i.row}
            isStaff={isStaff}
            extra={loose ? placeIt(i) : null}
          />
        );
      default:
        return wrap(
          <LedgerRow
            item={i}
            isStaff={isStaff}
            place={at}
            onOpen={() =>
              i.kind === 'person'
                ? onOpenEntry(i.id)
                : at
                  ? onOpenPlace(at)
                  : undefined
            }
            onEdit={
              i.kind === 'person' && isStaff
                ? () => onEdit('npc')(i.row as CanonEntryRow)
                : undefined
            }
            extra={loose ? placeIt(i) : null}
          />
        );
    }
  };

  /* --- the ledger ----------------------------------------------------------- */

  const listed = isListed(filter);
  const what = FILTER_DEFS.find(f => f.key === filter)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label="Show"
          className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
        >
          {filters.map(f => {
            const lit = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                role="radio"
                aria-checked={lit}
                onClick={() => onFilter(f.key)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs ${
                  lit
                    ? 'bg-surface font-medium text-ink [box-shadow:var(--shadow-card)]'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Glyph
                  name={f.glyph}
                  size={12}
                  className={lit ? 'text-gold-strong dark:text-gold' : ''}
                />
                {f.label}
              </button>
            );
          })}
        </div>
        {listed && (
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {isStaff && (
              <Checkbox
                size="sm"
                isSelected={asParty}
                onValueChange={setAsParty}
              >
                <span className="text-xs text-ink-muted">
                  As the party sees it
                </span>
              </Checkbox>
            )}
            <Button
              size="sm"
              variant="light"
              startContent={<Glyph name="map" size={13} />}
              onPress={() => {
                const target = placeId ?? whereabouts.here?.placeId ?? null;
                if (target) onOpenPlace(target);
              }}
              isDisabled={!placeId && !whereabouts.here?.placeId}
            >
              Show on the map
            </Button>
          </div>
        )}
      </div>

      {filter === 'canon' ? (
        <CanonPanel
          campaignId={campaignId}
          viewerId={viewerId}
          viewerRole={viewerRole}
        />
      ) : filter === 'maps' ? (
        <MapPanel
          campaignId={campaignId}
          viewerRole={viewerRole}
          onOpenPlace={id => onOpenPlace(id)}
        />
      ) : filter === 'random-tables' ? (
        <RandomTablesPanel campaignId={campaignId} />
      ) : (
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {/* ---- the places, as a tree ---- */}
          <nav
            aria-label="Places"
            className="flex shrink-0 flex-col gap-px rounded-[var(--radius-card)] border border-line bg-surface p-2 md:sticky md:top-4 md:w-60"
          >
            <TreeItem
              lit={!placeId}
              depth={0}
              glyph="compass"
              label="The world"
              count={shown.length}
              onPress={() => onPick(null)}
            />
            {tree.map(({ place, depth }) => (
              <TreeItem
                key={place.id}
                lit={placeId === place.id}
                depth={depth + 1}
                glyph={placeGlyph(place)}
                label={place.title || 'Somewhere'}
                count={countAt.get(place.id) ?? 0}
                here={whereabouts.here?.placeId === place.id}
                hidden={isStaff && place.visibility !== 'shared'}
                onPress={() => onPick(place.id)}
              />
            ))}
            {unplaced.length > 0 && (
              <>
                <span className="mx-1 my-1.5 h-px bg-line" />
                <button
                  type="button"
                  onClick={() => {
                    // Not an anchor: the hash is the campaign page's route.
                    if (placeId) onPick(null);
                    window.setTimeout(
                      () =>
                        document
                          .getElementById('ledger-not-placed')
                          ?.scrollIntoView({ behavior: 'smooth' }),
                      60
                    );
                  }}
                  className="flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[0.8125rem] text-warning hover:bg-surface-2"
                >
                  <Glyph name="question" size={13} />
                  <span className="flex-1">Not placed yet</span>
                  <span className="text-[0.7rem] tabular-nums">
                    {unplaced.length}
                  </span>
                </button>
              </>
            )}
          </nav>

          {/* ---- the rows, by where they are ---- */}
          <section
            aria-label={`${what.label}, by where they are`}
            className="min-w-0 flex-1 space-y-6"
          >
            <p className="text-sm text-ink-muted">
              {ledgerLine(filter as Listed, shown, isStaff && !asParty)}
            </p>

            {isStaff && !asParty && (
              <Composer
                campaignId={campaignId}
                filter={filter as Listed}
                world={world}
                placeId={placeId}
                act={act}
                onEdit={onEdit}
              />
            )}

            {unplaced.length > 0 && !placeId && (
              <div
                id="ledger-not-placed"
                className="scroll-mt-4 space-y-2 rounded-xl border border-dashed border-warning/70 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Glyph name="question" size={16} className="text-warning" />
                  <h3 className="font-display text-lg text-ink">
                    Not placed yet
                  </h3>
                  {isStaff && (
                    <span className="text-xs text-ink-muted">
                      Give each a home and it shows up where it belongs.
                    </span>
                  )}
                </div>
                {unplaced.map(i => line(i, null))}
              </div>
            )}

            {groups.map(({ place, items: list }) => {
              const isHere = whereabouts.here?.placeId === place.id;
              const isHeaded = whereabouts.headed.some(
                h => h.placeId === place.id
              );
              return (
                <div key={place.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 border-b border-line pb-1.5">
                    <Glyph
                      name={placeGlyph(place)}
                      size={16}
                      className="text-gold-strong dark:text-gold"
                    />
                    <h3 className="font-display text-xl text-ink">
                      {place.title || 'Somewhere'}
                    </h3>
                    {isHere && <Ribbon tone="gold">The party is here</Ribbon>}
                    {isHeaded && !isHere && (
                      <span className="text-xs text-ink-muted">
                        where the party is headed
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="light"
                      className="ml-auto"
                      endContent={<Glyph name="arrow-right" size={13} />}
                      onPress={() => onOpenPlace(place.id)}
                    >
                      Open the place
                    </Button>
                  </div>
                  {list.map(i => line(i, place.id))}
                </div>
              );
            })}

            {groups.length === 0 && unplaced.length === 0 && (
              <EmptyState
                scene={<QuestScene />}
                title={
                  placeId
                    ? `Nothing of that here`
                    : `No ${what.label.toLowerCase()} yet`
                }
                description={
                  isStaff
                    ? 'Write the first one above, or open a place and add it there.'
                    : 'When the party learns of something, it shows up here, under where it is.'
                }
              />
            )}

            {filter === 'encounters' && isStaff && (
              <div className="space-y-2 border-t border-line pt-4">
                <h3 className="font-display text-lg text-ink">
                  Build an encounter
                </h3>
                <EncounterPlanner campaignId={campaignId} />
              </div>
            )}

            {listed && shown.length > 0 && filter === 'everything' && (
              <Marginalia dash>
                every quest has a home now, even the ones that wander
              </Marginalia>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** "9 quests: 5 active, 2 the party has not heard of, 2 done." */
function ledgerLine(filter: Listed, items: Item[], staffView: boolean): string {
  const n = items.length;
  const noun: Record<Listed, [string, string]> = {
    everything: ['thing', 'things'],
    people: ['person', 'people'],
    shops: ['shop', 'shops'],
    quests: ['quest', 'quests'],
    encounters: ['encounter', 'encounters'],
    clocks: ['clock', 'clocks'],
  };
  const head = `${n} ${noun[filter][n === 1 ? 0 : 1]}`;
  if (n === 0) return `${head} yet.`;
  const parts: string[] = [];
  if (filter === 'quests') {
    const q = items.map(i => i.row as QuestRow);
    const active = q.filter(x => x.status === 'active').length;
    const done = q.filter(
      x => x.status === 'done' || x.status === 'failed'
    ).length;
    if (active) parts.push(`${active} active`);
    if (staffView) {
      const unheard = q.filter(x => x.visibility === 'dm').length;
      if (unheard) parts.push(`${unheard} the party has not heard of`);
    }
    if (done) parts.push(`${done} behind them`);
  } else if (filter === 'clocks') {
    const c = items.map(i => i.row as ClockRow);
    const running = c.filter(x => x.status === 'running').length;
    if (running) parts.push(`${running} running`);
    if (c.length - running) parts.push(`${c.length - running} gone off`);
  } else if (filter === 'encounters') {
    const fought = items.filter(i => (i.row as PlanRow).ranAt).length;
    if (n - fought) parts.push(`${n - fought} still to come`);
    if (fought) parts.push(`${fought} fought`);
  }
  return `${head}${parts.length ? `: ${parts.join(', ')}` : ''}. Grouped by where they are.`;
}

function TreeItem({
  lit,
  depth,
  glyph,
  label,
  count,
  here = false,
  hidden = false,
  onPress,
}: {
  lit: boolean;
  depth: number;
  glyph: GlyphName;
  label: string;
  count: number;
  here?: boolean;
  hidden?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-current={lit ? 'true' : undefined}
      style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
      className={`flex min-h-8 items-center gap-2 rounded-md pr-2 text-left text-[0.8125rem] ${
        lit
          ? 'bg-surface-2 font-medium text-ink'
          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
      } ${hidden ? 'status-hatch' : ''}`}
    >
      <Glyph
        name={hidden ? 'eye-off' : glyph}
        size={13}
        className={depth === 0 ? 'text-gold' : ''}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {here && (
        <span className="rounded-full border border-gold/60 px-1.5 text-[0.65rem] text-gold-strong dark:text-gold">
          here
        </span>
      )}
      <span className="text-[0.7rem] tabular-nums text-ink-subtle">
        {count}
      </span>
    </button>
  );
}

/** A person, a shop or an encounter, as one line of the ledger. */
function LedgerRow({
  item,
  isStaff,
  place,
  onOpen,
  onEdit,
  extra,
}: {
  item: Exclude<Item, { kind: 'quest' } | { kind: 'clock' }>;
  isStaff: boolean;
  place: string | null;
  onOpen: () => void;
  onEdit?: () => void;
  extra?: ReactNode;
}) {
  let glyph: GlyphName = 'person';
  let title = '';
  let sub = '';
  let hidden = false;
  let chip: ReactNode = null;
  if (item.kind === 'person') {
    const e = item.row;
    title = e.title || 'Somebody';
    sub = [e.fields.role, e.partyBody.split('\n')[0]]
      .filter(Boolean)
      .join(' · ');
    hidden = isStaff && e.visibility !== 'shared';
    if (isStaff && e.attitude) {
      chip = (
        <Pill
          tone={
            e.attitude === 'friendly'
              ? 'success'
              : e.attitude === 'hostile'
                ? 'danger'
                : 'default'
          }
        >
          {ATTITUDE_LABEL[e.attitude]}
        </Pill>
      );
    }
  } else if (item.kind === 'shop') {
    const s = item.row;
    glyph = 'stall';
    title = s.name || 'A shop';
    sub = [
      s.keeper && `kept by ${s.keeper.title}`,
      `${s.stock.length} ${s.stock.length === 1 ? 'thing' : 'things'} for sale`,
    ]
      .filter(Boolean)
      .join(' · ');
    hidden = isStaff && s.visibility !== 'shared';
  } else {
    const p = item.row;
    glyph = 'crossed-swords';
    title = p.name || 'An encounter';
    sub = [
      p.lines.length
        ? p.lines.map(l => `${l.count} × ${l.name}`).join(', ')
        : 'Nobody in it yet',
      p.ranAt ? (p.ranSession ? `fought in ${p.ranSession}` : 'fought') : null,
    ]
      .filter(Boolean)
      .join(' · ');
    // An encounter is prep: the party never sees one as such.
    hidden = true;
  }
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 ${
        hidden
          ? 'status-hatch border-dotted border-arcane/50'
          : 'border-line bg-surface'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-display text-sm text-ink">
        {item.kind === 'person' ? (
          (title || '?').slice(0, 1)
        ) : (
          <Glyph name={glyph} size={15} className="text-ink-muted" />
        )}
      </span>
      <button
        type="button"
        onClick={onOpen}
        disabled={!place && item.kind !== 'person'}
        className="min-w-0 flex-1 text-left enabled:hover:underline"
      >
        <span className="block truncate font-medium text-ink">{title}</span>
        {sub && (
          <span className="block truncate text-xs text-ink-muted">{sub}</span>
        )}
      </button>
      {extra}
      {chip}
      {hidden && <Pill tone="arcane">Only you</Pill>}
      {onEdit && (
        <Button size="sm" variant="light" onPress={onEdit}>
          Edit
        </Button>
      )}
    </div>
  );
}

/** Writing a new one from the ledger, placed in the place picked. */
function Composer({
  campaignId,
  filter,
  world,
  placeId,
  act,
  onEdit,
}: {
  campaignId: string;
  filter: Listed;
  world: World;
  placeId: string | null;
  act: Act;
  onEdit: EditFn;
}) {
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState<string | null>(placeId);
  const [segments, setSegments] = useState(6);
  useEffect(() => setWhere(placeId), [placeId]);
  const place = where ? world.byId.get(where) : null;

  if (filter === 'people') {
    return (
      <Button
        size="sm"
        variant="flat"
        startContent={<Glyph name="plus" size={13} />}
        onPress={() => onEdit('npc')(null, placeId)}
      >
        {placeId
          ? `Someone who lives in ${world.byId.get(placeId)?.title || 'here'}`
          : 'A new person'}
      </Button>
    );
  }
  if (filter !== 'quests' && filter !== 'clocks') return null;

  const write = async () => {
    if (!title.trim()) return;
    if (filter === 'quests') {
      await act(
        createQuestAction(campaignId, { title: title.trim(), placeId: where })
      );
    } else {
      await act(
        createClockAction(campaignId, {
          title: title.trim(),
          segments,
          placeId: where,
        })
      );
    }
    setTitle('');
  };

  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border border-dashed border-line p-2"
      onSubmit={e => {
        e.preventDefault();
        void write();
      }}
    >
      <Input
        size="sm"
        aria-label={filter === 'quests' ? 'A new quest' : 'A new clock'}
        placeholder={
          filter === 'quests'
            ? 'A new quest — the miller’s missing daughter'
            : 'A new clock — the ritual at Duskwater'
        }
        value={title}
        onValueChange={setTitle}
        className="min-w-48 flex-1"
        startContent={
          <Glyph name="plus" size={13} className="text-ink-subtle" />
        }
      />
      {filter === 'clocks' && (
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
      )}
      <PlacePicker
        entries={world.entries}
        value={where}
        onChange={setWhere}
        label=""
        nowhere="Not placed yet"
        className="w-48"
      />
      <Button
        size="sm"
        type="submit"
        color="primary"
        isDisabled={!title.trim()}
      >
        {place ? `Write it into ${place.title}` : 'Write it'}
      </Button>
    </form>
  );
}
