'use client';

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Tooltip,
} from '@heroui/react';
import { useState } from 'react';

import { Glyph, StatusMark, useConfirm } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import {
  SCREEN_STATES,
  TABLE_META,
  type ScreenState,
  type TableKind,
} from '../../lib/screen';
import {
  createEncounterAction,
  endEncounterAction,
  startFightAction,
} from '../../actions';
import { closeSittingAction, openSittingAction } from '../../chronicle-actions';
import { setTableModeAction } from '../../rules-actions';
import { undoLastAction } from '../../monster-actions';
import { listPlansAction, runPlanAction } from '../../encounter-actions';
import type { PlanRow } from '@/server/encounter-plans';
import { WorldClockControl } from './WorldClockControl';
import { AmbienceControl } from './AmbienceControl';
import { SHORTCUTS, type Typing } from './useDmShortcuts';

/**
 * The mode bar: the screen's two states in a row, the one the campaign is
 * at lit, and the verbs that move it.
 *
 * The state is derived — an open session and a running fight already say
 * which — so there is no "switch to battle" here. What there is: *Start the
 * session* / *End the session* and *Roll for initiative* / *End the fight*,
 * put where the room is so changing the room is one press from inside it.
 *
 * The lit segment says where the campaign is, in the status language: a
 * filled dot for the state the campaign is actually at. Pressing the other
 * pins the screen there: a player who wants the board up between fights, a
 * DM checking a note mid-session. A pin is the viewer's own, stored with
 * their layouts, and says nothing to anybody else; the segment they pinned
 * takes the ink bar that means *yours*.
 *
 * The gavel is the table's Advise / Enforce switch, staff only, one tap and
 * no confirm: flipping it announces itself to everyone, which is the
 * confirmation. It reads the rules in force, so while a fight overrides the
 * mode the pill says what the fight says and hands the tap to the initiative
 * box, where that override lives.
 */
