'use client';

import { Button, Input, Textarea } from '@heroui/react';
import { useState } from 'react';

import { Glyph, Marginalia, Ribbon } from '@/@shared/components/ui';

import { publishHomebrewAction, setPublicationStatusAction } from '../actions';
import { normaliseTags, type PublicationCard } from '../lib/publication';

/**
 * Putting one forged thing on the public shelf, from inside the Forge.
 *
 * Publishing is live-linked: the listing points at this row, so a correction
 * made here reaches every table that took it. That is the promise the control
 * has to make plain, which is why the line under the button says it rather than
 * leaving a reader to discover it when their spell changes under them.
 *
 * Re-publishing an already-listed row re-freezes its fallback copy and bumps the
 * version. It is an edit of the listing that exists, never a second one.
 */
export function PublishToLibrary({
  homebrewId,
  name,
  description,
  listing,
  onChanged,
}: {
  homebrewId: string;
  name: string;
  description: string;
  /** The listing this row already has, if it has one. */
  listing: PublicationCard | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(listing?.title ?? name);
  const [summary, setSummary] = useState(
    listing?.summary ?? description.slice(0, 200)
  );
  const [tags, setTags] = useState((listing?.tags ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listed = listing?.status === 'listed';

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await publishHomebrewAction(homebrewId, {
      title: title.trim() || name,
      summary,
      tags: normaliseTags(tags),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    setOpen(false);
    onChanged();
  };

  const withdraw = async () => {
    if (!listing) return;
    setBusy(true);
    setError(null);
    const result = await setPublicationStatusAction(listing.id, 'withdrawn');
    setBusy(false);
    if (!result.ok) setError(result.error ?? 'That did not work.');
    else onChanged();
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {listed && <Ribbon tone="gold">On the shelf</Ribbon>}
          <Button size="sm" variant="bordered" onPress={() => setOpen(true)}>
            <Glyph name="books" size={14} />
            {listed ? 'Edit the listing' : 'Publish to the Library'}
          </Button>
          {listed && (
            <Button
              size="sm"
              variant="light"
              isLoading={busy}
              onPress={withdraw}
            >
              Take it off the shelf
            </Button>
          )}
        </div>
        {listed && listing && (
          <Marginalia dash>
            {listing.adoptions === 0
              ? 'nobody has taken it yet'
              : `${listing.adoptions} ${
                  listing.adoptions === 1 ? 'shelf has' : 'shelves have'
                } it — your edits reach them`}
          </Marginalia>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3">
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
        placeholder="undead, gothic, tier 3"
        description="Up to eight, comma separated."
        value={tags}
        onValueChange={setTags}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Marginalia>this stays yours — what you fix here, they get</Marginalia>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" color="primary" isLoading={busy} onPress={submit}>
          {listed ? 'Update the listing' : 'Put it on the shelf'}
        </Button>
        <Button size="sm" variant="light" onPress={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
