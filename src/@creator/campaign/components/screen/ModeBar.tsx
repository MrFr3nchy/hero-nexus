'use client';

import { Button, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { Glyph, StatusMark, useConfirm } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { TABLE_KINDS, TABLE_META, type TableKind } from '../../lib/screen';
import { createEncounterAction, endEncounterAction } from '../../actions';
import { closeSittingAction, openSittingAction } from '../../chronicle-actions';
import { setTableModeAction } from '../../rules-actions';
import { WorldClockControl } from './WorldClockControl';

/**
 * The mode bar: the three tables in a row, the one the campaign is at lit,
 * and the verbs that move it.
 *
 * The table is derived — a sitting and a running fight already say which —
 * so there is no "switch to battle" here. What there is: *Take your seats*
 * / *Rise* and *Call for initiative* / *End the fight*, the verbs the DM
 * already had, put where the room is so changing the room is one press from
 * inside it. The same four server actions the ribbon this replaces called.
 *
 * The three segments say the flow — desk, then table, then sand table — and
 * the lit one says where the campaign is, in the status language: a filled
 * dot for the table the campaign is actually at. Pressing another segment
 * pins the screen there: a player who wants the board up between fights, a
 * DM checking a note mid-sitting. A pin is the viewer's own, stored with
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
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  /** What the screen is showing, pin included. */
  current: TableKind;
  pinned: TableKind | null;
  onPin: (pin: TableKind | null) => void | Promise<void>;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  const actual = state.table;
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
        <div
          role="group"
          aria-label="Which table the screen is set for"
          className="flex max-w-full overflow-x-auto rounded-[5px] border border-line"
        >
          {TABLE_KINDS.map((kind, i) => {
            const meta = TABLE_META[kind];
            const isActual = kind === actual;
            const isCurrent = kind === current;
            const isPinned = pinned === kind;
            const title = isActual
              ? isPinned
                ? `Pinned here. Unpin to follow the campaign.`
                : `The campaign is at ${meta.label.toLowerCase()}. ${meta.line}`
              : isPinned
                ? `Pinned. The campaign is at ${TABLE_META[actual].label.toLowerCase()}. Unpin to follow it.`
                : `Hold the screen at ${meta.label.toLowerCase()} for now`;
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
                Take your seats
              </Button>
            ) : (
              <>
                {state.encounter?.isActive ? (
                  <Button
                    size="sm"
                    variant="flat"
                    className="h-7 min-w-0 px-2.5 text-xs"
                    isDisabled={busy}
                    onPress={async () => {
                      const ok = await confirm({
                        title: 'End the fight?',
                        body: 'The order is kept as a record. The board stays where it is.',
                        confirmLabel: 'End it',
                      });
                      if (!ok) return;
                      await act(endEncounterAction(state.encounter!.id));
                    }}
                  >
                    End the fight
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    color="primary"
                    className="h-7 min-w-0 px-2.5 text-xs"
                    isDisabled={busy}
                    onPress={() => act(createEncounterAction(campaignId, ''))}
                  >
                    Call for initiative
                  </Button>
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
                  Rise
                </Button>
              </>
            )}
          </span>
        )}
      </div>
    </>
  );
}
