'use client';

import { Button } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { backdropSize, parseUvtt } from '@/@shared/battlemap/uvtt';
import { importUvttBoardAction } from '../../battlemap-actions';

/** The image route's limit is 8 MB; aim under it with room to spare. */
const TARGET_BYTES = 7.5 * 1024 * 1024;

/**
 * Bring in a Universal VTT map (`.dd2vtt`, `.df2vtt`, `.uvtt`) as a new
 * battle board: its picture as the floor, its walls, doors and lights on
 * the grid.
 *
 * Everything heavy happens here, in the browser. The picture inside the
 * file is routinely bigger than a request may be (Caddy takes 24 MB, the
 * image route 8 MB), so it is decoded, scaled to about 140 pixels a square
 * and re-encoded as WebP before it is uploaded like any other picture.
 * Only the geometry, which is small, goes to the server action.
 */
export function UvttImport({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  const run = async (file: File) => {
    setError(null);
    setNotes([]);
    try {
      setStep('Reading the map…');
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error(
          'That file is not a Universal VTT map. Export it again as .dd2vtt.'
        );
      }
      const parsed = parseUvtt(json);
      if (!parsed.ok) throw new Error(parsed.error);
      const g = parsed.geometry;

      let imageId: string | null = null;
      if (g.image) {
        setStep('Fitting the picture to the board…');
        const blob = await shrink(g.image, g.w, g.h);
        setStep('Uploading the picture…');
        const form = new FormData();
        form.append(
          'file',
          new File([blob], `${file.name.replace(/\.\w+$/, '')}.webp`, {
            type: 'image/webp',
          })
        );
        form.append('alt', `Battle map: ${file.name}`);
        const res = await fetch(`/api/campaigns/${campaignId}/images`, {
          method: 'POST',
          body: form,
        });
        const body = (await res.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
        };
        if (!res.ok || !body.id) {
          throw new Error(body.error ?? 'The picture did not upload.');
        }
        imageId = body.id;
      }

      setStep('Laying out the board…');
      const res = await importUvttBoardAction(campaignId, {
        name: file.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' '),
        w: g.w,
        h: g.h,
        walls: g.walls,
        lights: g.lights,
        imageId,
      });
      if (!res.ok) throw new Error(res.error);
      setNotes(g.notes);
      router.push(`/campaigns/${campaignId}/workshop/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That map did not import.');
    } finally {
      setStep(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="flat"
          isLoading={step !== null}
          onPress={() => input.current?.click()}
        >
          Import a Universal VTT map
        </Button>
        <input
          ref={input}
          type="file"
          accept=".dd2vtt,.df2vtt,.uvtt,application/json"
          className="sr-only"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(file);
          }}
        />
        {step && <span className="text-xs text-ink-muted">{step}</span>}
      </div>
      <p className="text-xs text-ink-subtle">
        From Dungeondraft, DungeonFog or Arkenforge: the picture becomes the
        floor; walls and doors are fitted to the grid, diagonals as steps. Up to
        60 × 60 squares.
      </p>
      {notes.length > 0 && (
        <p className="text-xs text-ink-muted">{notes.join(' ')}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Decode the file's base64 picture, scale it to the board, and encode it as
 * WebP under the upload limit — dropping quality, then size, until it fits.
 */
async function shrink(base64: string, w: number, h: number): Promise<Blob> {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes]));
  let { width, height } = backdropSize(w, h);
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the picture.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.86, 0.72, 0.6]) {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/webp', quality)
      );
      if (blob && blob.type === 'image/webp' && blob.size <= TARGET_BYTES) {
        bitmap.close();
        return blob;
      }
    }
    width = Math.round(width * 0.8);
    height = Math.round(height * 0.8);
  }
  bitmap.close();
  throw new Error('The picture would not fit under 8 MB.');
}
