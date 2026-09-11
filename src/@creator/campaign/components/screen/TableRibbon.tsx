'use client';

import { Button, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { Glyph, useConfirm } from '@/@shared/components/ui';
import type { LiveState } from '@/server/session';
import { TABLE_META, type TableKind } from '../../lib/screen';
import { createEncounterAction, endEncounterAction } from '../../actions';
import { closeSittingAction, openSittingAction } from '../../chronicle-actions';

/**
 * Which table the campaign is at, and the two verbs that change it.
 *
 * The table is derived — a sitting and a running fight already say which —
 * so there is no "switch to battle" here. What there is: *Take your seats* /
 * *Rise* and *Call for initiative* / *End the fight*, the verbs the DM already
 * had, put where the room is so changing the room is one press from inside
 * it.
 *
 * The pin is the viewer's own: a player who wants the board up between fights
 * pins the sand table and the screen holds it until they unpin. It is a
 * preference, stored with their layouts, and it says nothing to anybody else.
 */
export function TableRibbon({
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
  const meta = TABLE_META[current];

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
        <Tooltip content={meta.line}>
          <span
            className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] ${
              current === 'battle'
                ? 'border-danger/50 text-danger'
                : 'border-gold/50 text-gold-strong dark:text-gold'
            }`}
          >
            <Glyph name={meta.glyph} size={12} />
            {meta.label}
            {pinned && (
              <button
                type="button"
                onClick={() => onPin(null)}
                title={`Pinned. The campaign is at ${TABLE_META[actual].label.toLowerCase()}. Unpin to follow it.`}
                className="ml-1 text-ink-subtle hover:text-ink"
                aria-label="Unpin"
              >
                <Glyph name="x" size={10} />
              </button>
            )}
          </span>
        </Tooltip>

        {/* The viewer's pin, offered only for the tables the campaign is not
            at: pinning to where you already are is a no-op wearing a button. */}
        {!pinned &&
          (['desk', 'table', 'battle'] as const)
            .filter(k => k !== actual)
            .map(k => (
              <button
                key={k}
                type="button"
                onClick={() => onPin(k)}
                className="text-[0.65rem] text-ink-subtle underline-offset-2 hover:text-ink hover:underline"
                title={`Hold the screen at ${TABLE_META[k].label.toLowerCase()} for now`}
              >
                {TABLE_META[k].label.toLowerCase()}
              </button>
            ))}

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
