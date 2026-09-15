'use client';

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@heroui/react';
import { useState } from 'react';

import { canAct } from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import {
  ACTIONS,
  movementBudget,
  type ActionCost,
  type ActionKey,
  type TurnState,
} from '@/@creator/campaign/lib/turn';
import type { EntryRow } from '@/server/session';
import { Refused, type RefusedState } from '../Refused';
import { resetTurnAction, takeActionAction } from '../../turn-actions';

/** One slot of the turn, as a pip: empty, spent, or greyed when there is no slot. */
function Pip({
  label,
  spent,
  allowed,
  detail,
}: {
  label: string;
  spent: boolean;
  allowed: boolean;
  detail?: string;
}) {
  return (
    <Tooltip
      content={
        !allowed
          ? `${label} · none this turn`
          : spent
            ? `${label} · spent`
            : `${label} · available`
      }
    >
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className={`inline-block h-2.5 w-2.5 rounded-full border ${
            !allowed
              ? 'border-line bg-surface-2 opacity-50'
              : spent
                ? 'border-gold bg-gold'
                : 'border-gold/70 bg-transparent'
          }`}
        />
        <span
          className={`text-[0.6rem] uppercase tracking-[0.1em] ${
            !allowed
              ? 'text-ink-subtle line-through'
              : spent
                ? 'text-ink'
                : 'text-ink-muted'
          }`}
        >
          {label}
          {detail && (
            <span className="ml-1 normal-case tracking-normal tabular-nums text-ink-subtle">
              {detail}
            </span>
          )}
        </span>
      </span>
    </Tooltip>
  );
}

const COST_LABEL: Record<ActionCost, string> = {
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  movement: 'Movement',
  free: 'Free',
};

/**
 * The turn, on a card: four pips — action, bonus, reaction, feet moved of
 * the budget — and the menu of things to spend them on.
 *
 * Read-only for anybody it is not theirs to spend; for the combatant's own
 * player and for staff, each entry in the menu is one tap. A refusal (a spent
 * slot under Enforce, an incapacitated turn) shows where the tap happened,
 * with "Do it anyway" for staff — the `Refused` pattern from 01.
 *
 * Greyed pips are `canAct` (04) saying there is no such slot this turn:
 * stunned has no action to spend, grappled has no feet.
 */
export function TurnStrip({
  entry,
  canSpend,
  isStaff,
  refresh,
  onError,
  compact = false,
  offTurn = false,
}: {
  entry: EntryRow;
  /** The viewer may spend this turn: staff, or its own player. */
  canSpend: boolean;
  isStaff: boolean;
  refresh: () => Promise<void> | void;
  onError: (message: string) => void;
  /** Pips only, no menu — for the board's status line. */
  compact?: boolean;
  /**
   * Not this combatant's turn: only the reaction is theirs to spend, so
   * only that pip and the reaction menu show — Shield, the readied action,
   * the opportunity attack the corner just offered.
   */
  offTurn?: boolean;
}) {
  const [refusal, setRefusal] = useState<RefusedState | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const turn: TurnState = entry.turn;
  const allowance = canAct(parseConditions(entry.conditionKeys));
  const budget = movementBudget(turn, entry.speed);
  const total = entry.speed * (turn.dashed ? 2 : 1);

  const take = async (key: ActionKey, ruling = false) => {
    const def = ACTIONS.find(a => a.key === key);
    const res = await takeActionAction(entry.id, key, {
      note: def?.note ? note : undefined,
      ruling,
    });
    if (!res.ok) {
      if (res.overridable) {
        setRefusal({ message: res.error, ruling: () => take(key, true) });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefusal(null);
    setNote('');
    setOpen(false);
    await refresh();
  };

  const groups: { cost: ActionCost; keys: ActionKey[] }[] = (
    (offTurn
      ? ['reaction']
      : ['action', 'bonus', 'reaction', 'movement']) as ActionCost[]
  ).map(cost => ({
    cost,
    keys: ACTIONS.filter(a => a.cost === cost).map(a => a.key),
  }));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {!offTurn && (
        <>
          <Pip label="Action" spent={turn.action} allowed={allowance.action} />
          <Pip label="Bonus" spent={turn.bonus} allowed={allowance.bonus} />
        </>
      )}
      <Pip
        label="Reaction"
        spent={turn.reaction}
        allowed={allowance.reaction}
      />
      {!offTurn && (
        <Pip
          label="Move"
          spent={budget === 0}
          allowed={allowance.move && entry.speed > 0}
          detail={`${turn.movedFeet}/${total} ft`}
        />
      )}
      {(turn.dashed || turn.disengaged || turn.dodging || turn.ready) && (
        <span className="flex flex-wrap gap-1">
          {turn.dashed && <Flag>Dashing</Flag>}
          {turn.disengaged && <Flag>Disengaged</Flag>}
          {turn.dodging && <Flag>Dodging</Flag>}
          {turn.ready && (
            <Tooltip
              content={`${turn.ready.trigger || 'a trigger'} → ${turn.ready.action || 'the readied action'}`}
            >
              <span>
                <Flag>Ready</Flag>
              </span>
            </Tooltip>
          )}
        </span>
      )}

      {canSpend && !compact && (
        <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
          <PopoverTrigger>
            <Button
              size="sm"
              variant="flat"
              className="h-6 min-w-0 px-2 text-xs"
            >
              {offTurn ? 'React…' : 'Take…'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 border border-line bg-surface p-2">
            <div className="w-full space-y-2">
              {groups.map(g => (
                <div key={g.cost}>
                  <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle">
                    {COST_LABEL[g.cost]}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.keys.map(key => {
                      const def = ACTIONS.find(a => a.key === key)!;
                      return (
                        <Tooltip key={key} content={def.rule}>
                          <Button
                            size="sm"
                            variant="flat"
                            className="h-6 min-w-0 px-2 text-xs"
                            onPress={() => take(key)}
                          >
                            {def.label}
                          </Button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              ))}
              <Input
                size="sm"
                label="A note"
                placeholder="if the door opens → cast Shield"
                description="Read by Ready; kept on Help, Influence, Utilize and the bonus/reaction lines."
                value={note}
                onValueChange={setNote}
              />
              {isStaff && (
                <Button
                  size="sm"
                  variant="light"
                  className="text-ink-subtle"
                  onPress={async () => {
                    const res = await resetTurnAction(entry.id);
                    if (!res.ok) onError(res.error);
                    setOpen(false);
                    await refresh();
                  }}
                >
                  Hand the turn back
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {refusal && (
        <div className="basis-full">
          <Refused refusal={refusal} onDismiss={() => setRefusal(null)} />
        </div>
      )}
    </div>
  );
}

function Flag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-gold/50 bg-gold/10 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] text-gold-strong dark:text-gold">
      {children}
    </span>
  );
}
