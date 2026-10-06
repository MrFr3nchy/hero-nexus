'use client';

import { Button, Input, Textarea } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  QuestScene,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import {
  dieFor,
  faceRanges,
  formatBulkEntries,
  parseBulkEntries,
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
 * Staff only. A roll goes to Dice behind the screen, or — "Roll and show
 * the party" — in front of it. Entries are written as a pasted list, one
 * per line, `3x ` in front for a heavier one, because that is how they
 * already exist in a DM's notes.
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
  const [last, setLast] = useState<
    (RandomTableResult & { tableId: string }) | null
  >(null);
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
    setLast({ ...res.data, tableId: id });
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
          description="A list of what could happen — tavern names, weather, who comes down the road — rolled when you need one. Paste a list and it is a random table."
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
            onSave={async (title, text) => {
              const res = await updateRandomTableAction(t.id, {
                title,
                entries: parseBulkEntries(text),
              });
              if (!res.ok) return res.error;
              setEditing(null);
              await load();
              return null;
            }}
          />
        ) : (
          <div
            key={t.id}
            className="rounded-md border border-line bg-surface px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex-1 font-medium text-ink">{t.title}</span>
              <span className="font-mono text-xs text-ink-subtle">
                {dieFor(t.entries) ?? 'empty'}
              </span>
              <Button
                size="sm"
                variant="flat"
                isDisabled={t.entries.length === 0}
                isLoading={rolling === t.id}
                onPress={() => roll(t.id, false)}
              >
                Roll
              </Button>
              <Button
                size="sm"
                variant="light"
                isDisabled={t.entries.length === 0 || rolling === t.id}
                onPress={() => roll(t.id, true)}
              >
                Roll and show the party
              </Button>
              {!compact && (
                <Button
                  size="sm"
                  variant="light"
                  className="text-ink-muted"
                  onPress={() => setEditing(t.id)}
                >
                  Edit
                </Button>
              )}
            </div>
            {last?.tableId === t.id && (
              <p className="mt-2 border-t border-line pt-2 text-sm text-ink">
                <span className="font-mono text-xs text-ink-subtle">
                  {last.notation} → {last.face}
                </span>{' '}
                {last.entry}
                <span className="ml-2 text-xs text-ink-subtle">
                  {last.shown ? 'shown to the party' : 'behind the screen'}
                </span>
              </p>
            )}
            {!compact && t.entries.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-ink-subtle">
                  {t.entries.length}{' '}
                  {t.entries.length === 1 ? 'entry' : 'entries'}
                </summary>
                <ol className="mt-1 space-y-0.5 text-sm text-ink-muted">
                  {t.entries.map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-ink-subtle">
                        {faceRanges(t.entries)[i]}
                      </span>
                      <span>{e.text}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        )
      )}

      {editing === 'new' && (
        <Editor
          onCancel={() => setEditing(null)}
          onSave={async (title, text) => {
            const res = await createRandomTableAction(campaignId, {
              title,
              entries: parseBulkEntries(text),
            });
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
      title="Random tables"
      description="Rolled into Dice behind the screen, unless you show the party."
    >
      {body}
    </SectionCard>
  );
}

function Editor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: RandomTableRow;
  onSave: (title: string, text: string) => Promise<string | null>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [text, setText] = useState(
    initial ? formatBulkEntries(initial.entries) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseBulkEntries(text);
  const die = dieFor(parsed);

  return (
    <div className="space-y-3 rounded-md border border-gold/40 bg-gold/[0.04] p-3">
      <Input
        label="Name"
        labelPlacement="outside"
        placeholder="Tavern names"
        value={title}
        onValueChange={setTitle}
      />
      <Textarea
        label="Entries"
        labelPlacement="outside"
        placeholder={
          '3x The Gilded Goose\nThe Drowned Rat\n2x The Bell and Anchor'
        }
        description={
          die
            ? `One per line; 3x in front makes one three times as likely. Rolls ${die}.`
            : 'One per line; 3x in front makes one three times as likely.'
        }
        minRows={5}
        value={text}
        onValueChange={setText}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          color="primary"
          isLoading={busy}
          isDisabled={!title.trim()}
          onPress={async () => {
            setBusy(true);
            setError(await onSave(title, text));
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
