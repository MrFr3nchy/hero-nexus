'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useState } from 'react';

import { Glyph, StatusMark, useConfirm } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { describeMinutes } from '../../lib/calendar';
import { restLabel } from '../../lib/rests';
import {
  breakRestAction,
  callRestAction,
  confirmRestAction,
  confirmRestAnswerAction,
} from '../../time-actions';

/**
 * Rests as a flow (10).
 *
 * Two instant buttons became a sheet the table fills in together: staff
 * call the rest, each player spends hit dice from their own card and says
 * they are done, staff see who has answered and confirm the lot — or break
 * it, when something comes out of the dark. The state is a row on
 * `LiveState.rest`, so a refresh loses nothing and the DM's screen and the
 * player's panel are reading the same answers.
 *
 * `CallRest` is the staff control that starts one; `RestSheet` is the sheet
 * itself, drawn for staff with the checklist and the two verbs, and for a
 * player with their own line and the confirm.
 */

export function CallRest({
  campaignId,
  rules,
  refresh,
  onError,
}: {
  campaignId: string;
  rules: LiveState['rules'];
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const call = async (kind: 'short' | 'long') => {
    setBusy(true);
    const res = await callRestAction(campaignId, kind);
    setBusy(false);
    setOpen(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await refresh();
  };
  const takes = (kind: 'short' | 'long') =>
    kind === 'short'
      ? rules.rests === 'gritty'
        ? '8 hours'
        : rules.rests === 'heroic'
          ? '5 minutes'
          : 'an hour'
      : rules.rests === 'gritty'
        ? 'a week'
        : rules.rests === 'heroic'
          ? 'an hour'
          : '8 hours';
  return (
    <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button size="sm" variant="flat" isDisabled={busy}>
          Call a rest
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 border border-line bg-surface p-2">
        <ul className="w-full space-y-1">
          {(['short', 'long'] as const).map(kind => (
            <li key={kind}>
              <button
                type="button"
                disabled={busy}
                onClick={() => call(kind)}
                className="flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-60"
              >
                <span className="text-sm text-ink">
                  {kind === 'short' ? 'A short rest' : 'A long rest'}
                </span>
                <span className="text-xs text-ink-subtle">
                  {takes(kind)} ·{' '}
                  {kind === 'short'
                    ? 'hit dice, then temporary hit points go'
                    : 'everything back, slots and all'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function RestSheet({
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
  const rest = state.rest;
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();
  if (!rest) return null;

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) onError(res.error ?? 'That did not take.');
    await refresh();
  };

  const own = state.party.find(p => p.characterId === state.viewerCharacterId);
  const answered = state.party.filter(
    p => rest.answers[p.characterId]?.confirmed
  ).length;
  const label = restLabel(rest.kind);
  const takes = describeMinutes(rest.minutes, state.clock.calendar);

  return (
    <div className="rounded-md border border-gold/40 bg-gold/5 px-3 py-2">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-gold-strong dark:text-gold">
          <Glyph name="tankard" size={13} />
          <span className="capitalize">{label}</span>
          <span className="text-ink-subtle">
            · {takes} ·{' '}
            {rest.kind === 'short'
              ? 'spend hit dice, then say you are done'
              : 'say you are done'}
          </span>
        </p>
        {isStaff && (
          <span className="text-xs tabular-nums text-ink-subtle">
            {answered} of {state.party.length} ready
          </span>
        )}
      </div>

      {isStaff ? (
        <>
          <ul className="mt-2 divide-y divide-line/60">
            {state.party.map(p => {
              const a = rest.answers[p.characterId];
              return (
                <li
                  key={p.characterId}
                  className="flex items-center gap-2 py-1 text-sm"
                >
                  <StatusMark
                    kind={a?.confirmed ? 'live' : 'waiting'}
                    size={7}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {p.name}
                  </span>
                  {rest.kind === 'short' && (
                    <span className="text-xs tabular-nums text-ink-subtle">
                      {a?.hitDice ?? 0} hit di{a?.hitDice === 1 ? 'e' : 'ce'}
                    </span>
                  )}
                  <span
                    className={`text-[0.6rem] uppercase tracking-[0.1em] ${
                      a?.confirmed ? 'text-success' : 'text-ink-subtle'
                    }`}
                  >
                    {a?.confirmed ? 'ready' : 'waiting'}
                  </span>
                  {!a?.confirmed && (
                    <Button
                      size="sm"
                      variant="light"
                      className="h-6 min-w-0 px-1.5 text-xs text-ink-subtle"
                      isDisabled={busy}
                      onPress={() =>
                        act(
                          confirmRestAnswerAction(
                            campaignId,
                            p.characterId,
                            true
                          )
                        )
                      }
                    >
                      mark ready
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              color="primary"
              className="h-7 min-w-0 px-2.5 text-xs"
              isDisabled={busy}
              onPress={async () => {
                const ok =
                  answered >= state.party.length ||
                  (await confirm({
                    title: `Finish the ${label}?`,
                    body: `${state.party.length - answered} of the party have not said they are done. The rest happens for everybody.`,
                    confirmLabel: 'Finish it',
                  }));
                if (!ok) return;
                await act(confirmRestAction(campaignId));
              }}
            >
              {rest.kind === 'long' ? 'They wake' : 'Finish the rest'}
            </Button>
            <Button
              size="sm"
              variant="light"
              className="h-7 min-w-0 px-2 text-xs text-danger"
              isDisabled={busy}
              onPress={async () => {
                const ok = await confirm({
                  title: 'Break the rest?',
                  body: 'Nothing is regained. Hit dice already spent stay spent.',
                  confirmLabel: 'Break it',
                });
                if (!ok) return;
                await act(breakRestAction(campaignId));
              }}
            >
              Something comes
            </Button>
          </div>
        </>
      ) : own ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {rest.kind === 'short' && (
            <span className="text-ink-subtle">
              {rest.answers[own.characterId]?.hitDice ?? 0} spent so far — spend
              from the card below.
            </span>
          )}
          <Button
            size="sm"
            color={
              rest.answers[own.characterId]?.confirmed ? 'default' : 'primary'
            }
            variant={
              rest.answers[own.characterId]?.confirmed ? 'flat' : 'solid'
            }
            className="h-7 min-w-0 px-2.5 text-xs"
            isDisabled={busy}
            onPress={() =>
              act(
                confirmRestAnswerAction(
                  campaignId,
                  own.characterId,
                  !rest.answers[own.characterId]?.confirmed
                )
              )
            }
          >
            {rest.answers[own.characterId]?.confirmed
              ? 'Ready — undo'
              : "I'm done"}
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-subtle">Waiting on the party.</p>
      )}
    </div>
  );
}
