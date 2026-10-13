'use client';

import { Autocomplete, AutocompleteItem, Button } from '@heroui/react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Glyph,
  TomeScene,
  type GlyphName,
} from '@/@shared/components/ui';
import { useCampaignLive } from '@/@shared/hooks/useCampaignLive';
import type { CampaignRole } from '@/server/campaigns';
import { createCanonAction, updateCanonAction } from '../../canon-actions';
import {
  CANON_KIND_GLYPHS,
  type CanonEntryRow,
  type CanonKind,
} from '../../lib/canon';
import { isPlace, pathLabel, placePath } from '../../lib/world';
import {
  readWorldRoute,
  writeWorldRoute,
  type Filter,
  type Scope,
  type WorldRoute,
} from '../../lib/world-route';
import { EntryEditor, draftOf, emptyDraft, type Draft } from '../CanonPanel';
import { AddToPlace } from './AddToPlace';
import { DayOne } from './DayOne';
import { EverywhereView } from './EverywhereView';
import { PlacesView } from './PlacesView';
import { useWorld } from './useWorld';

const SCOPES: { key: Scope; label: string; glyph: GlyphName }[] = [
  { key: 'here', label: 'Here', glyph: 'banner' },
  { key: 'nearby', label: 'Nearby', glyph: 'compass' },
  { key: 'everywhere', label: 'Everywhere', glyph: 'map' },
];

/**
 * The world: every place, who lives there, what they sell, what is going on
 * in it, and where the party is — one section, opened where the table is.
 *
 * Three scopes, because "everything all the time" was the complaint: Here is
 * one place, its map and its sheet; Nearby is the places around it; and
 * Everywhere is the whole world as a ledger, grouped by place, with Canon,
 * Maps, Quests, Encounters and Random tables as its filters.
 */
