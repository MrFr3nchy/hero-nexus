'use client';

import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';

import {
  CandleScene,
  EmptyState,
  Glyph,
  Marginalia,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { closeSittingAction, openSittingAction } from '../../chronicle-actions';

/** "1h 20m", or "just now" for the first minute. */
function since(startedAt: string | null, now: number): string {
  if (!startedAt) return 'just now';
  const ms = now - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const ROLE_MARK = {
  gm: 'The DM',
  'co-gm': 'Co-DM',
  player: '',
} as const;

/**
 * Whether the table is sitting, and who is actually looking.
 *
 * Presence is the half nobody can fake: it comes from the connections the
 * server is holding open, so an empty list means an empty room rather than a
 * stale row somebody forgot to clear. The reader themselves is in it — seeing
 * your own name is how you know the thing is telling the truth.
 */
export function SittingCard({
  campaignId,
  state,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { confirm, dialog } = useConfirm();

  // One tick a minute: the only thing that moves here is how long it has been.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sitting = state.sitting;
  const watchers = state.watchers ?? [];

  const open = async () => {
    setBusy(true);
    const res = await openSittingAction(campaignId);
    setBusy(false);
    if (!res.ok) onError(res.error);
    await refresh();
  };

  const close = async () => {
    const ok = await confirm({
      title: 'The table rises?',
      body: 'The evening is filed, the register is filled in, and everyone is told.',
      confirmLabel: 'Rise',
    });
    if (!ok) return;
    setBusy(true);
    const res = await closeSittingAction(campaignId);
    setBusy(false);
    if (!res.ok) onError(res.error);
    await refresh();
  };

  return (
    <>
      {dialog}
      <SectionCard
        title={sitting ? 'The table is sitting' : 'The table'}
        description={
          sitting
            ? `Session ${sitting.number}${sitting.title ? ` · ${sitting.title}` : ''} · ${since(sitting.startedAt, now)}`
            : 'Nobody has called the evening yet.'
        }
        actions={
          isStaff &&
          (sitting ? (
            <Button size="sm" variant="flat" isDisabled={busy} onPress={close}>
              Rise
            </Button>
          ) : (
            <Button
              size="sm"
              color="primary"
              isDisabled={busy}
              isLoading={busy}
              onPress={open}
            >
              Take your seats
            </Button>
          ))
        }
      >
        {watchers.length === 0 ? (
          <EmptyState
            scene={<CandleScene />}
            title="Nobody is looking"
            description="The room is lit and empty. It fills as people open the table."
          />
        ) : (
          <>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {watchers.map(w => (
                <li
                  key={w.userId}
                  className="flex items-center gap-1.5 text-sm text-ink"
                >
                  <Glyph
                    name="person"
                    size={13}
                    className="text-gold-strong dark:text-gold"
                  />
                  {w.name}
                  {ROLE_MARK[w.role] && (
                    <span className="text-xs text-ink-subtle">
                      {ROLE_MARK[w.role]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <Marginalia className="mt-2" dash>
              {watchers.length === 1
                ? 'just you, so far'
                : `${watchers.length} at the table`}
            </Marginalia>
          </>
        )}
      </SectionCard>
    </>
  );
}
