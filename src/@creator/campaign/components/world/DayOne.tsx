'use client';

import { Button, Input } from '@heroui/react';
import { useState } from 'react';

import { Glyph, Marginalia } from '@/@shared/components/ui';
import { createCanonAction } from '../../canon-actions';
import { addPlaceStopAction, createMapAction } from '../../map-actions';
import { ImagePicker } from '../ImagePicker';

/**
 * A world with nothing in it yet: two ways in, side by side.
 *
 * Pin up a map, and the World is that map with places to mark on it. Or
 * begin where the story does: name the first place, say what it sits
 * inside, and the party starts there — a stop at a place, with no picture
 * yet (0074). Everything written next lands in it until they move.
 */
export function DayOne({
  campaignId,
  onDone,
  onError,
}: {
  campaignId: string;
  /** Something was made: re-read, and open this place if there is one. */
  onDone: (placeId: string | null) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [imageId, setImageId] = useState<string | null>(null);
  const [mapTitle, setMapTitle] = useState('');
  const [first, setFirst] = useState('');
  const [inside, setInside] = useState('');
  const [busy, setBusy] = useState<'map' | 'start' | 'party' | null>(null);

  const pinUp = async () => {
    if (!imageId) return;
    setBusy('map');
    const res = await createMapAction(
      campaignId,
      imageId,
      mapTitle.trim() || 'The world',
      null
    );
    setBusy(null);
    if (!res.ok) onError(res.error);
    else await onDone(null);
  };

  /** The first place, inside a new one if one was named. */
  const writePlace = async (): Promise<string | null> => {
    let parent: string | null = null;
    if (inside.trim()) {
      const res = await createCanonAction(campaignId, {
        kind: 'location',
        title: inside.trim(),
        dmBody: '',
        partyBody: '',
        visibility: 'shared',
      });
      if (!res.ok) {
        onError(res.error);
        return null;
      }
      parent = res.data.id;
    }
    const res = await createCanonAction(campaignId, {
      kind: 'location',
      title: first.trim(),
      dmBody: '',
      partyBody: '',
      visibility: 'shared',
      placeId: parent,
    });
    if (!res.ok) {
      onError(res.error);
      return null;
    }
    return res.data.id;
  };

  const begin = async (withParty: boolean) => {
    if (!first.trim()) return;
    setBusy(withParty ? 'party' : 'start');
    const placeId = await writePlace();
    if (placeId && withParty) {
      const res = await addPlaceStopAction(campaignId, placeId);
      if (!res.ok) onError(res.error);
    }
    setBusy(null);
    if (placeId) await onDone(placeId);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-8 py-6">
      <div className="flex aspect-[10/7] max-w-xl flex-[1_1_26rem] flex-col items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-line bg-surface-2 p-6 text-center">
        <svg
          viewBox="0 0 120 120"
          width="96"
          height="96"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gold-strong dark:text-gold"
          aria-hidden
        >
          <path d="M20 34l26-9 28 9 26-9v62l-26 9-28-9-26 9z" />
          <path d="M46 25v62M74 34v62" />
          <path
            d="M30 60c6-4 10 3 16-1M56 48c5 3 8-2 12 1M82 66c4-2 7 2 10 0"
            opacity=".55"
          />
          <circle cx="62" cy="66" r="3.5" />
        </svg>
        <h3 className="font-display text-2xl text-ink">
          There is no map on the table yet
        </h3>
        <Marginalia>every great campaign starts on a napkin</Marginalia>
        <div className="w-full max-w-sm space-y-2 text-left">
          <ImagePicker
            campaignId={campaignId}
            value={imageId}
            onChange={setImageId}
            label="A map of the world"
          />
          {imageId && (
            <Input
              size="md"
              label="What it shows"
              labelPlacement="outside"
              placeholder="The Sword Coast"
              value={mapTitle}
              onValueChange={setMapTitle}
            />
          )}
        </div>
        <Button
          color="primary"
          isDisabled={!imageId}
          isLoading={busy === 'map'}
          startContent={<Glyph name="map" size={14} />}
          onPress={pinUp}
        >
          Pin up a map
        </Button>
        <p className="text-xs text-ink-subtle">
          Maps of cities and dungeons come later, inside their places.
        </p>
      </div>

      <div className="flex max-w-md flex-[1_1_20rem] flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 [box-shadow:var(--shadow-card)]">
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Glyph name="banner" size={13} />
          Or begin where the story does
        </p>
        <h3 className="font-display text-xl text-ink">
          Where does session one open?
        </h3>
        <p className="text-sm text-ink-muted">
          Name the first place. The party starts there, and everything you write
          next lands in it until they move.
        </p>
        <Input
          size="md"
          label="The first place"
          labelPlacement="outside"
          placeholder="The Gilded Oar, a riverside inn"
          value={first}
          onValueChange={setFirst}
        />
        <Input
          size="md"
          label="It sits inside"
          labelPlacement="outside"
          placeholder="Nowhere yet — or name the town"
          value={inside}
          onValueChange={setInside}
        />
        <Button
          color="primary"
          isDisabled={!first.trim()}
          isLoading={busy === 'party'}
          startContent={<Glyph name="banner" size={14} />}
          onPress={() => begin(true)}
        >
          The party is here
        </Button>
        <Button
          variant="light"
          isDisabled={!first.trim()}
          isLoading={busy === 'start'}
          onPress={() => begin(false)}
        >
          Only write the place
        </Button>
      </div>
    </div>
  );
}
