'use client';

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Switch,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { formatChallenge } from '@/@shared/content';
import { ControlRow, Glyph } from '@/@shared/components/ui';
import type { CombatantChoice } from '@/server/content';
import type { CanonEntryRow } from '../lib/canon';
import {
  ATTITUDES,
  ATTITUDE_LABEL,
  clampStanding,
  signed,
  standingLabel,
  type StandingChange,
} from '../lib/standing';
import {
  addNpcToEncounterAction,
  encounterChoicesAction,
  listStandingAction,
  recordStandingAction,
  removeStandingChangeAction,
  setAttitudeAction,
  setStatBlockAction,
  showStandingChangeAction,
  statChoicesAction,
} from '../npc-actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
    {children}
  </p>
);

/**
 * An NPC that can act: its attitude toward the party, the stat block it
 * fights with, and the way into an encounter. Staff only — the card renders
 * nothing of this for a player, and the server never sent it.
 */
export function NpcDepth({
  campaignId,
  entry,
  act,
}: {
  campaignId: string;
  entry: CanonEntryRow;
  act: Act;
}) {
  const [choices, setChoices] = useState<CombatantChoice[] | null>(null);
  const [plans, setPlans] = useState<{ id: string; name: string }[] | null>(
    null
  );
  const [planId, setPlanId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState<string | null>(null);

  const loadChoices = async () => {
    if (choices) return;
    const res = await statChoicesAction(campaignId);
    setChoices(res.ok ? res.data : []);
  };

  useEffect(() => {
    if (!entry.stat) return;
    encounterChoicesAction(campaignId).then(res => {
      if (res.ok) setPlans(res.data);
    });
  }, [campaignId, entry.stat]);

  return (
    <div className="space-y-3 border-t border-line pt-3">
      {entry.kind === 'npc' && (
        <div className="space-y-1">
          <Label>Toward the party · only you see this</Label>
          <Select
            size="sm"
            aria-label="Attitude toward the party"
            placeholder="Not decided"
            className="max-w-[12rem]"
            selectedKeys={entry.attitude ? [entry.attitude] : []}
            onSelectionChange={keys => {
              const next = Array.from(keys)[0];
              void act(setAttitudeAction(entry.id, next ? String(next) : null));
            }}
          >
            {ATTITUDES.map(a => (
              <SelectItem key={a}>{ATTITUDE_LABEL[a]}</SelectItem>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label>Stat block</Label>
        {entry.stat && (
          <div className="flex flex-wrap items-center gap-2">
            <Glyph name="dragon" size={14} className="text-ink-subtle" />
            <span className="text-ink">
              {entry.stat.name ?? 'A creature that no longer exists'}
            </span>
            {!entry.stat.available && (
              <span className="rounded-sm border border-danger/40 px-1.5 py-0.5 font-display-alt text-[0.55rem] uppercase tracking-[0.14em] text-danger">
                Unavailable
              </span>
            )}
            {entry.stat.ref.source === 'homebrew' && entry.stat.available && (
              <span className="rounded-sm border border-arcane/40 px-1.5 py-0.5 font-display-alt text-[0.55rem] uppercase tracking-[0.14em] text-arcane">
                Homebrew
              </span>
            )}
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() => act(setStatBlockAction(entry.id, null))}
            >
              Unlink
            </Button>
          </div>
        )}
        {entry.stat && !entry.stat.available && (
          <p className="text-xs text-ink-muted">
            This homebrew is not in play at this campaign — the table removed
            it, or its author deleted it. Link another, or add it back to the
            allowed content.
          </p>
        )}
        <Autocomplete
          size="sm"
          aria-label="Link a stat block"
          placeholder={
            entry.stat
              ? 'Link a different creature'
              : 'Link a creature — Goblin'
          }
          className="max-w-xs"
          defaultItems={choices ?? []}
          isLoading={choices === null}
          onOpenChange={open => {
            if (open) void loadChoices();
          }}
          onFocus={() => void loadChoices()}
          selectedKey={null}
          onSelectionChange={key => {
            const picked = choices?.find(c => c.key === key);
            if (picked) void act(setStatBlockAction(entry.id, picked.ref));
          }}
        >
          {choice => (
            <AutocompleteItem key={choice.key} textValue={choice.name}>
              <div className="flex items-baseline justify-between gap-3">
                <span>{choice.name}</span>
                <span className="text-xs text-ink-subtle">
                  CR {formatChallenge(choice.challengeRating)} ·{' '}
                  {choice.hitPoints} HP
                </span>
              </div>
            </AutocompleteItem>
          )}
        </Autocomplete>
      </div>

      {entry.stat?.available && (
        <div className="space-y-1">
          <Label>Place in an encounter</Label>
          {plans && plans.length === 0 ? (
            <p className="text-xs text-ink-muted">
              No encounters yet — plan one in Encounters, then place{' '}
              {entry.title} in it here.
            </p>
          ) : (
            <ControlRow size="sm">
              <Select
                aria-label="Encounter"
                placeholder="Which encounter"
                className="max-w-[14rem]"
                selectedKeys={planId ? [planId] : []}
                onSelectionChange={keys => {
                  const k = Array.from(keys)[0];
                  setPlanId(k ? String(k) : null);
                }}
              >
                {(plans ?? []).map(p => (
                  <SelectItem key={p.id}>{p.name}</SelectItem>
                ))}
              </Select>
              <NumberInput
                aria-label="How many"
                className="w-24"
                minValue={1}
                maxValue={20}
                value={count}
                onValueChange={v => setCount(Number(v) || 1)}
              />
              <Button
                variant="flat"
                isDisabled={!planId}
                onPress={async () => {
                  if (!planId) return;
                  setNote(null);
                  await act(addNpcToEncounterAction(entry.id, planId, count));
                  setNote(
                    `Added to ${plans?.find(p => p.id === planId)?.name ?? 'the encounter'}.`
                  );
                }}
              >
                Add to encounter
              </Button>
            </ControlRow>
          )}
          {note && <p className="text-xs text-success">{note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * A faction's standing with the party.
 *
 * Everyone sees the standing they have been shown. Staff see the whole sum
 * and every change with its reason — "why do the Duskwater hate us" is the
 * point — and show the party a change one at a time.
 */
export function FactionStanding({
  entry,
  isStaff,
  act,
}: {
  entry: CanonEntryRow;
  isStaff: boolean;
  act: Act;
}) {
  const [changes, setChanges] = useState<StandingChange[] | null>(null);
  const [delta, setDelta] = useState(-1);
  const [reason, setReason] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isStaff) return;
    const res = await listStandingAction(entry.id);
    if (res.ok) setChanges(res.data);
  }, [entry.id, isStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    const res = await p;
    if (!res.ok) setError(res.error ?? 'That did not work.');
    await act(Promise.resolve({ ok: true }));
    await load();
    return res.ok;
  };

  const standing = entry.standing;
  if (!standing) return null;
  const shownWords = `${standingLabel(standing.shown)} (${signed(clampStanding(standing.shown))})`;

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <Label>{isStaff ? 'Standing with the party' : 'Where you stand'}</Label>
      <p className="text-ink">
        {isStaff && standing.total !== null ? (
          <>
            {standingLabel(standing.total)} (
            {signed(clampStanding(standing.total))})
            {standing.total !== standing.shown && (
              <span className="text-ink-muted">
                {' '}
                · the party has been shown {shownWords}
              </span>
            )}
          </>
        ) : (
          shownWords
        )}
      </p>

      {isStaff && changes && changes.length > 0 && (
        <ol className="space-y-1">
          {changes.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <span className="w-8 font-mono text-xs tabular-nums text-ink-subtle">
                {signed(c.delta)}
              </span>
              <span className="flex-1 text-ink-muted">
                {c.reason || 'No reason given'}
              </span>
              {c.shown ? (
                <span className="text-xs text-ink-subtle">shown</span>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="light"
                    startContent={<Glyph name="candle" size={13} />}
                    onPress={() => run(showStandingChangeAction(c.id))}
                  >
                    Show the party
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    className="text-ink-muted data-[hover=true]:text-danger"
                    onPress={() => run(removeStandingChangeAction(c.id))}
                  >
                    Strike
                  </Button>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      {isStaff && (
        <div className="space-y-2">
          <ControlRow size="sm">
            <Select
              aria-label="How much"
              className="w-24"
              selectedKeys={[String(delta)]}
              onSelectionChange={keys => {
                const k = Array.from(keys)[0];
                if (k) setDelta(Number(k));
              }}
            >
              {[-3, -2, -1, 1, 2, 3].map(n => (
                <SelectItem key={String(n)}>{signed(n)}</SelectItem>
              ))}
            </Select>
            <Input
              aria-label="Why"
              placeholder="Why — you burned their ledger"
              className="min-w-[12rem] flex-1"
              value={reason}
              onValueChange={setReason}
            />
            <Button
              variant="flat"
              onPress={async () => {
                if (
                  await run(
                    recordStandingAction(entry.id, { delta, reason, show })
                  )
                ) {
                  setReason('');
                }
              }}
            >
              Record
            </Button>
          </ControlRow>
          <Switch size="sm" isSelected={show} onValueChange={setShow}>
            <span className="text-sm">Show the party as well</span>
          </Switch>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
