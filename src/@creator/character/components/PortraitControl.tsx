'use client';

import { Button, Input, Tab, Tabs } from '@heroui/react';
import { useRef, useState } from 'react';

import { Glyph, useConfirm } from '@/@shared/components/ui';
import type { PortraitRow } from '@/server/character-portraits';

/**
 * Give a hero a face — by upload, or by link.
 *
 * Both are offered because they behave differently and the difference is worth
 * being honest about. An upload lives on this server and is served through a
 * route that checks who is asking. A link is fetched by the reader's browser
 * from somebody else's host: Hero Nexus makes no outbound calls at runtime, so
 * the server never sees the image, never caches it, and cannot tell you when
 * it disappears. The UI says so rather than hiding it.
 *
 * A plain `fetch` to the route rather than a server action, because a server
 * action cannot stream a file and the campaign handout and image uploads
 * already work this way.
 */
export function PortraitControl({
  characterId,
  initial,
  onChange,
}: {
  characterId: string;
  initial: PortraitRow | null;
  /** So a parent showing the portrait elsewhere can follow along. */
  onChange?: (portrait: PortraitRow | null) => void;
}) {
  const [portrait, setPortrait] = useState(initial);
  const [alt, setAlt] = useState(initial?.alt ?? '');
  const [url, setUrl] = useState(initial?.remote ? initial.url : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  const settle = (next: PortraitRow | null) => {
    setPortrait(next);
    onChange?.(next);
  };

  const send = async (body: FormData) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/portrait`, {
        method: 'POST',
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'That did not work.');
        return;
      }
      settle(data.portrait as PortraitRow);
      if (fileInput.current) fileInput.current.value = '';
    } catch {
      setError('That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const upload = (file: File) => {
    const body = new FormData();
    body.set('file', file);
    body.set('alt', alt);
    void send(body);
  };

  const link = () => {
    const body = new FormData();
    body.set('url', url);
    body.set('alt', alt);
    void send(body);
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Remove this portrait?',
      body: 'The picture goes; the character stays exactly as they are.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/characters/${characterId}/portrait`, {
      method: 'DELETE',
    }).catch(() => {});
    setBusy(false);
    settle(null);
    setUrl('');
  };

  return (
    <div className="space-y-3">
      {dialog}

      <div className="flex flex-wrap items-start gap-4">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-2">
          {portrait ? (
            /* A linked portrait is an arbitrary off-site host, which
               `next/image` would need configuring for one domain at a time. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={portrait.url}
              alt={portrait.alt || 'Character portrait'}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-subtle">
              <Glyph name="person" size={22} />
              <span className="text-[0.65rem]">no face yet</span>
            </div>
          )}
        </div>

        <div className="min-w-[16rem] flex-1 space-y-2">
          <Input
            size="sm"
            label="Describe the picture"
            description="Read out when the image cannot load, and by screen readers."
            value={alt}
            onValueChange={setAlt}
            maxLength={200}
          />
          {portrait && (
            <div className="flex items-center gap-3">
              {portrait.remote && (
                <span className="text-xs text-ink-subtle">
                  Linked from another site — your browser loads it, this server
                  never does.
                </span>
              )}
              <Button
                size="sm"
                variant="light"
                isDisabled={busy}
                className="ml-auto text-ink-subtle data-[hover=true]:text-danger"
                onPress={remove}
              >
                Remove
              </Button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Tabs
        aria-label="How to add a portrait"
        size="sm"
        classNames={{ tabList: 'bg-surface-2' }}
      >
        <Tab key="upload" title="Upload one">
          <div className="space-y-2 pt-1">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-gold/60"
            />
            <p className="text-xs text-ink-subtle">
              PNG, JPEG, WebP or GIF, up to 4 MB. Kept on this server.
            </p>
          </div>
        </Tab>
        <Tab key="link" title="Link to one">
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-end gap-2">
              <Input
                size="sm"
                label="Image address"
                placeholder="https://…"
                value={url}
                onValueChange={setUrl}
                className="min-w-[16rem] flex-1"
              />
              <Button
                size="sm"
                variant="flat"
                isDisabled={busy || !url.trim()}
                onPress={link}
              >
                Use this link
              </Button>
            </div>
            <p className="text-xs text-ink-subtle">
              Loaded by whoever is looking at the sheet, straight from that
              site. This server never fetches it, so it will not work offline
              and nobody here will know if it disappears.
            </p>
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
