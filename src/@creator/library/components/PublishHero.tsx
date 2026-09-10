'use client';

import { Button, Input, Textarea } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Glyph, Marginalia, Ribbon } from '@/@shared/components/ui';

import { publishCharacterAction, setPublicationStatusAction } from '../actions';
import { type PublicationCard } from '../lib/publication';

/**
 * Put one of your heroes on the shelf, as a pregen anyone can take.
 *
 * A snapshot, unlike homebrew: the sheet is frozen at this moment, together with
 * every homebrew row it references. A pregen that kept changing under the table
 * using it would be a bug rather than a feature — and the referenced content has
 * to travel, or the hero lands on a stranger's account with its species pointing
 * into a forge they cannot see.
 *
 * The play record does not travel. `character_secrets`, the DM's notes on the
 * sheet, the change history and the roll provenance are not part of what is
 * published.
 */
export function PublishHero({
  characterId,
  name,
  listing,
}: {
  characterId: string;
  name: string;
  /** The listing this hero already has, if they have one. */
  listing: PublicationCard | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(listing?.title ?? name);
  const [summary, setSummary] = useState(listing?.summary ?? '');
  const [tags, setTags] = useState((listing?.tags ?? []).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listed = listing?.status === 'listed';

  const run = async (
    action: () => Promise<{ ok: boolean; error?: string }>
  ) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {listed && <Ribbon tone="gold">On the shelf</Ribbon>}
          <Button size="sm" variant="bordered" onPress={() => setOpen(true)}>
            <Glyph name="books" size={14} />
            {listed ? 'Refresh the listing' : 'Publish as a pregen'}
          </Button>
          {listed && listing && (
            <Button
              size="sm"
              variant="light"
              isLoading={busy}
              onPress={() =>
                run(() => setPublicationStatusAction(listing.id, 'withdrawn'))
              }
            >
              Take them off the shelf
            </Button>
          )}
        </div>
        {listed && listing && (
          <Marginalia dash>
            {listing.adoptions === 0
              ? 'nobody has rolled them up yet'
              : `${listing.adoptions} ${
                  listing.adoptions === 1 ? 'table has' : 'tables have'
                } a copy — frozen as they were`}
          </Marginalia>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface-2 p-3">
      <Input
        size="sm"
        label="Title on the shelf"
        value={title}
        onValueChange={setTitle}
      />
      <Textarea
        size="sm"
        minRows={2}
        label="Who they are, in a line"
        value={summary}
        onValueChange={setSummary}
      />
      <Input
        size="sm"
        label="Tags"
        placeholder="pregen, tier 2, one-shot"
        value={tags}
        onValueChange={setTags}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Marginalia>
        the sheet as it stands, and what was forged for it — not the DM’s notes
      </Marginalia>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          color="primary"
          isLoading={busy}
          isDisabled={!title.trim()}
          onPress={() =>
            run(() =>
              publishCharacterAction(characterId, { title, summary, tags })
            )
          }
        >
          {listed ? 'Freeze them again' : 'Put them on the shelf'}
        </Button>
        <Button size="sm" variant="light" onPress={() => setOpen(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
