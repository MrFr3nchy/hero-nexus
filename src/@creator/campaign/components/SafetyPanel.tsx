'use client';

import { Button, Input, Link, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  CandleScene,
  ControlRow,
  EmptyState,
  Marginalia,
  SectionCard,
} from '@/@shared/components/ui';
import {
  SAFETY_KIND_HINT,
  SAFETY_KIND_LABEL,
  SAFETY_TEXT_MAX,
  type SafetyKind,
  type SafetyRow,
} from '../lib/safety';
import {
  addSafetyAction,
  deleteSafetyAction,
  listSafetyAction,
  planSessionZeroAction,
  sessionZeroAction,
} from '../safety-actions';

/**
 * Lines & veils, and session zero — in Rules, because they are what this
 * table plays by as much as anything the builder enforces.
 *
 * Everyone reads the list. Staff add and take down; players add, and what a
 * player adds says only "a player" because nothing else is stored.
 */
export function SafetyPanel({
  campaignId,
  isStaff,
}: {
  campaignId: string;
  isStaff: boolean;
}) {
  const [rows, setRows] = useState<SafetyRow[] | null>(null);
  const [kind, setKind] = useState<SafetyKind>('line');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zero, setZero] = useState<{ id: string; status: string } | null>(null);
  const [planning, setPlanning] = useState(false);

  const load = useCallback(async () => {
    const [list, z] = await Promise.all([
      listSafetyAction(campaignId),
      sessionZeroAction(campaignId),
    ]);
    if (list.ok) setRows(list.data);
    else setError(list.error);
    if (z.ok) setZero(z.data);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setError(null);
    const res = await addSafetyAction(campaignId, { kind, text });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setText('');
    await load();
  };

  const remove = async (id: string) => {
    const res = await deleteSafetyAction(campaignId, id);
    if (!res.ok) setError(res.error);
    await load();
  };

  const planZero = async () => {
    setPlanning(true);
    const res = await planSessionZeroAction(campaignId);
    setPlanning(false);
    if (!res.ok) setError(res.error);
    await load();
  };

  const lines = (rows ?? []).filter(r => r.kind === 'line');
  const veils = (rows ?? []).filter(r => r.kind === 'veil');

  const list = (title: string, items: SafetyRow[]) =>
    items.length > 0 && (
      <div>
        <h3 className="font-display-alt text-[0.65rem] uppercase tracking-[0.14em] text-ink-subtle">
          {title}
        </h3>
        <ul className="mt-1 divide-y divide-line">
          {items.map(r => (
            <li key={r.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1 text-sm text-ink">{r.text}</span>
              <span className="text-xs text-ink-subtle">
                {r.source === 'staff' ? 'the DM' : 'a player'}
              </span>
              {isStaff && (
                <Button
                  size="sm"
                  variant="light"
                  className="text-ink-muted data-[hover=true]:text-danger"
                  onPress={() => remove(r.id)}
                >
                  Take down
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="space-y-5">
      <SectionCard
        title="Lines & veils"
        description="A line is not in this game at all. A veil can happen, but off-screen. Anyone at the table can add one."
      >
        <div className="space-y-4">
          {rows !== null && rows.length === 0 ? (
            <EmptyState
              scene={<CandleScene />}
              title="No lines drawn yet"
              description="Name what stays out of this story, or what happens behind a closed door. Better said before the first session than in the middle of one."
            />
          ) : (
            <>
              {list('Lines', lines)}
              {list('Veils', veils)}
            </>
          )}

          <div className="border-t border-line pt-4">
            <ControlRow size="md">
              <Select
                aria-label="Line or veil"
                className="w-32"
                selectedKeys={[kind]}
                onSelectionChange={keys => {
                  const k = Array.from(keys)[0];
                  if (k) setKind(k as SafetyKind);
                }}
              >
                <SelectItem key="line">{SAFETY_KIND_LABEL.line}</SelectItem>
                <SelectItem key="veil">{SAFETY_KIND_LABEL.veil}</SelectItem>
              </Select>
              <Input
                aria-label={`Add a ${kind}`}
                placeholder={kind === 'line' ? 'Harm to children' : 'Torture'}
                className="min-w-[14rem] flex-1"
                maxLength={SAFETY_TEXT_MAX}
                value={text}
                onValueChange={setText}
                onKeyDown={e => {
                  if (e.key === 'Enter' && text.trim()) void add();
                }}
              />
              <Button
                color="primary"
                isDisabled={!text.trim()}
                isLoading={busy}
                onPress={add}
              >
                Add
              </Button>
            </ControlRow>
            <p className="mt-1 text-xs text-ink-subtle">
              {SAFETY_KIND_HINT[kind]}{' '}
              {isStaff
                ? 'Yours are marked as the DM’s.'
                : 'We don’t record who adds one — the list says only “a player”. You cannot take one back afterwards; ask the DM.'}
            </p>
            {error && (
              <p role="alert" className="mt-1 text-sm text-danger">
                {error}
              </p>
            )}
          </div>
          {!isStaff && (
            <Marginalia dash>
              and at the session screen, the X-card is always within reach.
            </Marginalia>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Session zero"
        description="The session before the first one: what everybody wants from this game, asked out loud."
      >
        {zero ? (
          <div className="space-y-2 text-sm text-ink-muted">
            <p>
              Session zero is on the books
              {zero.status === 'played' ? ' and was played' : ''}. Its
              questionnaire is on it in Sessions — answers there carry your
              name, so lines and veils stay here.
            </p>
            <Button as={Link} href="#sessions" size="sm" variant="flat">
              Go to Sessions
            </Button>
          </div>
        ) : isStaff ? (
          <div className="space-y-2 text-sm text-ink-muted">
            <p>
              Plans a session numbered 0 with a questionnaire on tone,
              expectations and schedule. Set its date in Sessions.
            </p>
            <Button
              size="sm"
              variant="flat"
              isLoading={planning}
              onPress={planZero}
            >
              Plan session zero
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            The DM has not planned one. Lines and veils above work without it.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