export function WorldPanel({
  campaignId,
  viewerId,
  viewerRole,
  route: rawRoute,
  onRoute,
  reloadKey = 0,
}: {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
  /** What follows `#world/` in the address. */
  route: string;
  onRoute: (route: string) => void;
  /** Bumped when something was written elsewhere on the page: re-read. */
  reloadKey?: number;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';
  const { world, error, setError, refresh, act } = useWorld(
    campaignId,
    isStaff
  );
  const { state: live } = useCampaignLive(campaignId);
  // The capture box wrote something: it may have landed here.
  useEffect(() => {
    if (reloadKey) void refresh();
  }, [reloadKey, refresh]);
  /** "Add to <place>" is open — for the place it was opened at. */
  const [adding, setAdding] = useState(false);

  const params = useSearchParams();
  const focusMark = params.get('mark');
  const pendingPlace = params.get('place');

  const parsed = useMemo(() => readWorldRoute(rawRoute), [rawRoute]);
  const route: WorldRoute = useMemo(
    () =>
      parsed.kind === 'route'
        ? parsed.route
        : // Until the landing below resolves, the world as a whole.
          {
            scope: 'here',
            placeId: null,
            entryId: null,
            filter: 'everything',
          },
    [parsed]
  );

  // Walking to another place closes the sheet: it was for the last one.
  useEffect(() => {
    setAdding(false);
  }, [route.scope, route.placeId]);

  const go = useCallback(
    (next: Partial<WorldRoute>) =>
      onRoute(writeWorldRoute({ ...route, ...next })),
    [route, onRoute]
  );

  const openPlace = useCallback(
    (placeId: string | null, entryId: string | null = null) =>
      go({ scope: 'here', placeId, entryId }),
    [go]
  );

  /** Somebody, opened where they live — or in the ledger, if nowhere. */
  const openEntry = useCallback(
    (id: string, fallback: Filter = 'canon') => {
      const entry = world?.byId.get(id);
      if (!entry) return;
      if (isPlace(entry)) openPlace(entry.id);
      else if (entry.placeId && world?.byId.has(entry.placeId)) {
        openPlace(entry.placeId, entry.id);
      } else {
        go({
          scope: 'everywhere',
          filter: entry.kind === 'npc' ? 'people' : fallback,
          placeId: null,
          entryId: entry.id,
        });
      }
    },
    [go, openPlace, world]
  );

  // Landing. An empty address opens the place the party is in — the place
  // the table is actually talking about. Only an empty one: "The world" in
  // the breadcrumb writes `everywhere`, so the reader can always get out.
  useEffect(() => {
    if (!world) return;
    if (pendingPlace && !rawRoute) {
      // Sent here to put a mark down: the maps.
      onRoute(
        writeWorldRoute({ ...route, scope: 'everywhere', filter: 'maps' })
      );
      return;
    }
    if (parsed.kind === 'empty') {
      const here = world.whereabouts.here?.placeId;
      onRoute(
        here && world.byId.has(here)
          ? writeWorldRoute({ ...route, scope: 'here', placeId: here })
          : 'here'
      );
    } else if (parsed.kind === 'entry') {
      if (world.byId.has(parsed.entryId)) {
        openEntry(parsed.entryId, parsed.fallback);
      } else {
        go({ scope: 'everywhere', filter: parsed.fallback, placeId: null });
      }
    }
  }, [world, parsed, pendingPlace, rawRoute, route, onRoute, openEntry, go]);

  /* --- the one editor ---------------------------------------------------- */

  const [editing, setEditing] = useState<{
    id: string | null;
    draft: Draft;
  } | null>(null);

  const edit = useCallback(
    (kind: CanonKind) =>
      (entry: CanonEntryRow | null, placeId: string | null = null) => {
        setEditing(
          entry
            ? { id: entry.id, draft: draftOf(entry) }
            : { id: null, draft: { ...emptyDraft, kind, placeId } }
        );
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    []
  );

  const save = async () => {
    if (!editing?.draft.title.trim()) return;
    let made: string | null = null;
    if (editing.id) {
      const res = await updateCanonAction(
        campaignId,
        editing.id,
        editing.draft
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
    } else {
      const res = await createCanonAction(campaignId, editing.draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      made = res.data.id;
    }
    setEditing(null);
    await refresh();
    if (made) openEntry(made);
  };

  /* --- jump to ------------------------------------------------------------ */

  const jumpItems = useMemo(
    () =>
      (world?.entries ?? [])
        .filter(e => isPlace(e) || e.kind === 'npc')
        .map(e => ({
          id: e.id,
          title: e.title || 'Untitled',
          kind: e.kind,
          where: world ? pathLabel(placePath(e.placeId, world.byId)) : '',
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [world]
  );

  if (!world || parsed.kind !== 'route') {
    return (
      <div className="flex justify-center py-12 pt-4">
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <DiceSpinner label="Unrolling the world…" />
        )}
      </div>
    );
  }

  // Day one: no place and no map. Nothing to scope, so two ways in.
  if (!world.entries.some(isPlace) && world.maps.length === 0) {
    return (
      <div className="pt-4">
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        {isStaff ? (
          <DayOne
            campaignId={campaignId}
            onError={setError}
            onDone={async id => {
              await refresh();
              onRoute(
                id
                  ? writeWorldRoute({ ...route, scope: 'here', placeId: id })
                  : 'here'
              );
            }}
          />
        ) : (
          <EmptyState
            scene={<TomeScene />}
            title="The world is still a blank page"
            description="When the DM names the first place or pins up a map, it opens here."
          />
        )}
      </div>
    );
  }

  const placeId =
    route.placeId && world.byId.has(route.placeId) ? route.placeId : null;
  const path =
    route.scope === 'everywhere' ? [] : placePath(placeId, world.byId);
  const herePlace = world.whereabouts.here?.placeId ?? null;

  return (
    <div className="space-y-4 pt-4">
      {/* ---- where we are, how much of the world, and jump to ---- */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <nav
          aria-label="Where in the world"
          className="flex min-w-0 flex-[1_1_16rem] flex-wrap items-center gap-1 text-sm"
        >
          <button
            type="button"
            onClick={() =>
              go({ scope: 'everywhere', placeId: null, entryId: null })
            }
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-surface-2 ${
              path.length ? 'text-ink-muted' : 'font-medium text-ink'
            }`}
          >
            <Glyph name="compass" size={14} className="text-gold" />
            The world
          </button>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              <Glyph
                name="chevron-right"
                size={12}
                className="text-ink-subtle"
              />
              <button
                type="button"
                onClick={() => openPlace(p.id)}
                className={`rounded px-1.5 py-0.5 hover:bg-surface-2 ${
                  i === path.length - 1
                    ? 'font-medium text-ink'
                    : 'text-ink-muted'
                }`}
              >
                {p.title || 'Somewhere'}
              </button>
            </span>
          ))}
        </nav>

        <div
          role="radiogroup"
          aria-label="How much of the world"
          className="inline-flex h-8 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5"
        >
          {SCOPES.map(s => {
            const lit = route.scope === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={lit}
                onClick={() =>
                  go({
                    scope: s.key,
                    // Here and Nearby keep the place in view; with none,
                    // they open around wherever the party is.
                    placeId:
                      s.key === 'everywhere'
                        ? null
                        : (placeId ?? herePlace ?? null),
                    entryId: null,
                  })
                }
                className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-xs ${
                  lit
                    ? 'bg-surface font-medium text-ink [box-shadow:var(--shadow-card)]'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Glyph
                  name={s.glyph}
                  size={13}
                  className={lit ? 'text-gold-strong dark:text-gold' : ''}
                />
                {s.label}
              </button>
            );
          })}
        </div>

        <Autocomplete
          size="sm"
          aria-label="Jump to a place or a person"
          placeholder="Jump to a place or a person…"
          className="w-full sm:w-64"
          defaultItems={jumpItems}
          startContent={
            <Glyph name="magnifier" size={13} className="text-ink-subtle" />
          }
          selectedKey={null}
          onSelectionChange={key => {
            if (key) openEntry(String(key));
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

        {isStaff && (
          <Button
            size="sm"
            color="primary"
            startContent={<Glyph name="plus" size={13} />}
            onPress={() => setAdding(true)}
          >
            Add to {(placeId && world.byId.get(placeId)?.title) || 'the world'}
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}{' '}
          <button
            type="button"
            className="text-xs underline"
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </p>
      )}

      {editing && (
        <EntryEditor
          campaignId={campaignId}
          draft={editing.draft}
          shelves={world.shelves}
          entries={world.entries}
          entryId={editing.id}
          editing={Boolean(editing.id)}
          onChange={draft => setEditing(e => e && { ...e, draft })}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {route.scope === 'everywhere' && adding && (
        <div className="@container overflow-hidden rounded-[14px] border border-line bg-surface [box-shadow:var(--shadow-card)]">
          <AddToPlace
            campaignId={campaignId}
            world={world}
            placeId={placeId}
            act={act}
            onClose={() => setAdding(false)}
            onOpenPlace={id => {
              setAdding(false);
              openPlace(id);
            }}
            onOpenEntry={id => {
              setAdding(false);
              openEntry(id);
            }}
          />
        </div>
      )}

      {route.scope === 'everywhere' ? (
        <EverywhereView
          campaignId={campaignId}
          viewerId={viewerId}
          viewerRole={viewerRole}
          world={world}
          filter={route.filter}
          placeId={placeId}
          focusEntry={route.entryId}
          isStaff={isStaff}
          act={act}
          refresh={refresh}
          onError={setError}
          onFilter={filter => go({ filter, entryId: null })}
          onPick={id => go({ placeId: id, entryId: null })}
          onOpenPlace={id => openPlace(id)}
          onOpenEntry={id => openEntry(id)}
          onEdit={edit}
        />
      ) : (
        <PlacesView
          campaignId={campaignId}
          world={world}
          scope={route.scope}
          placeId={placeId}
          focusNpc={route.entryId}
          focusMark={focusMark}
          isStaff={isStaff}
          live={live}
          act={act}
          onError={setError}
          onOpenPlace={openPlace}
          onOpenNpc={id => openEntry(id)}
          onScope={(scope, id) =>
            go({ scope, placeId: id ?? placeId, entryId: null })
          }
          adding={adding}
          onCloseAdd={() => setAdding(false)}
          onEdit={edit}
          refresh={refresh}
        />
      )}
    </div>
  );
}
