'use client';

import { Button, Textarea } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  CandleScene,
  DiceSpinner,
  EmptyState,
  Glyph,
  Marginalia,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import { formatCalendarDate } from '@/@shared/lib/dates';
import type { CampaignRole } from '@/server/campaigns';
import type { RevealRow } from '@/server/notes';
import {
  deleteRevealAction,
  listRevealsAction,
  revealExcerptAction,
  widenRevealAction,
} from '../notes-actions';

const SOURCE_LABEL: Record<RevealRow['sourceKind'], string> = {
  note: 'from the notebook',
  session: 'from a sitting',
  quest: 'from a thread',
  canon: 'from the canon',
  free: 'said at the table',
};

/**
 * What the party knows, in the order they came to know it.
 *
 * Until this existed the answer to "we last played three weeks ago, what do we
 * actually know?" was scattered across canon entries, quest summaries and
 * recaps with no shared chronology, and a player had to reconstruct it by
 * opening four tabs. Each line is frozen at the moment it was told, so this
 * reads as a record rather than as the DM's current draft.
 */
export function RevealTimeline({
  campaignId,
  viewerRole,
  reloadKey,
}: {
  campaignId: string;
  viewerRole: CampaignRole;
  /** Bump to force a re-read — the notebook does this after a reveal. */
  reloadKey?: number;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [reveals, setReveals] = useState<RevealRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [saying, setSaying] = useState(false);
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setReveals(await listRevealsAction(campaignId));
    } catch {
      setError('Failed to read what the party knows.');
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh, reloadKey]);

  if (!reveals) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Remembering…" />
      </div>
    );
  }

  const sayIt = async () => {
    setSaying(true);
    const res = await revealExcerptAction(campaignId, {
      body,
      sourceKind: 'free',
      visibility: 'party',
    });
    setSaying(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBody('');
    await refresh();
  };

  return (
    <div className="space-y-5">
      {dialog}

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isStaff && (
        <SectionCard
          title="Tell the table something"
          description="Goes straight onto the timeline. For the things you say out loud and want written down."
        >
          <div className="flex flex-col gap-2">
            <Textarea
              aria-label="What the party learns"
              minRows={2}
              placeholder="The reeve left for the capital a week ago, they are told."
              value={body}
              onValueChange={setBody}
              classNames={{ input: 'font-hand text-[1.1875rem] leading-snug' }}
            />
            <div>
              <Button
                size="sm"
                color="primary"
                isDisabled={!body.trim() || saying}
                isLoading={saying}
                onPress={sayIt}
              >
                They learn it
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {reveals.length === 0 ? (
        <EmptyState
          scene={<CandleScene />}
          title="Nothing told yet"
          description={
            isStaff
              ? 'Everything you hand over — from a note, a page or out loud — is written down here in the order it happened.'
              : 'Whatever you learn at this table gets written down here, so you can catch up before the next sitting.'
          }
        />
      ) : (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {reveals.map(r => (
            <li key={r.id} className="relative">
              {/* The mark on the line: gold for the table, arcane for a
                  confidence. Ornament that encodes state (design rule 6). */}
              <span
                className={`absolute -left-[1.5625rem] top-2 h-2 w-2 rounded-full ${
                  r.visibility === 'party' ? 'bg-gold' : 'bg-arcane'
                }`}
                aria-hidden="true"
              />

              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                  {formatCalendarDate(r.createdAt)}
                </span>
                {isStaff && (
                  <span className="text-xs text-ink-subtle">
                    {SOURCE_LABEL[r.sourceKind]}
                  </span>
                )}
                {r.visibility === 'selected' && (
                  <span className="inline-flex items-center gap-1 text-xs text-arcane">
                    <Glyph name="letter" size={12} />
                    {r.toMeOnly
                      ? 'for you alone'
                      : `told to ${
                          r.targets.map(t => t.name ?? 'someone').join(', ') ||
                          'nobody'
                        }`}
                  </span>
                )}
              </div>

              <p className="mt-1 whitespace-pre-wrap font-hand text-[1.1875rem] leading-snug text-ink-muted">
                {r.body}
              </p>

              {isStaff && (
                <div className="mt-1 flex gap-3">
                  {r.visibility === 'selected' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await widenRevealAction(campaignId, r.id);
                        if (!res.ok) setError(res.error);
                        await refresh();
                      }}
                      className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-ink"
                    >
                      tell the rest
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const yes = await confirm({
                        title: 'Strike this from the record?',
                        body: 'Use this for the line pasted into the wrong campaign. It cannot un-tell anyone who has already read it.',
                        confirmLabel: 'Strike it',
                        destructive: true,
                      });
                      if (!yes) return;
                      const res = await deleteRevealAction(campaignId, r.id);
                      if (!res.ok) setError(res.error);
                      await refresh();
                    }}
                    className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-danger"
                  >
                    strike
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!isStaff && reveals.length > 0 && (
        <Marginalia dash>everything you have been told, in order</Marginalia>
      )}
    </div>
  );
}
