'use client';

import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_RULES,
  MAX_BLURB,
  MAX_NAME,
  TAVERN_KINDS,
  TAVERN_KIND_LABEL,
  type HouseGameRow,
  type TavernKind,
  type TavernRules,
} from '@/@creator/campaign/lib/tavern';
import { cpWords } from '@/@creator/character/lib/coins';
import {
  DiceSpinner,
  EmptyState,
  Glyph,
  Ledger,
  Marginalia,
  StatusWord,
  TavernScene,
  statusEdge,
  useConfirm,
} from '@/@shared/components/ui';
import type { TavernGameRecord } from '@/server/tavern/view';
import { RulesFields } from './screen/tavern/RulesFields';
import {
  createHouseGameAction,
  deleteHouseGameAction,
  listHouseGamesAction,
  listTavernGamesAction,
  updateHouseGameAction,
} from '../tavern-actions';

/**
 * Tavern games on the campaign page: the house games played here, and the
 * record of every tavern game the table has sat down to.
 *
 * A reading surface (design language rule 9): counts are a ledger line, the
 * games are the object, and the DM writes house games here rather than on
 * the session screen, where they are only picked.
 */
export function TavernSection({
  campaignId,
  isStaff,
}: {
  campaignId: string;
  isStaff: boolean;
}) {
  const [houses, setHouses] = useState<HouseGameRow[] | null>(null);
  const [records, setRecords] = useState<TavernGameRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const [h, r] = await Promise.all([
      listHouseGamesAction(campaignId),
      listTavernGamesAction(campaignId),
    ]);
    if (h.ok) setHouses(h.data);
    else setError(h.error);
    if (r.ok) setRecords(r.data);
    else setError(r.error);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every hero's coin across every tavern game, best first. */
  const standings = useMemo(() => {
    const by = new Map<string, number>();
    for (const g of records ?? []) {
      for (const s of g.seats) {
        if (!s.npc) by.set(s.name, (by.get(s.name) ?? 0) + s.netCp);
      }
    }
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  }, [records]);

  if (!houses || !records) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <div className="flex justify-center py-8">
        <DiceSpinner label="Counting the pots…" />
      </div>
    );
  }

  const rounds = records.reduce((n, g) => n + g.rounds, 0);

  const remove = async (h: HouseGameRow) => {
    const ok = await confirm({
      title: `Take down ${h.name}?`,
      body: 'Tavern games already played by its rules keep them. Nothing new can be opened from it.',
      confirmLabel: 'Take it down',
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteHouseGameAction(h.id);
    if (!res.ok) setError(res.error);
    setEditing(null);
    await load();
  };

  return (
    <div className="flex flex-wrap gap-8 pt-4">
      {dialog}
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
        {error && <p className="text-sm text-danger">{error}</p>}

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h3 className="font-display text-lg font-semibold">House games</h3>
            <span className="text-xs text-ink-muted">
              the games played here, by the house’s rules
            </span>
            {isStaff && editing !== 'new' && (
              <Button
                size="sm"
                variant="flat"
                className="ml-auto"
                onPress={() => setEditing('new')}
              >
                New house game
              </Button>
            )}
          </div>
          {editing === 'new' && (
            <HouseGameForm
              onCancel={() => setEditing(null)}
              onSave={async input => {
                const res = await createHouseGameAction(campaignId, input);
                if (!res.ok) return res.error;
                setEditing(null);
                await load();
                return null;
              }}
            />
          )}
          {houses.length === 0 && editing !== 'new' && (
            <p className="text-sm text-ink-muted">
              {isStaff
                ? 'Liar’s dice and Crowns are always on offer. A house game is your own name and rules for one of them — Brannoc’s Bones, six dice a cup, no wild ones.'
                : 'Liar’s dice and Crowns, by the book. The DM has not written house rules for either.'}
            </p>
          )}
          {houses.map(h =>
            editing === h.id ? (
              <HouseGameForm
                key={h.id}
                initial={h}
                onCancel={() => setEditing(null)}
                onDelete={() => remove(h)}
                onSave={async input => {
                  const res = await updateHouseGameAction(h.id, input);
                  if (!res.ok) return res.error;
                  setEditing(null);
                  await load();
                  return null;
                }}
              />
            ) : (
              <article
                key={h.id}
                className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <div className="flex items-baseline gap-2">
                  <Glyph
                    name={h.kind === 'crowns' ? 'cards' : 'die'}
                    size={16}
                    className="self-center text-gold-strong"
                  />
                  <span className="font-display text-base font-semibold">
                    {h.name}
                  </span>
                  <span className="rounded-full border border-line px-2 text-[0.7rem] text-ink-muted">
                    {TAVERN_KIND_LABEL[h.kind]}
                  </span>
                  {isStaff && (
                    <Button
                      size="sm"
                      variant="light"
                      className="ml-auto h-7 min-w-0 px-2 text-xs text-ink-muted"
                      onPress={() => setEditing(h.id)}
                    >
                      Edit
                    </Button>
                  )}
                </div>
                {h.blurb && <p className="text-sm">{h.blurb}</p>}
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-muted">
                  {h.lines.map(l => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </article>
            )
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-display text-lg font-semibold">Played here</h3>
          {records.length === 0 ? (
            <EmptyState
              scene={<TavernScene />}
              title="No tavern games yet"
              description={
                isStaff
                  ? 'open one from the session screen when the party sits down somewhere with a cup and a grudge'
                  : 'the DM opens one when the party sits down somewhere with a cup and a grudge'
              }
            />
          ) : (
            <>
              <Ledger
                items={[
                  {
                    value: records.length,
                    label: 'tavern games',
                    one: 'tavern game',
                  },
                  { value: rounds, label: 'rounds', one: 'round' },
                ]}
              />
              {records.map(g => (
                <article
                  key={g.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-base font-semibold">
                      {g.name}
                    </span>
                    <span className="rounded-full border border-line px-2 text-[0.7rem] text-ink-muted">
                      {TAVERN_KIND_LABEL[g.kind]}
                    </span>
                    <span className="ml-auto text-xs text-ink-muted">
                      {g.status === 'ended' ? '' : 'running · '}
                      {g.rounds} {g.rounds === 1 ? 'round' : 'rounds'} ·{' '}
                      {new Date(g.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <ul className="flex flex-col text-sm">
                    {g.seats.map((s, i) => (
                      <li
                        key={`${s.name}-${i}`}
                        className="flex border-b border-line py-1 last:border-b-0"
                      >
                        <span className="flex-1">{s.name}</span>
                        {s.npc ? (
                          <span className="text-xs text-ink-muted">NPC</span>
                        ) : (
                          <span
                            className={`tabular-nums ${
                              s.netCp > 0
                                ? 'text-success'
                                : s.netCp < 0
                                  ? 'text-danger'
                                  : 'text-ink-muted'
                            }`}
                          >
                            {s.netCp > 0 ? '+' : s.netCp < 0 ? '−' : ''}
                            {cpWords(Math.abs(s.netCp))}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {g.secrets.map((line, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded px-2 py-1 text-xs ${statusEdge('hidden')}`}
                    >
                      <span className="flex-1">{line}</span>
                      <StatusWord kind="hidden" />
                    </div>
                  ))}
                </article>
              ))}
            </>
          )}
        </section>
      </div>

      {standings.length > 0 && (
        <aside className="flex min-w-[14rem] flex-[1_1_240px] flex-col gap-3 border-l border-line pl-6 text-sm">
          <h3 className="font-display-alt text-sm">Up and down, all told</h3>
          <ul className="flex flex-col gap-1">
            {standings.map(([name, net]) => (
              <li key={name} className="flex">
                <span className="flex-1">{name}</span>
                <span
                  className={`font-semibold tabular-nums ${
                    net > 0
                      ? 'text-success'
                      : net < 0
                        ? 'text-danger'
                        : 'text-ink-muted'
                  }`}
                >
                  {net > 0 ? '+' : net < 0 ? '−' : ''}
                  {cpWords(Math.abs(net))}
                </span>
              </li>
            ))}
          </ul>
          <Marginalia>
            the house always wins. except when it doesn’t.
          </Marginalia>
          <p className="text-xs text-ink-muted">
            {isStaff
              ? 'Players see every game and every net. Reads, cheats and catches are yours alone.'
              : 'Won less staked, over every tavern game here.'}
          </p>
        </aside>
      )}
    </div>
  );
}

function HouseGameForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: HouseGameRow;
  onSave: (input: {
    kind: TavernKind;
    name: string;
    blurb: string;
    rules: TavernRules;
  }) => Promise<string | null>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<TavernKind>(initial?.kind ?? 'liars-dice');
  const [name, setName] = useState(initial?.name ?? '');
  const [blurb, setBlurb] = useState(initial?.blurb ?? '');
  const [rules, setRules] = useState<TavernRules>(
    initial?.rules ?? DEFAULT_RULES['liars-dice']
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4 rounded-xl border border-gold bg-surface px-4 py-4"
      onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        const err = await onSave({ kind, name, blurb, rules });
        setBusy(false);
        setError(err);
      }}
    >
      <div className="flex flex-wrap gap-3">
        <Input
          label="Name"
          labelPlacement="outside"
          placeholder="Brannoc’s Bones"
          className="max-w-xs"
          isRequired
          maxLength={MAX_NAME}
          value={name}
          onValueChange={setName}
        />
        <Select
          label="Game"
          labelPlacement="outside"
          className="max-w-[12rem]"
          selectedKeys={[kind]}
          onSelectionChange={k => {
            const next = String(Array.from(k)[0] ?? kind) as TavernKind;
            if (next !== kind) {
              setKind(next);
              setRules(DEFAULT_RULES[next]);
            }
          }}
        >
          {TAVERN_KINDS.map(k => (
            <SelectItem key={k}>{TAVERN_KIND_LABEL[k]}</SelectItem>
          ))}
        </Select>
      </div>
      <Textarea
        label="How the house tells it"
        labelPlacement="outside"
        placeholder="Played in the Eel’s back room. Brannoc swears the dice are honest."
        maxLength={MAX_BLURB}
        minRows={2}
        value={blurb}
        onValueChange={setBlurb}
      />
      <RulesFields kind={kind} rules={rules} onChange={setRules} size="md" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button color="primary" type="submit" isDisabled={busy || !name.trim()}>
          {initial ? 'Save the house game' : 'Add the house game'}
        </Button>
        <Button variant="light" onPress={onCancel}>
          Cancel
        </Button>
        {onDelete && (
          <Button
            variant="light"
            className="ml-auto text-ink-subtle data-[hover=true]:text-danger"
            onPress={onDelete}
          >
            Take it down
          </Button>
        )}
      </div>
    </form>
  );
}
