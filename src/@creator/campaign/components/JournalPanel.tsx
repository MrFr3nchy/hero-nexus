'use client';

import { Button, Input, Textarea } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Glyph,
  Marginalia,
  QuietDeskScene,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { JournalRow, JournalVisibility } from '@/server/journals';
import {
  createJournalAction,
  deleteJournalAction,
  listJournalsAction,
  updateJournalAction,
} from '../journal-actions';

/**
 * Who gets to read it.
 *
 * The wording matters more than usual here: a player has to be able to tell at
 * a glance that "Yours alone" means the DM cannot read it either, because that
 * is the only reason to write anything honest in it.
 */
const AUDIENCE: {
  key: JournalVisibility;
  label: string;
  hint: string;
}[] = [
  {
    key: 'private',
    label: 'Yours alone',
    hint: 'Nobody else — not the other players, not the DM.',
  },
  { key: 'dm', label: 'You and the DM', hint: 'For a question, or a plan.' },
  { key: 'party', label: 'The whole table', hint: 'Everyone at this table.' },
];

function Page({
  campaignId,
  page,
  refresh,
  onError,
}: {
  campaignId: string;
  page: JournalRow;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState({ title: page.title, body: page.body });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    setDraft({ title: page.title, body: page.body });
    setDirty(false);
  }, [page.id, page.title, page.body]);

  const audience = AUDIENCE.find(a => a.key === page.visibility);

  if (!page.mine) {
    return (
      <SectionCard
        title={page.title || 'Untitled'}
        description={
          page.authorName
            ? `${page.authorName} — ${page.visibility === 'party' ? 'shared with the table' : 'sent to you'}`
            : undefined
        }
      >
        <p className="whitespace-pre-wrap font-hand text-[1.1875rem] leading-relaxed text-ink-muted">
          {page.body}
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={
        <Input
          aria-label="Page title"
          variant="underlined"
          value={draft.title}
          onValueChange={v => {
            setDraft({ ...draft, title: v });
            setDirty(true);
          }}
          classNames={{ input: 'font-display text-lg' }}
        />
      }
      actions={
        <>
          <Button
            size="sm"
            variant="flat"
            isDisabled={!dirty || saving}
            isLoading={saving}
            onPress={async () => {
              setSaving(true);
              const res = await updateJournalAction(campaignId, page.id, draft);
              setSaving(false);
              if (!res.ok) {
                onError(res.error);
                return;
              }
              setDirty(false);
              await refresh();
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="light"
            onPress={async () => {
              const yes = await confirm({
                title: 'Tear out this page?',
                body: 'It goes, including for anyone you had shared it with.',
                confirmLabel: 'Tear it out',
                destructive: true,
              });
              if (!yes) return;
              const res = await deleteJournalAction(campaignId, page.id);
              if (!res.ok) {
                onError(res.error);
                return;
              }
              await refresh();
            }}
          >
            Tear out
          </Button>
        </>
      }
    >
      {dialog}

      <div className="flex flex-col gap-3">
        <Textarea
          aria-label="Page"
          minRows={6}
          placeholder="The reeve was lying about the mill, and I think Thora knows it…"
          value={draft.body}
          onValueChange={v => {
            setDraft({ ...draft, body: v });
            setDirty(true);
          }}
          classNames={{ input: 'font-hand text-[1.1875rem] leading-relaxed' }}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {AUDIENCE.map(a => (
            <button
              key={a.key}
              type="button"
              onClick={async () => {
                const res = await updateJournalAction(campaignId, page.id, {
                  visibility: a.key,
                });
                if (!res.ok) onError(res.error);
                await refresh();
              }}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                page.visibility === a.key
                  ? 'border-gold bg-gold/15 text-ink'
                  : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
              }`}
            >
              {a.label}
            </button>
          ))}
          {audience && (
            <span className="text-xs text-ink-subtle">{audience.hint}</span>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/**
 * The players' own notebook.
 *
 * Every other note surface in this app belongs to the DM. This one does not:
 * a page marked "Yours alone" is not readable by staff, and the filtering that
 * guarantees it happens on the server rather than here — a private page
 * reaching a DM's browser at all has already broken the promise, rendered or
 * not.
 */
export function JournalPanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerRole: 'gm' | 'co-gm' | 'player';
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [pages, setPages] = useState<JournalRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setPages(await listJournalsAction(campaignId));
    } catch {
      setError('Failed to open your notebook.');
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!pages) {
    return (
      <div className="flex justify-center py-10">
        <DiceSpinner label="Finding your notebook…" />
      </div>
    );
  }

  const mine = pages.filter(p => p.mine);
  const theirs = pages.filter(p => !p.mine);

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <SectionCard
        title="Your notebook"
        description="Yours by default. Share a page only when you mean to."
      >
        <div className="flex flex-wrap items-end gap-2">
          <Input
            size="sm"
            label="A new page"
            placeholder="What I think the reeve is up to"
            value={title}
            onValueChange={setTitle}
            className="min-w-40 flex-1"
          />
          <Button
            size="sm"
            color="primary"
            isDisabled={!title.trim()}
            onPress={async () => {
              const res = await createJournalAction(campaignId, { title });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setTitle('');
              await refresh();
            }}
          >
            Start it
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle">
          <Glyph name="key" size={13} />A new page starts as yours alone. Not
          even the DM can read it.
        </p>
      </SectionCard>

      {mine.length === 0 && theirs.length === 0 ? (
        <EmptyState
          scene={<QuietDeskScene />}
          title="A blank notebook"
          description={
            isStaff
              ? 'Your own pages, and anything the players hand to you, live here.'
              : 'Somewhere to work out what is going on, without anyone reading over your shoulder.'
          }
        />
      ) : (
        <div className="space-y-4">
          {mine.map(p => (
            <Page
              key={p.id}
              campaignId={campaignId}
              page={p}
              refresh={refresh}
              onError={setError}
            />
          ))}

          {theirs.length > 0 && (
            <>
              <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                Handed to you
              </p>
              {theirs.map(p => (
                <Page
                  key={p.id}
                  campaignId={campaignId}
                  page={p}
                  refresh={refresh}
                  onError={setError}
                />
              ))}
            </>
          )}
        </div>
      )}

      <Marginalia dash>nobody reads this but you, unless you say so</Marginalia>
    </div>
  );
}
