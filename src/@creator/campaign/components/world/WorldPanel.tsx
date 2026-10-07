'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DiceSpinner, Glyph, type GlyphName } from '@/@shared/components/ui';
import { useCampaignLive } from '@/@shared/hooks/useCampaignLive';
import type { CampaignRole } from '@/server/campaigns';
import { createCanonAction, updateCanonAction } from '../../canon-actions';
import type { CanonEntryRow, CanonKind } from '../../lib/canon';
import { isPlace } from '../../lib/world';
import {
  CanonPanel,
  EntryEditor,
  draftOf,
  emptyDraft,
  type Draft,
} from '../CanonPanel';
import { MapPanel } from '../MapPanel';
import { NpcsView } from './NpcsView';
import { PlacesView } from './PlacesView';
import { useWorld } from './useWorld';

type Tab = 'places' | 'npcs' | 'canon' | 'maps';

const TABS: { key: Tab; label: string; glyph: GlyphName; line: string }[] = [
  {
    key: 'places',
    label: 'Places',
    glyph: 'castle',
    line: 'Where everything is, and who lives there.',
  },
  {
    key: 'npcs',
    label: 'NPCs',
    glyph: 'person',
    line: 'Everybody, by where they live.',
  },
  {
    key: 'canon',
    label: 'Canon',
    glyph: 'tome',
    line: 'Every entry, on its shelf: lore, factions, items, the lot.',
  },
  {
    key: 'maps',
    label: 'Maps',
    glyph: 'map',
    line: 'Every map pinned up, and what each one shows.',
  },
];

/**
 * A route inside the World, as it sits after `#world/` in the address:
 * `places/<placeId>/<npcId>`, `npcs/<npcId>`, `canon`, `maps`, or
 * `entry/<id>` — a search result, sent to wherever that entry lives.
 */
interface Route {
  tab: Tab;
  placeId: string | null;
  npcId: string | null;
}

function readRoute(raw: string): Route & { entry: string | null } {
  const [tab, a, b] = raw.split('/').filter(Boolean);
  if (tab === 'entry') {
    return { tab: 'places', placeId: null, npcId: null, entry: a ?? null };
  }
  if (tab === 'npcs') {
    return { tab, placeId: null, npcId: a ?? null, entry: null };
  }
  if (tab === 'canon' || tab === 'maps') {
    return { tab, placeId: null, npcId: null, entry: null };
  }
  return {
    tab: 'places',
    placeId: a ?? null,
    npcId: b ?? null,
    entry: null,
  };
}

function writeRoute(r: Route): string {
  if (r.tab === 'places') {
    return ['places', r.placeId, r.placeId && r.npcId]
      .filter(Boolean)
      .join('/');
  }
  if (r.tab === 'npcs') return ['npcs', r.npcId].filter(Boolean).join('/');
  return r.tab;
}

/**
 * The world: places, the people in them, everything else the campaign has
 * written down, and the maps it is all drawn on — one section, four tabs,
 * because they are one thing seen four ways.
 */
export function WorldPanel({
  campaignId,
  viewerId,
  viewerRole,
  route: rawRoute,
  onRoute,
}: {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
  /** What follows `#world/` in the address. */
  route: string;
  onRoute: (route: string) => void;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';
  const { world, error, setError, refresh, act } = useWorld(
    campaignId,
    isStaff
  );
  const { state: live } = useCampaignLive(campaignId);

  const params = useSearchParams();
  const focusMark = params.get('mark');
  const pendingPlace = params.get('place');

  const parsed = useMemo(() => readRoute(rawRoute), [rawRoute]);
  // Sent from elsewhere with a mark to show, or a mark to place: the
  // places' map, or the maps.
  const route: Route = useMemo(() => {
    if (pendingPlace && !rawRoute) {
      return { tab: 'maps', placeId: null, npcId: null };
    }
    return parsed;
  }, [parsed, pendingPlace, rawRoute]);

  const go = useCallback(
    (next: Partial<Route>) => {
      const r = { ...route, ...next };
      onRoute(writeRoute(r));
    },
    [route, onRoute]
  );

  const openPlace = useCallback(
    (placeId: string | null, npcId: string | null = null) =>
      go({ tab: 'places', placeId, npcId }),
    [go]
  );

  const openNpc = useCallback(
    (id: string) => {
      const entry = world?.byId.get(id);
      if (entry?.placeId)
        go({ tab: 'places', placeId: entry.placeId, npcId: id });
      else go({ tab: 'npcs', npcId: id, placeId: null });
    },
    [go, world]
  );

  // A search result: open it where it lives.
  useEffect(() => {
    if (!parsed.entry || !world) return;
    const entry = world.byId.get(parsed.entry);
    if (!entry) return;
    if (isPlace(entry)) openPlace(entry.id);
    else if (entry.kind === 'npc') openNpc(entry.id);
    else go({ tab: 'canon', placeId: null, npcId: null });
  }, [parsed.entry, world, openPlace, openNpc, go]);

  /* --- the one editor ---------------------------------------------------- */

  const [editing, setEditing] = useState<{
    id: string | null;
    draft: Draft;
  } | null>(null);

  const edit =
    (kind: CanonKind) =>
    (entry: CanonEntryRow | null, placeId: string | null = null) => {
      setEditing(
        entry
          ? { id: entry.id, draft: draftOf(entry) }
          : { id: null, draft: { ...emptyDraft, kind, placeId } }
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

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
    const kind = editing.draft.kind;
    setEditing(null);
    await refresh();
    if (made) {
      if (kind === 'location') openPlace(made);
      else if (kind === 'npc') openNpc(made);
    }
  };

  const tab = TABS.find(t => t.key === route.tab) ?? TABS[0];

  return (
    <div className="space-y-5 pt-4">
      <div
        role="tablist"
        aria-label="The world"
        className="flex flex-wrap items-end gap-1 border-b border-line"
      >
        {TABS.map(t => {
          const lit = t.key === route.tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={lit}
              onClick={() => go({ tab: t.key })}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                lit
                  ? 'border-gold text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Glyph
                name={t.glyph}
                size={14}
                className={lit ? 'text-gold-strong dark:text-gold' : ''}
              />
              {t.label}
            </button>
          );
        })}
        <span className="ml-auto hidden pb-2 text-xs text-ink-subtle md:block">
          {tab.line}
        </span>
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

      {editing && world && (
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

      {route.tab === 'canon' ? (
        <CanonPanel
          campaignId={campaignId}
          viewerId={viewerId}
          viewerRole={viewerRole}
        />
      ) : route.tab === 'maps' ? (
        <MapPanel
          campaignId={campaignId}
          viewerRole={viewerRole}
          onOpenPlace={id => openPlace(id)}
        />
      ) : !world ? (
        <div className="flex justify-center py-12">
          <DiceSpinner label="Unrolling the world…" />
        </div>
      ) : route.tab === 'npcs' ? (
        <NpcsView
          campaignId={campaignId}
          world={world}
          isStaff={isStaff}
          act={act}
          focusNpc={route.npcId}
          onOpenPlace={openPlace}
          onEdit={edit('npc')}
        />
      ) : (
        <PlacesView
          campaignId={campaignId}
          world={world}
          placeId={
            route.placeId && world.byId.has(route.placeId)
              ? route.placeId
              : null
          }
          focusNpc={route.npcId}
          focusMark={focusMark}
          isStaff={isStaff}
          live={live}
          act={act}
          onError={setError}
          onOpenPlace={openPlace}
          onOpenNpc={openNpc}
          onEdit={edit('location')}
          refresh={refresh}
        />
      )}
    </div>
  );
}
