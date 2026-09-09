'use client';

import { Button, Input, Select, SelectItem } from '@heroui/react';

import { PublishPicture } from '@/@creator/library/components';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Glyph,
  Marginalia,
  SectionCard,
  TomeScene,
  useConfirm,
} from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { CanonEntryRow } from '@/server/canon';
import type { MapPinRow, MapRow } from '@/server/maps';
import { listCanonAction } from '../canon-actions';
import {
  addPinAction,
  createMapAction,
  deleteMapAction,
  deletePinAction,
  listMapsAction,
  setMapVisibilityAction,
  updatePinAction,
} from '../map-actions';
import { ImagePicker } from './ImagePicker';

/**
 * A map, with things marked on it.
 *
 * Deliberately not a battle grid: no tokens, no fog, no lattice. This is the
 * other half of what a table uses a map for — knowing where places are, and
 * being told about them one at a time.
 *
 * Pins are stored as fractions of the image, so a pin placed on the DM's
 * monitor lands in the same place on a player's phone. Everything here works
 * in those fractions and only multiplies by the rendered size at the last
 * moment.
 */
function MapSheet({
  campaignId,
  map,
  canon,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  map: MapRow;
  canon: CanonEntryRow[];
  isStaff: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [selected, setSelected] = useState<MapPinRow | null>(null);
  const [placing, setPlacing] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useConfirm();

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  /** Where in the picture the click landed, as two fractions. */
  const place = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placing || !imageRef.current) return;
    const box = imageRef.current.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    setPlacing(false);
    await act(
      addPinAction(campaignId, map.id, { x, y, label: 'New mark' }).then(res =>
        res.ok ? { ok: true } : res
      )
    );
  };

  return (
    <SectionCard
      title={map.title || 'Map'}
      description={
        isStaff
          ? map.visibility === 'shared'
            ? 'The party can open this.'
            : 'Yours alone for now.'
          : undefined
      }
      actions={
        isStaff && (
          <>
            <Button
              size="sm"
              variant={placing ? 'solid' : 'flat'}
              color={placing ? 'primary' : 'default'}
              onPress={() => setPlacing(!placing)}
            >
              {placing ? 'Click the map' : 'Mark a place'}
            </Button>
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
              {map.visibility === 'shared' ? 'Take it back' : 'Show the party'}
            </Button>
            {/* The picture, not the map: pins carry the DM's private notes and
                have no business on a public shelf. */}
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
                  body: 'Every mark on it goes with it. The picture itself stays in the campaign.',
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

      <div
        ref={imageRef}
        onClick={place}
        className={`relative overflow-hidden rounded-[var(--radius-card)] border border-line ${
          placing ? 'cursor-crosshair' : ''
        }`}
      >
        {/* Deliberately an <img>: the file is served through a role-checked
            route, which next/image's optimiser cannot fetch on the server. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/campaigns/${campaignId}/images/${map.imageId}`}
          alt={map.title || 'Map'}
          className="block w-full"
        />

        {map.pins.map(pin => (
          <button
            key={pin.id}
            type="button"
            aria-label={pin.label || 'A mark'}
            onClick={event => {
              event.stopPropagation();
              setSelected(selected?.id === pin.id ? null : pin);
            }}
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2"
          >
            {/* Gold for what the party can see, arcane for what they cannot —
                ornament that encodes state (design rule 6). */}
            <Glyph
              name="target"
              size={20}
              className={
                pin.visibility === 'shared'
                  ? 'text-gold drop-shadow'
                  : 'text-arcane drop-shadow'
              }
            />
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-3 rounded-md border border-line bg-surface-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {isStaff ? (
              <Input
                size="sm"
                aria-label="What is here"
                className="min-w-40 flex-1"
                defaultValue={selected.label}
                onBlur={event =>
                  act(
                    updatePinAction(campaignId, selected.id, {
                      label: event.target.value,
                    })
                  )
                }
              />
            ) : (
              <span className="flex-1 text-sm text-ink">
                {selected.label || 'A mark'}
              </span>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-ink-subtle hover:text-ink"
            >
              close
            </button>
          </div>

          {selected.canonTitle && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
              <Glyph name="tome" size={13} className="text-gold" />
              {selected.canonTitle} — in the canon
            </p>
          )}

          {isStaff && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                aria-label="Link it to the canon"
                size="sm"
                className="w-56"
                placeholder="Not in the canon"
                selectedKeys={
                  selected.canonEntryId ? [selected.canonEntryId] : []
                }
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  act(
                    updatePinAction(campaignId, selected.id, {
                      canonEntryId: key ? String(key) : null,
                    })
                  );
                  setSelected(null);
                }}
              >
                {canon.map(entry => (
                  <SelectItem key={entry.id} textValue={entry.title}>
                    {entry.title || 'Untitled'}
                  </SelectItem>
                ))}
              </Select>

              <button
                type="button"
                onClick={() => {
                  act(
                    updatePinAction(campaignId, selected.id, {
                      visibility:
                        selected.visibility === 'shared' ? 'dm' : 'shared',
                    })
                  );
                  setSelected(null);
                }}
                className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-ink"
              >
                {selected.visibility === 'shared' ? 'hide it' : 'show them'}
              </button>
              <button
                type="button"
                onClick={() => {
                  act(deletePinAction(campaignId, selected.id));
                  setSelected(null);
                }}
                className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-danger"
              >
                remove
              </button>
            </div>
          )}
        </div>
      )}
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
  const [canon, setCanon] = useState<CanonEntryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    listCanonAction(campaignId)
      .then(setCanon)
      .catch(() => setCanon([]));
  }, [campaignId, refresh]);

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
              canon={canon}
              isStaff={isStaff}
              refresh={refresh}
              onError={setError}
            />
          ))}
        </div>
      )}

      {isStaff && maps.length > 0 && (
        <Marginalia dash>gold they can see, arcane they cannot</Marginalia>
      )}
    </div>
  );
}
