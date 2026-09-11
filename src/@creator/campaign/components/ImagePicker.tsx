'use client';

import { Button } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import type { CampaignImageRow } from '@/server/campaign-images';
import { listCampaignImagesAction } from '../image-actions';

/**
 * Attach a picture to a campaign thing — an NPC's portrait, a sketch of an
 * item, a page from someone's notebook.
 *
 * The file goes straight to the campaign's upload route and what comes back is
 * an id; the caller stores that id on its own row. Bytes never travel through
 * a server action, and never sit in the database as base64.
 */
export function ImagePicker({
  campaignId,
  value,
  onChange,
  label = 'Picture',
  library = false,
}: {
  campaignId: string;
  /** The stored image id, or null for none. */
  value: string | null;
  onChange: (imageId: string | null) => void;
  label?: string;
  /**
   * Offer the campaign's existing pictures as well as an upload. The sand
   * table stands the same ogre up five times, and uploading it five times
   * is five copies of one file.
   */
  library?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shelf, setShelf] = useState<CampaignImageRow[]>([]);
  // Re-read after an upload, so the new picture joins the shelf at once.
  const [seq, setSeq] = useState(0);
  useEffect(() => {
    if (!library) return;
    let live = true;
    listCampaignImagesAction(campaignId).then(rows => {
      if (live) setShelf(rows);
    });
    return () => {
      live = false;
    };
  }, [campaignId, library, seq]);

  const upload = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('alt', file.name.replace(/\.[^.]+$/, ''));

      const res = await fetch(`/api/campaigns/${campaignId}/images`, {
        method: 'POST',
        body,
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.id) {
        setError(data.error ?? 'Upload failed.');
        return;
      }
      onChange(data.id);
      setSeq(n => n + 1);
    } catch {
      setError('Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <div className="font-display-alt text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </div>

      <div className="mt-1.5 flex items-center gap-3">
        {value ? (
          // Role-checked route, so not next/image — see EntryCard.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/campaigns/${campaignId}/images/${value}`}
            alt=""
            className="h-16 w-16 rounded-md border border-line object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-line text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle">
            none
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="bordered"
            className="border-line text-ink"
            isLoading={busy}
            onPress={() => input.current?.click()}
          >
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() => onChange(null)}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      {library && shelf.length > 0 && (
        <ul
          className="mt-2 flex max-w-full gap-1.5 overflow-x-auto py-1"
          aria-label="The campaign's pictures"
        >
          {shelf.map(img => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onChange(img.id)}
                title={img.alt || 'A picture'}
                aria-label={img.alt || 'A picture'}
                aria-pressed={img.id === value}
                className={`block h-12 w-12 overflow-hidden rounded-md border ${
                  img.id === value
                    ? 'border-gold ring-1 ring-gold/40'
                    : 'border-line hover:border-ink-subtle'
                }`}
              >
                {/* Role-checked route, so not next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <p className="mt-1.5 text-xs text-ink-subtle">
        PNG, JPEG, WebP or GIF, up to 8 MB. Stored with the campaign&rsquo;s
        handouts, not in the sheet.
      </p>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
