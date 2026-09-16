'use client';

import {
  Button,
  Link,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@heroui/react';
import { useEffect, useState } from 'react';

import { LoadoutSection } from '@/@creator/character/components/sections/LoadoutSection';
import { useDiceTray } from '@/@shared/components/dice';
import { EmptyState, CandleScene } from '@/@shared/components/ui';
import type { CharacterRow } from '@/server/characters';
import type { PlayLoadout, PlayState } from '@/server/play';
import type { EffectRow } from '@/@creator/campaign/lib/effects';
import type { EntryRow } from '@/server/session';
import { TurnStrip } from '../session/TurnStrip';
import { consumeItemAction, getPlayLoadoutAction } from '../../play-actions';
import { PlayCard } from '../PlayCard';
import { Refused, type RefusedState } from '../Refused';

/**
 * Use a thing from the pack on your turn (09), beside the action pips: the
 * potion is in the pack a scroll below, but the moment to drink it is the
 * turn. One tap; the server pays the turn what the table says a potion
 * costs, rolls, lands it, and the loadout below refreshes with the row one
 * lighter. Somebody else's hero is the pack's own *To…* — administering is
 * a deliberate act, not a quick one.
 */
function UseOnTurn({
  characterId,
  campaignId,
  loadout,
  onLoadout,
  refresh,
  onError,
}: {
  characterId: string;
  campaignId: string;
  loadout: PlayLoadout;
  onLoadout: (next: PlayLoadout) => void;
  refresh: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const tray = useDiceTray();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<RefusedState | null>(null);
  const usable = loadout.items.filter(i => i.usable && i.quantity > 0);
  if (!loadout.canEdit || usable.length === 0) return null;

  const drink = async (itemId: string, ruling = false) => {
    setBusy(true);
    const res = await consumeItemAction(characterId, campaignId, {
      itemId,
      ruling,
    });
    setBusy(false);
    if (!res.ok) {
      if (res.overridable) {
        setRefused({ message: res.error, ruling: () => drink(itemId, true) });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefused(null);
    setOpen(false);
    onLoadout(res.data.loadout);
    if (res.data.roll) {
      const name = usable.find(i => i.id === itemId)?.name ?? 'Used';
      void tray.showNotationRoll(res.data.roll, { title: name });
    }
    await refresh();
  };

  return (
    <>
      <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <Button
            size="sm"
            variant="flat"
            color="primary"
            className="h-6 min-w-0 px-2 text-xs"
            isDisabled={busy}
          >
            Use…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 border border-line bg-surface p-2">
          <ul className="w-full space-y-1">
            {usable.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => drink(item.id)}
                  className="flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left text-sm text-ink hover:bg-surface-2 disabled:opacity-60"
                >
                  <span className="tabular-nums text-ink-subtle">
                    {item.quantity}&times;
                  </span>
                  <span className="min-w-0 flex-1">
                    {item.name}
                    {item.useWords && (
                      <span className="ml-1.5 text-xs text-ink-subtle">
                        {item.useWords}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      {refused && (
        <div className="basis-full">
          <Refused refusal={refused} onDismiss={() => setRefused(null)} />
        </div>
      )}
    </>
  );
}

/**
 * The player's own hero, on the table screen.
 *
 * The screen already gave players most of what the DM sees — initiative, the
 * party's hit points, the roll log, handouts. What it never gave them was the
 * half of their own sheet that changes during a session: what is in hand and
 * what is prepared. So a player ran their character in one tab and watched the
 * table in another.
 *
 * This is the same `LoadoutSection` the play surface mounts, not a second copy
 * of it — a spell prepared here is prepared there, because it is one component
 * over one server pair. Above it, the same `PlayCard` the party panel draws:
 * hit points, hit dice, death saves, slots, conditions. A player at the sand
 * table whose shelf carried their gear but not their hit points had nowhere
 * to take the hit, which is the one thing a fight is made of.
 */
export function MyHeroPanel({
  campaignId,
  myCharacters,
  play,
  loadoutKey,
  clocks,
  turnEntry,
  refresh,
  onError,
}: {
  campaignId: string;
  myCharacters: CharacterRow[];
  /** The viewer's own at-the-table numbers off the live read, when seated. */
  play?: PlayState;
  /** The clocks on the viewer's own combatant in the running fight. */
  clocks?: EffectRow[];
  /** The viewer's own tracker row, when it is their turn — for the strip. */
  turnEntry?: EntryRow;
  refresh?: () => Promise<void> | void;
  /**
   * The viewer's own `PlayState.loadoutKey` off the live state, when the
   * caller has it. It moves when the pack or the purse does — a potion handed
   * over by somebody else included — and the loadout is re-read when it does.
   */
  loadoutKey?: string;
  onError: (message: string) => void;
}) {
  // At most one, by the unique index on `(campaignId, userId)` — a player
  // fields one character per table.
  const mine = myCharacters.find(c => c.table?.campaignId === campaignId);
  const [loadout, setLoadout] = useState<PlayLoadout | null>(null);
  // A local copy so a press moves the number before the round trip lands;
  // the next live read overwrites it with the same answer — the party panel's
  // own reasoning, and the same card.
  const [local, setLocal] = useState<PlayState | undefined>(play);
  useEffect(() => setLocal(play), [play]);

  useEffect(() => {
    if (!mine) {
      setLoadout(null);
      return;
    }
    let live = true;
    getPlayLoadoutAction(mine.id, campaignId).then(next => {
      if (live) setLoadout(next);
    });
    return () => {
      live = false;
    };
  }, [mine, campaignId, loadoutKey]);

  if (!mine) {
    return (
      <EmptyState
        scene={<CandleScene />}
        title="No hero of yours at this table"
        description="Take a seat with one of your characters and their gear will be here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ink">{mine.name}</h3>
        <Link
          href={`/characters/${mine.id}/play`}
          className="text-sm text-ink-muted hover:text-ink"
        >
          Open the full sheet
        </Link>
      </div>
      {local && (
        <>
          {turnEntry && (
            <div className="rounded-md border border-gold/40 bg-gold/5 px-3 py-2">
              <p className="mb-1 text-xs text-gold-strong dark:text-gold">
                Your turn
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <TurnStrip
                  entry={turnEntry}
                  canSpend
                  isStaff={false}
                  refresh={refresh ?? (() => undefined)}
                  onError={onError}
                />
                {loadout && (
                  <UseOnTurn
                    characterId={mine.id}
                    campaignId={campaignId}
                    loadout={loadout}
                    onLoadout={setLoadout}
                    refresh={refresh ?? (() => undefined)}
                    onError={onError}
                  />
                )}
              </div>
            </div>
          )}
          <PlayCard
            state={local}
            campaignId={campaignId}
            physicalDice={local.physicalDice}
            clocks={clocks}
            onChange={setLocal}
            onError={onError}
          />
        </>
      )}
      {loadout ? (
        <LoadoutSection
          initial={loadout}
          characterId={mine.id}
          campaignId={campaignId}
          onError={onError}
          stacked
        />
      ) : (
        <p className="text-sm text-ink-subtle">Fetching what you carry…</p>
      )}
    </div>
  );
}
