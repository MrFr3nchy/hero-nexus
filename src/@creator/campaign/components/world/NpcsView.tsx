'use client';

import { Button, Input } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';

import { EmptyState, Glyph, TomeScene } from '@/@shared/components/ui';
import type { CanonEntryRow } from '../../lib/canon';
import { ATTITUDE_LABEL, type Attitude } from '../../lib/standing';
import { flattenPlaces, pathLabel, placePath } from '../../lib/world';
import { CanonCard } from '../CanonPanel';
import type { Act, World } from './useWorld';

type Filter = 'all' | 'met' | 'unmet' | Attitude;

const NOWHERE = '__nowhere__';

/** Met: the party has been shown them, all of it or one player at a time. */
const met = (e: CanonEntryRow) =>
  e.visibility === 'shared' || e.revealedTo.length > 0;

/**
 * Everybody, by where they live.
 *
 * For the DM, the whole cast — the ones the party has met and the ones still
 * waiting in the wings — with how each regards the party. For a player, the
 * people the party has met: the list of names they would otherwise keep on
 * the back of a character sheet, with where to find each one.
 */
export function NpcsView({
  campaignId,
  world,
  isStaff,
  act,
  focusNpc,
  onOpenPlace,
  onEdit,
}: {
  campaignId: string;
  world: World;
  isStaff: boolean;
  act: Act;
  focusNpc: string | null;
  onOpenPlace: (placeId: string | null, npcId?: string | null) => void;
  onEdit: (entry: CanonEntryRow | null, placeId?: string | null) => void;
}) {
  const { entries, byId } = world;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!focusNpc) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`world-npc-${focusNpc}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusNpc]);

  const npcs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(e => {
      if (e.kind !== 'npc') return false;
      if (filter === 'met' && !met(e)) return false;
      if (filter === 'unmet' && met(e)) return false;
      if (
        (filter === 'friendly' ||
          filter === 'indifferent' ||
          filter === 'hostile') &&
        e.attitude !== filter
      ) {
        return false;
      }
      if (!needle) return true;
      return [
        e.title,
        e.partyBody,
        e.dmBody ?? '',
        ...Object.values(e.fields),
        ...e.partyNotes.map(n => n.body),
      ].some(t => t.toLowerCase().includes(needle));
    });
  }, [entries, query, filter]);

  // Grouped by home, in the order the places list in: the Coast, then
  // Waterdeep, then the Dock Ward inside it.
  const groups = useMemo(() => {
    const order = flattenPlaces(entries).map(f => f.place.id);
    const by = new Map<string, CanonEntryRow[]>();
    for (const n of npcs) {
      const key = n.placeId ?? NOWHERE;
      by.set(key, [...(by.get(key) ?? []), n]);
    }
    for (const list of by.values()) {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return [...order, NOWHERE]
      .filter(k => by.has(k))
      .map(k => ({ placeId: k === NOWHERE ? null : k, people: by.get(k)! }));
  }, [npcs, entries]);

  const all = entries.filter(e => e.kind === 'npc');
  const filters: { key: Filter; label: string }[] = isStaff
    ? [
        { key: 'all', label: 'Everyone' },
        { key: 'met', label: 'Met' },
        { key: 'unmet', label: 'Not met yet' },
        { key: 'friendly', label: ATTITUDE_LABEL.friendly },
        { key: 'indifferent', label: ATTITUDE_LABEL.indifferent },
        { key: 'hostile', label: ATTITUDE_LABEL.hostile },
      ]
    : [];

  if (all.length === 0) {
    return (
      <EmptyState
        scene={<TomeScene />}
        title={isStaff ? 'Nobody here yet' : 'Nobody met yet'}
        description={
          isStaff
            ? 'Open a place under Places and add the people who live there — or roll a whole street of them from a random table of names.'
            : 'The people the party meets, and where to find them, will be listed here.'
        }
        action={
          isStaff ? (
            <Button size="sm" color="primary" onPress={() => onEdit(null)}>
              New NPC
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="@container space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          size="sm"
          aria-label="Find somebody"
          placeholder="Find somebody — a name, a role, a quirk…"
          value={query}
          onValueChange={setQuery}
          isClearable
          onClear={() => setQuery('')}
          startContent={
            <Glyph name="magnifier" size={13} className="text-ink-subtle" />
          }
          className="max-w-sm"
        />
        {filters.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              filter === f.key
                ? 'border-gold bg-gold/15 text-ink'
                : 'border-line text-ink-muted hover:border-gold/60'
            }`}
          >
            {f.label}
          </button>
        ))}
        {isStaff && (
          <Button
            size="sm"
            color="primary"
            className="ml-auto"
            onPress={() => onEdit(null)}
          >
            New NPC
          </Button>
        )}
      </div>

      <p className="text-sm text-ink-muted">
        {npcs.length === all.length
          ? isStaff
            ? `${all.length} ${all.length === 1 ? 'person' : 'people'}, ${all.filter(met).length} met.`
            : `${all.length} ${all.length === 1 ? 'person' : 'people'} the party has met.`
          : `${npcs.length} of ${all.length}.`}
      </p>

      {groups.length === 0 && (
        <p className="text-sm text-ink-subtle">Nobody by that description.</p>
      )}

      {groups.map(g => {
        const path = placePath(g.placeId, byId);
        return (
          <section key={g.placeId ?? NOWHERE} className="space-y-2">
            <h3 className="flex flex-wrap items-center gap-2 border-b border-line pb-1">
              <Glyph name="castle" size={15} className="text-gold" />
              {g.placeId ? (
                <button
                  type="button"
                  onClick={() => onOpenPlace(g.placeId)}
                  className="font-display text-lg text-ink underline-offset-2 hover:underline"
                >
                  {pathLabel(path)}
                </button>
              ) : (
                <span className="font-display text-lg text-ink">
                  Nowhere in particular
                </span>
              )}
              <span className="text-sm text-ink-subtle">
                ({g.people.length})
              </span>
            </h3>
            <div className="grid gap-3 @3xl:grid-cols-2">
              {g.people.map(n => (
                <div
                  key={n.id}
                  id={`world-npc-${n.id}`}
                  className={
                    n.id === focusNpc
                      ? 'rounded-[var(--radius-card)] ring-2 ring-gold/60'
                      : ''
                  }
                >
                  <CanonCard
                    campaignId={campaignId}
                    entry={n}
                    entries={entries}
                    shelves={world.shelves}
                    members={world.members}
                    isStaff={isStaff}
                    act={act}
                    onEdit={() => onEdit(n)}
                    onOpenPlace={id => onOpenPlace(id, n.id)}
                    defaultOpen={n.id === focusNpc}
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
