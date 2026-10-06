'use client';

import { useEffect, useState } from 'react';

import { Glyph } from '@/@shared/components/ui';
import type { RecordOnMap } from '@/server/maps';
import { mapLinksAction } from '../map-actions';

export interface MapLinks {
  records: RecordOnMap[];
  canPlace: boolean;
}

/** Where on the maps things are, read once for a whole panel. */
export function useMapLinks(campaignId: string): MapLinks | null {
  const [links, setLinks] = useState<MapLinks | null>(null);
  useEffect(() => {
    let live = true;
    mapLinksAction(campaignId).then(l => {
      if (live) setLinks(l);
    });
    return () => {
      live = false;
    };
  }, [campaignId]);
  return links;
}

/**
 * The other end of a mark's link: on a quest, a session or a journal page,
 * the places on the maps it is tied to, and "Put it on the map" to tie it to
 * a new one. Both go to the Canon section, where the maps live; a full page
 * load, because the section is chosen by the hash on arrival.
 */
export function OnTheMap({
  campaignId,
  links,
  kind,
  id,
}: {
  campaignId: string;
  links: MapLinks | null;
  kind: 'quest' | 'session' | 'journal';
  id: string;
}) {
  if (!links) return null;
  const here = links.records.filter(r =>
    kind === 'quest'
      ? r.questId === id
      : kind === 'session'
        ? r.sessionId === id
        : r.journalId === id
  );
  if (here.length === 0 && !links.canPlace) return null;
  const base = `/campaigns/${campaignId}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {here.map(r => (
        <a
          key={`${r.mapId}-${r.pinId ?? ''}-${r.stop ?? ''}`}
          href={r.pinId ? `${base}?mark=${r.pinId}#canon` : `${base}#canon`}
          className="inline-flex items-center gap-1 rounded-md border border-gold/40 px-2 py-0.5 text-ink-muted hover:border-gold hover:text-ink"
        >
          <Glyph
            name={r.stop ? 'banner' : 'compass'}
            size={12}
            className="text-gold"
          />
          {r.stop ? `Stop ${r.stop}: ` : ''}
          {r.label}
          <span className="text-ink-subtle">· {r.mapTitle}</span>
        </a>
      ))}
      {links.canPlace && (
        <a
          href={`${base}?place=${kind}:${id}#canon`}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-ink-subtle hover:text-ink"
        >
          <Glyph name="map" size={12} />
          Put it on the map
        </a>
      )}
    </div>
  );
}
