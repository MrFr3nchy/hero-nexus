'use client';

import { Button } from '@heroui/react';
import { useEffect, useState } from 'react';

import { Glyph } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { TurnStrip } from '../session/TurnStrip';

/**
 * Your turn, unmissable (12).
 *
 * The corner slip for the reader's own turn passes; this does not. A gold
 * bar across the top of the screen from the moment the order lands on their
 * hero until it moves on, they act, or they put it away — with the turn's
 * pips (05) on it, so the action is one press from the thing that said it
 * was theirs. Keyed on the round and the entry, so a dismissed banner stays
 * dismissed for that turn and comes back on the next one.
 *
 * The status language (rule 9): the reader's own thing takes the ink bar
 * and the word yours. No motion.
 */
export function YourTurnBanner({
  state,
  refresh,
  onError,
}: {
  state: LiveState;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const enc = state.encounter;
  const own = state.entries.find(
    e => e.characterId !== null && e.characterId === state.viewerCharacterId
  );
  const mine = !!own && !!enc?.isActive && state.turnEntryIds.includes(own.id);
  const key = mine && enc ? `${enc.id}:${enc.round}:${own.id}` : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (!key) setDismissed(null);
  }, [key]);
  if (!key || dismissed === key || !own) return null;

  const spent = own.turn.action && own.turn.bonus;
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold/50 border-l-4 border-l-ink bg-gold/10 px-3 py-1.5"
    >
      <Glyph
        name="sword"
        size={14}
        className="text-gold-strong dark:text-gold"
      />
      <span className="text-sm font-semibold text-ink">
        Your turn
        <span className="ml-1.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-ink">
          yours
        </span>
      </span>
      <span className="text-xs text-ink-subtle">
        Round {enc?.round} · {own.label}
        {spent ? ' · action and bonus spent' : ''}
      </span>
      <TurnStrip
        entry={own}
        canSpend
        isStaff={false}
        refresh={refresh}
        onError={onError}
      />
      <Button
        size="sm"
        variant="light"
        className="ml-auto h-6 min-w-0 px-2 text-xs text-ink-subtle"
        onPress={() => setDismissed(key)}
      >
        Put it away
      </Button>
    </div>
  );
}