export function ModeBar({
  campaignId,
  state,
  isStaff,
  current,
  pinned,
  onPin,
  refresh,
  onError,
  typing = null,
  onHelp,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  /** What the screen is showing, pin included. */
  current: ScreenState;
  pinned: ScreenState | null;
  onPin: (pin: ScreenState | null) => void | Promise<void>;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
  /** A D/H number being typed (11), shown so nothing is applied blind. */
  typing?: Typing | null;
  /** Opens the `?` list. */
  onHelp?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  // Planned fights, read when the Start-a-fight menu first opens.
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const fightChoices: {
    key: string;
    label: string;
    description: string;
    planned: boolean;
  }[] = [
    {
      key: 'blank',
      label: 'From nothing',
      description: 'An empty order — seat the party and add the foes yourself.',
      planned: false,
    },
    ...(plans === null
      ? [
          {
            key: 'loading',
            label: 'Reading the plans…',
            description: '',
            planned: true,
          },
        ]
      : plans.map(plan => ({
          key: plan.id,
          label: plan.name,
          description: `${plan.maths.bodyCount} ${
            plan.maths.bodyCount === 1 ? 'body' : 'bodies'
          } · placed on its board, where you put them`,
          planned: true,
        }))),
  ];
  // The campaign's own state. `desk` is not one of the screen's two, so no
  // segment is lit while nobody is sitting — which is true, and the body of
  // the screen says so in full.
  const actual: TableKind = state.table;
  const inPerson = state.rules.board === 'in-person';
  // While a fight overrides the mode, the campaign's switch changes nothing
  // at the table; the pill says what is in force and points at the fight.
  const fightHoldsMode =
    Boolean(state.encounter?.isActive) &&
    state.encounter?.ruleOverrides.mode !== undefined;

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'That did not take.');
    await refresh();
  };

  return (
    <>
      {dialog}
      <div className="flex flex-wrap items-center gap-2">
        {/* Nobody is sitting: neither state applies, and a lit segment
            beside "the table is not sitting" is the screen arguing with
            itself. The verbs below still work — that is how a session
            starts. */}
        {actual !== 'desk' && (
          <div
            role="group"
            aria-label="Which state the screen is set for"
            className="flex max-w-full overflow-x-auto rounded-[5px] border border-line"
          >
            {SCREEN_STATES.map((kind, i) => {
              const meta = TABLE_META[kind];
              const isActual = kind === actual;
              const isCurrent = kind === current;
              const isPinned = pinned === kind;
              const title = isActual
                ? isPinned
                  ? `Pinned here. Unpin to follow the campaign.`
                  : `The campaign is at ${meta.label.toLowerCase()}. ${meta.line}`
                : isPinned
                  ? `Pinned. ${TABLE_META[actual].line} Unpin to follow the campaign.`
                  : `Hold the screen ${meta.label.toLowerCase()} for now`;
              return (
                <Tooltip key={kind} content={title}>
                  <button
                    type="button"
                    aria-pressed={isCurrent}
                    onClick={() => onPin(isPinned || isActual ? null : kind)}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] transition-colors ${
                      i > 0 ? 'border-l border-line' : ''
                    } ${
                      isCurrent
                        ? kind === 'battle'
                          ? 'bg-surface-2 text-danger'
                          : 'bg-surface-2 text-gold-strong dark:text-gold'
                        : 'text-ink-subtle hover:text-ink'
                    } ${isPinned ? 'border-l-4 border-l-ink' : ''}`}
                  >
                    {isActual ? (
                      <StatusMark kind="live" size={7} />
                    ) : (
                      <Glyph name={meta.glyph} size={11} />
                    )}
                    <span>{meta.label}</span>
                    {kind === 'battle' && inPerson && (
                      <span className="normal-case tracking-normal text-ink-subtle">
                        · in person
                      </span>
                    )}
                    {isPinned && (
                      <span className="text-[0.5625rem] font-bold text-ink">
                        yours
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* The world's clock (10): read by everyone, moved by staff. */}
        <WorldClockControl
          campaignId={campaignId}
          clock={state.clock}
          isStaff={isStaff}
          refresh={refresh}
          onError={onError}
        />

        {isStaff && (
          <Tooltip
            content={
              fightHoldsMode
                ? `${state.encounter?.name ?? 'This fight'} sets its own. Change it on the initiative box.`
                : state.rules.mode === 'enforce'
                  ? 'Enforcing: the app refuses what the rules refuse. Tap to advise instead.'
                  : 'Advising: the app says what the rules say and refuses nothing. Tap to enforce.'
            }
          >
            <button
              type="button"
              disabled={busy || fightHoldsMode}
              onClick={() =>
                act(
                  setTableModeAction(
                    campaignId,
                    state.rules.mode === 'enforce' ? 'advise' : 'enforce'
                  )
                )
              }
              aria-pressed={state.rules.mode === 'enforce'}
              className={`inline-flex items-center gap-1 rounded-[5px] border px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] transition-colors disabled:opacity-60 ${
                state.rules.mode === 'enforce'
                  ? 'border-danger/50 text-danger hover:bg-danger/10'
                  : 'border-line text-ink-subtle hover:border-gold/50 hover:text-ink'
              }`}
            >
              <Glyph name="gavel" size={11} />
              {state.rules.mode === 'enforce' ? 'Enforcing' : 'Advising'}
            </button>
          </Tooltip>
        )}

        {/* Ambient sound (12): lit when the room is playing something. */}
        <AmbienceControl
          campaignId={campaignId}
          ambience={state.ambience}
          isStaff={isStaff}
          refresh={refresh}
          onError={onError}
        />

        {/* Undo (11): the last thing the DM can take back, with its label.
            The stack lives in the server's memory; five minutes, ten deep. */}
        {isStaff && state.undo && (
          <Tooltip
            content={`Undo: ${state.undo.label}. Ctrl/⌘ Z does the same.`}
          >
            <button
              type="button"
              disabled={busy}
              onClick={() => act(undoLastAction(campaignId))}
              className="inline-flex max-w-[16rem] items-center gap-1 rounded-[5px] border border-line px-2 py-1 text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle transition-colors hover:border-gold/50 hover:text-ink disabled:opacity-60"
            >
              <Glyph name="gavel" size={11} />
              <span className="truncate normal-case tracking-normal">
                Undo · {state.undo.label}
              </span>
            </button>
          </Tooltip>
        )}
        {isStaff && typing && (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-gold/50 bg-gold/10 px-2 py-1 font-mono text-xs text-ink">
            {typing.verb === 'D' ? 'Damage' : 'Heal'} {typing.digits || '…'}
            <span className="text-ink-subtle">· Enter</span>
          </span>
        )}
        {isStaff && onHelp && (
          <Tooltip
            content={
              <ul className="space-y-0.5 p-1 text-xs">
                {SHORTCUTS.map(s => (
                  <li key={s.keys}>
                    <span className="font-mono">{s.keys}</span> · {s.does}
                  </li>
                ))}
              </ul>
            }
          >
            <button
              type="button"
              onClick={onHelp}
              aria-label="Keyboard shortcuts"
              className="rounded-[5px] border border-line px-2 py-1 text-[0.6rem] text-ink-subtle hover:text-ink"
            >
              ?
            </button>
          </Tooltip>
        )}

        {isStaff && (
          <span className="ml-1 inline-flex gap-1.5 border-l border-line pl-2">
            {!state.sitting ? (
              <Button
                size="sm"
                color="primary"
                className="h-7 min-w-0 px-2.5 text-xs"
                isDisabled={busy}
                onPress={() => act(openSittingAction(campaignId))}
              >
                Start the session
              </Button>
            ) : (
              <>
                {state.encounter?.isActive ? (
                  <>
                    {/*
                      The fight is laid out but nobody has rolled. This is
                      the loudest button on the bar on purpose: it is what
                      the whole staging phase is waiting for.
                    */}
                    {state.encounter.phase === 'setup' && (
                      <Button
                        size="sm"
                        color="danger"
                        className="h-7 min-w-0 px-2.5 text-xs font-semibold uppercase tracking-[0.1em]"
                        isDisabled={busy}
                        startContent={<Glyph name="crossed-swords" size={13} />}
                        onPress={() =>
                          act(startFightAction(state.encounter!.id))
                        }
                      >
                        Roll for initiative
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="flat"
                      className="h-7 min-w-0 px-2.5 text-xs"
                      isDisabled={busy}
                      onPress={async () => {
                        const staging = state.encounter!.phase === 'setup';
                        const ok = await confirm({
                          title: staging
                            ? 'Put the fight away?'
                            : 'End the fight?',
                          body: staging
                            ? 'Nobody has rolled, so nothing is lost but the order you built. The board stays where it is.'
                            : 'The order is kept as a record. The board stays where it is.',
                          confirmLabel: staging ? 'Put it away' : 'End it',
                        });
                        if (!ok) return;
                        // The arithmetic the card wants is handed back by
                        // the initiative panel's own End, which is where
                        // the card is drawn. From here the fight just ends.
                        await act(endEncounterAction(state.encounter!.id));
                      }}
                    >
                      {state.encounter.phase === 'setup'
                        ? 'Put it away'
                        : 'End the fight'}
                    </Button>
                  </>
                ) : (
                  /*
                   * Lays a fight out; it does not start one. A DM who had
                   * planned a fight used to press this, get an empty order,
                   * and not see why the ghouls were not there — so it names
                   * the planned ones, and neither choice tells the table
                   * anything. *Roll for initiative* is the separate press
                   * that does.
                   */
                  <Dropdown
                    placement="bottom"
                    onOpenChange={open => {
                      if (open && plans === null) {
                        listPlansAction(campaignId)
                          .then(setPlans)
                          .catch(() => setPlans([]));
                      }
                    }}
                  >
                    <DropdownTrigger>
                      <Button
                        size="sm"
                        color="primary"
                        className="h-7 min-w-0 px-2.5 text-xs"
                        isDisabled={busy}
                        endContent={<Glyph name="chevron-down" size={12} />}
                      >
                        Lay out a fight
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Lay out a fight"
                      items={fightChoices}
                      disabledKeys={plans === null ? ['loading'] : []}
                      onAction={key => {
                        if (key === 'blank') {
                          void act(createEncounterAction(campaignId, ''));
                          return;
                        }
                        const plan = plans?.find(p => p.id === key);
                        if (plan) void act(runPlanAction(campaignId, plan.id));
                      }}
                    >
                      {choice => (
                        <DropdownItem
                          key={choice.key}
                          description={choice.description}
                          startContent={
                            choice.planned ? (
                              <Glyph name="crossed-swords" size={14} />
                            ) : undefined
                          }
                        >
                          {choice.label}
                        </DropdownItem>
                      )}
                    </DropdownMenu>
                  </Dropdown>
                )}
                <Button
                  size="sm"
                  variant="light"
                  className="h-7 min-w-0 px-2 text-xs text-ink-subtle"
                  isDisabled={busy}
                  onPress={async () => {
                    const ok = await confirm({
                      title: 'The table rises?',
                      body: 'The evening is filed and the register filled in.',
                      confirmLabel: 'Rise',
                    });
                    if (!ok) return;
                    await act(closeSittingAction(campaignId));
                  }}
                >
                  End the session
                </Button>
              </>
            )}
          </span>
        )}
      </div>
    </>
  );
}
