'use client';

import { Button, Input } from '@heroui/react';
import { useSearchParams } from 'next/navigation';

import { PublishPicture } from '@/@creator/library/components';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Marginalia,
  SectionCard,
  TomeScene,
  useConfirm,
} from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { MapRow } from '@/server/maps';
import {
  createMapAction,
  deleteMapAction,
  listMapsAction,
  setMapVisibilityAction,
  spotlightMapAction,
} from '../map-actions';
import { ImagePicker } from './ImagePicker';
import { PartyMap, type PendingLink } from './PartyMap';

/**
 * A map, with things marked on it — the party's map.
 *
 * Deliberately not a battle grid: no tokens, no squares. This is the other
 * half of what a table uses a map for — knowing where places are, being told
 * about them one at a time, and seeing how far the party has come. The
 * widget itself is `PartyMap`; this is the shelf of them.
 *
 * Pins are stored as fractions of the image, so a pin placed on the DM's
 * monitor lands in the same place on a player's phone. Everything here works
 * in those fractions and only multiplies by the rendered size at the last
 * moment.
 */
function MapSheet({
  campaignId,
  map,
  isStaff,
  refresh,
  onError,
  focusMark,
  pendingLink,
  onPlacedLink,
}: {
  campaignId: string;
  map: MapRow;
  isStaff: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  focusMark: string | null;
  pendingLink: PendingLink | null;
  onPlacedLink: () => void;
}) {
  const { confirm, dialog } = useConfirm();

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  return (
    <SectionCard
      title={map.title || 'Map'}
      description={
        isStaff
          ? map.visibility === 'shared'
            ? map.marksOpen
              ? 'The party can open this, and mark it.'
              : 'The party can open this.'
            : 'Yours alone for now.'
          : map.marksOpen
            ? 'Open to the party: mark what you find.'
            : undefined
      }
      actions={
        isStaff && (
          <>
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
                ? 'Hide from the party'
                : 'Show the party'}
            </Button>
            {/* Sharing puts a map where the party can find it; lighting one
                puts it in front of them. Two different sentences at a table,
                so two different buttons — and lighting shares it, so this is
                never the harder of the two to reach. */}
            <Button
              size="sm"
              variant={map.spotlighted ? 'solid' : 'flat'}
              color={map.spotlighted ? 'primary' : 'default'}
              onPress={() => act(spotlightMapAction(map.id, !map.spotlighted))}
            >
              {map.spotlighted ? 'Put it away' : 'Look at this'}
            </Button>
            {/* The picture, not the map: marks carry the DM's private notes
                and have no business on a public shelf. */}
            <PublishPicture
              campaignImageId={map.imageId}
              defaultTitle={map.title}
            />
            <Button
              size="sm"
              variant="light"
              onPress={async () => {
                const yes = await confirm({
                  title: 'Take this map down?',
                  body: 'Every mark and the whole journey go with it. The picture itself stays in the campaign.',
                  confirmLabel: 'Take it down',
                  destructive: true,
                });
                if (!yes) return;
                await act(deleteMapAction(campaignId, map.id));
              }}
            >
              Take down
            </Button>
          </>
        )
      }
    >
      {dialog}
      <PartyMap
        campaignId={campaignId}
        map={map}
        isStaff={isStaff}
        refresh={refresh}
        onError={onError}
        focusMark={focusMark}
        pendingLink={pendingLink}
        onPlacedLink={onPlacedLink}
      />
    </SectionCard>
  );
}

export function MapPanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerRole: CampaignRole;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [maps, setMaps] = useState<MapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /*
   * Deep links from elsewhere in the record: `?mark=<id>` opens a mark's
   * card; `?place=quest:<id>` (or session:, journal:) puts the next mark
   * down linked to it — "Put it on the map" on those cards.
   */
  const params = useSearchParams();
  const focusMark = params.get('mark');
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  useEffect(() => {
    const m = /^(quest|session|journal):([\w-]{1,64})$/.exec(
      params.get('place') ?? ''
    );
    setPendingLink(m ? { kind: m[1] as PendingLink['kind'], id: m[2] } : null);
  }, [params]);
  const placed = () => {
    setPendingLink(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('place');
    window.history.replaceState(null, '', url.toString());
  };
  const [title, setTitle] = useState('');
  const [imageId, setImageId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setMaps(await listMapsAction(campaignId));
    } catch {
      setError('Failed to unroll the maps.');
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!maps) {
    return (
      <div className="flex justify-center py-10">
        <DiceSpinner label="Unrolling them…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isStaff && (
        <SectionCard
          title="Pin up a map"
          description="Any picture. Mark places on it, and show the party the ones they have found."
        >
          <div className="flex flex-col gap-3">
            <ImagePicker
              campaignId={campaignId}
              value={imageId}
              onChange={setImageId}
              label="The picture"
            />
            <div className="flex flex-wrap items-end gap-2">
              <Input
                size="sm"
                label="Title"
                placeholder="The Duskwater valley"
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
                  const res = await createMapAction(campaignId, imageId, title);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setImageId(null);
                  setTitle('');
                  await refresh();
                }}
              >
                Pin it up
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {maps.length === 0 ? (
        <EmptyState
          scene={<TomeScene />}
          title="No maps yet"
          description={
            isStaff
              ? 'Upload a picture and mark places on it. A mark can point at a canon entry, so a pin opens the innkeeper you already wrote down.'
              : 'When the DM has a map to show you, it will be here.'
          }
        />
      ) : (
        <div className="space-y-5">
          {maps.map(map => (
            <MapSheet
              key={map.id}
              campaignId={campaignId}
              map={map}
              isStaff={isStaff}
              refresh={refresh}
              onError={setError}
              focusMark={
                map.pins.some(p => p.id === focusMark) ? focusMark : null
              }
              pendingLink={
                pendingLink &&
                (isStaff || (map.marksOpen && map.visibility === 'shared'))
                  ? pendingLink
                  : null
              }
              onPlacedLink={placed}
            />
          ))}
        </div>
      )}

      {pendingLink && (
        <p
          role="status"
          className="rounded-md border border-gold/40 bg-gold/[0.06] px-3 py-2 text-sm text-ink"
        >
          Tap a map where it happened — the new mark will point back to it.{' '}
          <button
            type="button"
            onClick={placed}
            className="text-xs text-ink-subtle underline-offset-2 hover:underline"
          >
            never mind
          </button>
        </p>
      )}

      {isStaff && maps.length > 0 && (
        <Marginalia dash>gold they can see, arcane they cannot</Marginalia>
      )}
    </div>
  );
}
