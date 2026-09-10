'use client';

import { Button, Input, Textarea } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  Glyph,
  Marginalia,
  Ribbon,
  SectionCard,
} from '@/@shared/components/ui';

import { publishCampaignAction, setPublicationStatusAction } from '../actions';
import { type PublicationCard } from '../lib/publication';

/**
 * Put a campaign on the shelf so somebody else can run it.
 *
 * The panel says what travels and what does not, because that is the question a
 * DM will actually have and the answer is the whole design: the package carries
 * the prep — canon with both bodies, quests, notes, maps, the homebrew in play —
 * and never the table. No members, no invites, no join code, no characters, no
 * record of the sessions you played.
 */
export function PublishCampaign({
  campaignId,
  name,
  listing,
}: {
  campaignId: string;
  name: string;
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

  return (
    <SectionCard
      title="Share this campaign"
      description="Somebody else can take your prep and run it at their own table."
      actions={listed ? <Ribbon tone="gold">On the shelf</Ribbon> : undefined}
    >
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-gold/80">
              Travels with it
            </h3>
            <ul className="mt-1 space-y-0.5 text-ink-muted">
              <li>Canon — both what the party knows and what you do</li>
              <li>Quests and their objectives</li>
              <li>Your prep notes</li>
              <li>Maps, their marks, and the pictures behind them</li>
              <li>Every piece of homebrew in play here</li>
            </ul>
          </div>
          <div>
            <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-ink-subtle">
              Stays here
            </h3>
            <ul className="mt-1 space-y-0.5 text-ink-muted">
              <li>Your players, their invites and the join code</li>
              <li>Their characters, and anything written on a sheet</li>
              <li>Sessions, rolls, journals, downtime and awards</li>
              <li>Loot, the treasury, and the screen you laid out</li>
            </ul>
          </div>
        </div>

        {open ? (
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
              placeholder="gothic, tier 2, city"
              value={tags}
              onValueChange={setTags}
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                color="primary"
                isLoading={busy}
                isDisabled={!title.trim()}
                onPress={() =>
                  run(() =>
                    publishCampaignAction(campaignId, { title, summary, tags })
                  )
                }
              >
                {listed ? 'Freeze it again' : 'Put it on the shelf'}
              </Button>
              <Button size="sm" variant="light" onPress={() => setOpen(false)}>
                Not now
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="bordered"
                onPress={() => setOpen(true)}
              >
                <Glyph name="books" size={14} />
                {listed ? 'Refresh the listing' : 'Publish the campaign'}
              </Button>
              {listed && listing && (
                <Button
                  size="sm"
                  variant="light"
                  isLoading={busy}
                  onPress={() =>
                    run(() =>
                      setPublicationStatusAction(listing.id, 'withdrawn')
                    )
                  }
                >
                  Take it off the shelf
                </Button>
              )}
            </div>
            {listed && listing && (
              <Marginalia dash>
                {listing.adoptions === 0
                  ? 'nobody has picked it up yet'
                  : `${listing.adoptions} ${
                      listing.adoptions === 1 ? 'table is' : 'tables are'
                    } running it`}
              </Marginalia>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
