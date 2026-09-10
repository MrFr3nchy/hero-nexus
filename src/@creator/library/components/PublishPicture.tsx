'use client';

import { Button, Input, Textarea } from '@heroui/react';
import { useState } from 'react';

import { Glyph, Marginalia } from '@/@shared/components/ui';

import { publishImageAction } from '../actions';

/**
 * Put a picture on the public shelf.
 *
 * A snapshot kind: publishing copies the bytes out of the campaign, so the
 * listing survives that table being archived and needs no relaxing of the
 * role-checked campaign image route to be readable. Somebody adopting it gets a
 * copy of their own, in a campaign they run.
 */
export function PublishPicture({
  campaignImageId,
  defaultTitle,
  onPublished,
}: {
  campaignImageId: string;
  defaultTitle?: string;
  onPublished?: (publicationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle ?? '');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs text-ink-subtle">On the shelf.</span>;
  }

  if (!open) {
    return (
      <Button size="sm" variant="flat" onPress={() => setOpen(true)}>
        <Glyph name="books" size={14} />
        Publish it
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3">
      <Input
        size="sm"
        label="Title on the shelf"
        value={title}
        onValueChange={setTitle}
      />
      <Textarea
        size="sm"
        minRows={2}
        label="What it is, in a line"
        value={summary}
        onValueChange={setSummary}
      />
      <Input
        size="sm"
        label="Tags"
        placeholder="coast, dungeon, hand-drawn"
        value={tags}
        onValueChange={setTags}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Marginalia>a copy goes on the shelf — this one stays yours</Marginalia>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          color="primary"
          isLoading={busy}
          isDisabled={!title.trim()}
          onPress={async () => {
            setBusy(true);
            setError(null);
            const result = await publishImageAction(campaignImageId, {
              title,
              summary,
              tags,
            });
            setBusy(false);
            if (!result.ok) {
              setError(result.error ?? 'That did not work.');
              return;
            }
            setDone(true);
            setOpen(false);
            if (result.id) onPublished?.(result.id);
          }}
        >
          Put it on the shelf
        </Button>
        <Button size="sm" variant="light" onPress={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
