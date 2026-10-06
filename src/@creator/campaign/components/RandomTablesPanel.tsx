'use client';

import { Button, Input, Textarea } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  QuestScene,
  Ribbon,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import {
  RANDOM_TABLE_DICE,
  checkRanges,
  faceLabel,
  formatBulkEntries,
  parseBulkEntries,
  rangeLabel,
  spreadFaces,
  type RandomTableEntry,
  type RandomTableRow,
} from '../lib/random-tables';
import {
  createRandomTableAction,
  deleteRandomTableAction,
  listRandomTablesAction,
  rollRandomTableAction,
  updateRandomTableAction,
} from '../random-table-actions';
import type { RandomTableResult } from '@/server/random-tables';

/**
 * Random tables: tavern names, loot, weather, wandering monsters.
 *
 * Staff only. Each one rolls on a die the DM picks, d4 to d100, and every
 * entry shows the faces it owns — `01–03 The bridge is out` — so the table
 * reads like the printed one it came from. A roll goes to Dice behind the
 * screen, or, with "Roll and show the party", in front of it, and the row it
 * landed on lights up here.
 */
export function RandomTablesPanel({
  campaignId,
  compact = false,
}: {
  campaignId: string;
  /** On the session screen: rolling, not authoring. */
  compact?: boolean;
}) {
  const [tables, setTables] = useState<RandomTableRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  /** The last roll on each random table, so each keeps its own lit row. */
  const [last, setLast] = useState<Record<string, RandomTableResult>>({});
  const [rolling, setRolling] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    const res = await listRandomTablesAction(campaignId);
    if (res.ok) setTables(res.data);
    else setError(res.error);
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roll = async (id: string, show: boolean) => {
    setRolling(id);
    setError(null);
    const res = await rollRandomTableAction(id, show);
    setRolling(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setLast(prev => ({ ...prev, [id]: res.data }));
  };

  const remove = async (t: RandomTableRow) => {
    const ok = await confirm({
      title: `Take down ${t.title}?`,
      body: 'Its rolls stay in Dice. The random table itself is gone.',
      confirmLabel: 'Take it down',
      destructive: true,
    });
    if (!ok) return;
    const res = await deleteRandomTableAction(t.id);
    if (!res.ok) setError(res.error);
    setEditing(null);
    await load();
  };

  if (tables === null) {
    return error ? (
      <p className="text-sm text-danger">{error}</p>
    ) : (
      <div className="flex justify-center py-6">
        <DiceSpinner label="Shuffling the random tables…" />
      </div>
    );
  }

  const body = (
    <div className="space-y-3">
      {dialog}
      {tables.length === 0 && editing !== 'new' && (
        <EmptyState
          scene={<QuestScene />}
          title="No random tables yet"
          description="A list of what could happen — tavern names, weather, who comes down the road — on the die you choose, rolled when you need one."
          action={
            compact ? undefined : (
              <Button color="primary" onPress={() => setEditing('new')}>
                Write a random table
              </Button>
            )
          }
        />
      )}

      {tables.map(t =>
        editing === t.id ? (
          <Editor
            key={t.id}
            initial={t}
            onCancel={() => setEditing(null)}
            onDelete={() => remove(t)}
            onSave={async draft => {
              const res = await updateRandomTableAction(t.id, draft);
              if (!res.ok) return res.error;
              setEditing(null);
              setLast(prev => {
                const next = { ...prev };
                delete next[t.id];
                return next;
              });
              await load();
              return null;
            }}
          />
        ) : (
          <TableCard
            key={t.id}
            table={t}
            result={last[t.id] ?? null}
            rolling={rolling === t.id}
            compact={compact}
            onRoll={show => roll(t.id, show)}
            onEdit={() => setEditing(t.id)}
          />
        )
      )}

      {editing === 'new' && (
        <Editor
          onCancel={() => setEditing(null)}
          onSave={async draft => {
            const res = await createRandomTableAction(campaignId, draft);
            if (!res.ok) return res.error;
            setEditing(null);
            await load();
            return null;
          }}
        />
      )}

      {!compact && tables.length > 0 && editing === null && (
        <Button variant="flat" onPress={() => setEditing('new')}>
          Write a random table
        </Button>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );

  return compact ? (
    body
  ) : (
    <SectionCard
      title="Your random tables"
      description="Rolled into Dice behind the screen, unless you show the party."
    >
      {body}
    </SectionCard>
  );
}

/** One random table: its faces and entries, and the row the last roll hit. */
function TableCard({
  table: t,
  result,
  rolling,
  compact,
  onRoll,
  onEdit,
}: {
  table: RandomTableRow;
  result: RandomTableResult | null;
  rolling: boolean;
  compact: boolean;
  onRoll: (show: boolean) => void;
  onEdit: () => void;
}) {
  const empty = t.entries.length === 0;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 font-medium text-ink">{t.title}</span>
        <span className="font-mono text-xs text-ink-subtle">d{t.die}</span>
        <Button
          size="sm"
          variant="flat"
          isDisabled={empty}
          isLoading={rolling}
          onPress={() => onRoll(false)}
        >
          Roll
        </Button>
        <Button
          size="sm"
          variant="light"
          isDisabled={empty || rolling}
          onPress={() => onRoll(true)}
        >
          Roll and show the party
        </Button>
        {!compact && (
          <Button
            size="sm"
            variant="light"
            className="text-ink-muted"
            onPress={onEdit}
          >
            Edit
          </Button>
        )}
      </div>

      {result && (
        <p className="mt-1 text-sm text-ink" aria-live="polite">
          <span className="font-mono text-xs text-ink-subtle">
            d{t.die} → {faceLabel(t.die, result.face)}
          </span>{' '}
          {result.index === null ? (
            <span className="text-ink-muted">
              nothing on that face — you left it empty
            </span>
          ) : (
            result.entry
          )}
          <span className="ml-2 text-xs text-ink-subtle">
            {result.shown ? 'shown to the party' : 'behind the screen'}
          </span>
        </p>
      )}

      {empty ? (
        <p className="mt-1 text-sm text-ink-muted">
          Nothing on it yet.{compact ? '' : ' Edit it to add entries.'}
        </p>
      ) : (
        <ol
          className={`mt-2 space-y-px ${compact ? 'max-h-64 overflow-y-auto' : ''}`}
        >
          {t.entries.map((e, i) => {
            // `!` because an unlayered `* { border-color }` in globals.css
            // outranks every border-colour utility; the edge is the mark.
            const hit = result?.index === i;
            return (
              <li
                key={i}
                className={`flex items-baseline gap-3 rounded-sm border-l-4 px-1.5 py-0.5 text-sm ${
                  hit
                    ? 'border-l-gold! bg-gold/[0.08] font-semibold text-ink'
                    : 'border-l-transparent! text-ink-muted'
                }`}
              >
                <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-ink-subtle">
                  {rangeLabel(t.die, e)}
                </span>
                <span className="flex-1">{e.text}</span>
                {hit && result && (
                  <Ribbon tone="gold">
                    Rolled {faceLabel(t.die, result.face)}
                  </Ribbon>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

interface Draft {
  title: string;
  die: number;
  entries: RandomTableEntry[];
}

interface Row {
  text: string;
  from: string;
  to: string;
}

/** A face typed in a box: a number, or `00` for 100 on a d100. */
function readFace(die: number, s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  if (die === 100 && v === '00') return 100;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

const toRows = (die: number, list: readonly RandomTableEntry[]): Row[] =>
  list.map(e => ({
    text: e.text,
    from: faceLabel(die, e.from),
    to: faceLabel(die, e.to),
  }));

/**
 * Writing a random table: the die, then one row per entry with its faces.
 * "Spread evenly" shares the die out; "Paste a list" takes lines from notes,
 * with or without their numbers. Changing the die stretches the ranges to
 * the new one in proportion.
 */
function Editor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: RandomTableRow;
  onSave: (draft: Draft) => Promise<string | null>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const startDie =
    initial && (RANDOM_TABLE_DICE as readonly number[]).includes(initial.die)
      ? initial.die
      : 20;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [die, setDie] = useState(startDie);
  // Rows hold what was typed; faces are read off them when needed. A table
  // from before dice had a custom total: its ranges are stretched to a d20.
  const [rows, setRows] = useState<Row[]>(() => {
    if (!initial) return [];
    if (initial.die === startDie) return toRows(startDie, initial.entries);
    const faces = spreadFaces(
      startDie,
      initial.entries.map(e => e.to - e.from + 1)
    );
    return toRows(
      startDie,
      initial.entries.map((e, i) => ({ text: e.text, ...faces[i] }))
    );
  });
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries: RandomTableEntry[] = useMemo(
    () =>
      rows
        .filter(r => r.text.trim())
        .map(r => {
          const from = readFace(die, r.from) ?? 0;
          const to = readFace(die, r.to) ?? from;
          return { text: r.text.trim(), from, to };
        }),
    [rows, die]
  );
  const outOfRange = entries.filter(
    e => e.from < 1 || e.to > die || e.to < e.from
  );
  const { overlaps, gaps } = checkRanges(
    die,
    entries.filter(e => !outOfRange.includes(e))
  );

  const spread = (onDie: number, weights?: number[]) => {
    const live = entries.length
      ? entries
      : rows
          .filter(r => r.text.trim())
          .map(r => ({ text: r.text, from: 1, to: 1 }));
    const faces = spreadFaces(onDie, weights ?? live.map(() => 1));
    setRows(
      toRows(
        onDie,
        live.map((e, i) => ({ text: e.text, ...faces[i] }))
      )
    );
  };

  const changeDie = (next: number) => {
    if (next === die) return;
    // Keep each entry's share of the die: 1–10 on a d20 is 01–50 on a d100.
    const sizes = entries.map(e => Math.max(1, e.to - e.from + 1));
    setDie(next);
    if (entries.length > 0) spread(next, sizes);
  };

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rs => rs.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const canSave =
    Boolean(title.trim()) && overlaps.length === 0 && outOfRange.length === 0;

  return (
    <div className="space-y-3 rounded-md border border-gold/40 bg-gold/[0.04] p-3">
      <Input
        label="Name"
        labelPlacement="outside"
        placeholder="Tavern names"
        value={title}
        onValueChange={setTitle}
      />

      <div className="space-y-1">
        <p className="text-sm text-ink">Rolled on</p>
        <div
          className="flex flex-wrap gap-1"
          role="radiogroup"
          aria-label="Die"
        >
          {RANDOM_TABLE_DICE.map(d => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={die === d}
              onClick={() => changeDie(d)}
              className={`h-9 min-w-12 rounded-md border px-2 font-mono text-sm ${
                die === d
                  ? 'border-gold bg-gold font-semibold text-bg'
                  : 'border-line text-ink-muted hover:text-ink'
              }`}
            >
              d{d}
            </button>
          ))}
        </div>
      </div>

      {pasting ? (
        <div className="space-y-2">
          <Textarea
            label="Paste a list"
            labelPlacement="outside"
            placeholder={
              '01-03 The bridge is out\n04-10 A peddler with a cart\n11-00 Nothing stirs'
            }
            description="One per line. Start each with its faces to keep them, or leave the numbers off and the lines share the die evenly (3x in front makes one three times as likely)."
            minRows={6}
            value={paste}
            onValueChange={setPaste}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={() => {
                setRows(toRows(die, parseBulkEntries(paste, die)));
                setPasting(false);
              }}
            >
              Use this list
            </Button>
            <Button size="sm" variant="light" onPress={() => setPasting(false)}>
              Back to the rows
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.length > 0 && (
            <div className="grid grid-cols-[4rem_0.75rem_4rem_1fr_2.5rem] items-center gap-1.5 text-xs text-ink-subtle">
              <span>From</span>
              <span />
              <span>To</span>
              <span>What happens</span>
              <span />
            </div>
          )}
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[4rem_0.75rem_4rem_1fr_2.5rem] items-center gap-1.5"
            >
              <Input
                size="sm"
                aria-label={`Row ${i + 1}, first face`}
                inputMode="numeric"
                value={r.from}
                onValueChange={from => setRow(i, { from })}
              />
              <span className="text-center text-ink-subtle">–</span>
              <Input
                size="sm"
                aria-label={`Row ${i + 1}, last face`}
                inputMode="numeric"
                value={r.to}
                onValueChange={to => setRow(i, { to })}
              />
              <Input
                size="sm"
                aria-label={`Row ${i + 1}, what happens`}
                placeholder="What happens"
                value={r.text}
                onValueChange={text => setRow(i, { text })}
              />
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label={`Remove row ${i + 1}`}
                className="text-ink-muted data-[hover=true]:text-danger"
                onPress={() => setRows(rs => rs.filter((_, k) => k !== i))}
              >
                ×
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="flat"
              onPress={() => {
                const next = entries.reduce((m, e) => Math.max(m, e.to), 0) + 1;
                const at = Math.min(die, Math.max(1, next));
                setRows(rs => [
                  ...rs,
                  {
                    text: '',
                    from: faceLabel(die, at),
                    to: faceLabel(die, at),
                  },
                ]);
              }}
            >
              Add a line
            </Button>
            <Button
              size="sm"
              variant="light"
              isDisabled={entries.length === 0}
              onPress={() => spread(die)}
            >
              Spread evenly
            </Button>
            <Button
              size="sm"
              variant="light"
              onPress={() => {
                setPaste(formatBulkEntries(die, entries));
                setPasting(true);
              }}
            >
              Paste a list
            </Button>
          </div>
        </div>
      )}

      {outOfRange.length > 0 && (
        <p className="text-sm text-danger">
          {outOfRange.map(e => e.text).join(', ')}{' '}
          {outOfRange.length === 1 ? 'has' : 'have'} faces that are not on a d
          {die}.
        </p>
      )}
      {overlaps.length > 0 && (
        <p className="text-sm text-danger">
          Each face can mean one thing: {overlaps.join('; ')}.
        </p>
      )}
      {overlaps.length === 0 &&
        outOfRange.length === 0 &&
        entries.length > 0 &&
        gaps.length > 0 && (
          <p className="text-xs text-ink-muted">
            {gaps.map(g => rangeLabel(die, g)).join(', ')} land on nothing. That
            is allowed — a roll there says so.
          </p>
        )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          color="primary"
          isLoading={busy}
          isDisabled={!canSave}
          onPress={async () => {
            setBusy(true);
            setError(await onSave({ title, die, entries }));
            setBusy(false);
          }}
        >
          Save
        </Button>
        <Button variant="light" onPress={onCancel}>
          Cancel
        </Button>
        {onDelete && (
          <Button
            variant="light"
            className="ml-auto text-ink-muted data-[hover=true]:text-danger"
            onPress={onDelete}
          >
            Take it down
          </Button>
        )}
      </div>
    </div>
  );
}
