'use client';

/**
 * The shelf of boards: every one this campaign has built, what each is,
 * and the handles on it — into the workshop, onto the table, a new name,
 * or taken down. Then a new board.
 *
 * One component, two doors: the campaign page's Boards tab and the
 * workshop's own index both show it, so a board renamed in one place is
 * renamed in the other and there is no second list to keep in step.
 * Fetches its own rows when given none; refreshes after every handle.
 */
import { Button, Input, Select, SelectItem } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { MATERIALS, MAX_SIDE, MIN_SIDE, VOID } from '@/@shared/battlemap/types';
import {
  BattlefieldScene,
  DiceSpinner,
  EmptyState,
  Glyph,
  Marginalia,
  Ribbon,
  useConfirm,
} from '@/@shared/components/ui';
import type { listBattleMaps } from '@/server/battlemap';
import {
  createBattleMapAction,
  deleteBattleMapAction,
  listBattleMapsAction,
  renameBattleMapAction,
  setBattleMapActiveAction,
} from '../../battlemap-actions';

export type BoardRow = Awaited<ReturnType<typeof listBattleMaps>>[number];

/** "30 × 20 · 2 floors · the party sees it" */
export function describeBoard(b: BoardRow): string {
  return [
    `${b.w} × ${b.h}`,
    `${b.levels} ${b.levels === 1 ? 'floor' : 'floors'}`,
    b.visibility === 'shared' ? 'the party sees it' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The form that lays a new board out. On its own so the table's empty
 * state can borrow it too.
 */
export function NewBoardForm({
  campaignId,
  onLaidOut,
}: {
  campaignId: string;
  /** Where to go with the new board's id; the workshop by default. */
  onLaidOut?: (id: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [w, setW] = useState('30');
  const [h, setH] = useState('20');
  const [floor, setFloor] = useState(String(VOID));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const layOut = async () => {
    setBusy(true);
    setError(null);
    const res = await createBattleMapAction(campaignId, {
      name: name.trim() || undefined,
      w: Number(w),
      h: Number(h),
      material: Number(floor),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName('');
    if (onLaidOut) await onLaidOut(res.data.id);
    else router.push(`/campaigns/${campaignId}/workshop/${res.data.id}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        size="sm"
        label="Called"
        placeholder="Blackwood Manor"
        className="w-52"
        value={name}
        onValueChange={setName}
      />
      <Input
        size="sm"
        type="number"
        label="Wide"
        className="w-20"
        min={MIN_SIDE}
        max={MAX_SIDE}
        value={w}
        onValueChange={setW}
      />
      <Input
        size="sm"
        type="number"
        label="Tall"
        className="w-20"
        min={MIN_SIDE}
        max={MAX_SIDE}
        value={h}
        onValueChange={setH}
      />
      <Select
        size="sm"
        label="Floor"
        aria-label="What every tile starts as"
        className="w-36"
        selectedKeys={[floor]}
        onSelectionChange={keys => {
          const k = String(Array.from(keys)[0] ?? '');
          if (k) setFloor(k);
        }}
      >
        {MATERIALS.map((m, i) => (
          <SelectItem key={String(i)} textValue={m.name}>
            {i === VOID ? 'Nothing yet' : m.name}
          </SelectItem>
        ))}
      </Select>
      <Button size="sm" color="primary" isDisabled={busy} onPress={layOut}>
        Lay it out
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** One board on the shelf, with its handles. */
function BoardCard({
  campaignId,
  board,
  busy,
  onActive,
  onRename,
  onDelete,
}: {
  campaignId: string;
  board: BoardRow;
  busy: boolean;
  onActive: (active: boolean) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(board.name);

  const save = async () => {
    setRenaming(false);
    if (draft.trim() === board.name) return;
    await onRename(draft.trim());
  };

  return (
    <li
      className={`flex flex-col gap-2 rounded-[var(--radius-card)] border bg-surface p-4 ${
        board.isActive ? 'border-gold' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          {renaming ? (
            <Input
              size="sm"
              autoFocus
              aria-label="Board name"
              placeholder="The sand table"
              className="w-56"
              value={draft}
              onValueChange={setDraft}
              onBlur={save}
              onKeyDown={e => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') {
                  setDraft(board.name);
                  setRenaming(false);
                }
              }}
            />
          ) : (
            <Link
              href={`/campaigns/${campaignId}/workshop/${board.id}`}
              className="truncate font-display text-lg text-ink hover:text-gold-strong dark:hover:text-gold"
            >
              {board.name || 'The sand table'}
            </Link>
          )}
          <span className="text-xs text-ink-muted">{describeBoard(board)}</span>
        </div>
        {board.isActive && <Ribbon tone="gold">On the table</Ribbon>}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Button
          as={Link}
          href={`/campaigns/${campaignId}/workshop/${board.id}`}
          size="sm"
          variant="flat"
          startContent={<Glyph name="hammer" size={13} />}
        >
          Open the workshop
        </Button>
        <Button
          size="sm"
          variant={board.isActive ? 'flat' : 'solid'}
          color={board.isActive ? 'default' : 'primary'}
          isDisabled={busy}
          onPress={() => onActive(!board.isActive)}
        >
          {board.isActive ? 'Take it off the table' : 'Put it on the table'}
        </Button>
        <Button
          size="sm"
          variant="light"
          isDisabled={busy || renaming}
          onPress={() => {
            setDraft(board.name);
            setRenaming(true);
          }}
        >
          Rename
        </Button>
        <Button
          size="sm"
          variant="light"
          className="text-ink-muted data-[hover=true]:text-danger"
          isDisabled={busy}
          onPress={onDelete}
        >
          Take down
        </Button>
      </div>
    </li>
  );
}

export function BoardShelf({
  campaignId,
  initial,
}: {
  campaignId: string;
  /** Rows already read on the server, so the page paints with them. */
  initial?: BoardRow[];
}) {
  const [boards, setBoards] = useState<BoardRow[] | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(async () => {
    setBoards(await listBattleMapsAction(campaignId));
  }, [campaignId]);

  useEffect(() => {
    if (!initial) refresh();
  }, [initial, refresh]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await p;
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
    await refresh();
    setBusy(false);
  };

  if (!boards) {
    return (
      <div className="flex justify-center py-10">
        <DiceSpinner label="Fetching them down…" />
      </div>
    );
  }

  const form = (
    <NewBoardForm campaignId={campaignId} onLaidOut={() => refresh()} />
  );

  return (
    <div className="flex flex-col gap-6">
      {dialog}
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {boards.length === 0 ? (
        <EmptyState
          scene={<BattlefieldScene />}
          title="No board on the shelf"
          description="Lay one out, then build the house on it."
          action={form}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {boards.map(b => (
              <BoardCard
                key={b.id}
                campaignId={campaignId}
                board={b}
                busy={busy}
                onActive={active => act(setBattleMapActiveAction(b.id, active))}
                onRename={name => act(renameBattleMapAction(b.id, name))}
                onDelete={async () => {
                  const yes = await confirm({
                    title: `Take down ${b.name || 'this board'}?`,
                    body: 'Every floor, wall and thing on it goes with it. The fight it was dealt from stays.',
                    confirmLabel: 'Take it down',
                    destructive: true,
                  });
                  if (!yes) return;
                  await act(deleteBattleMapAction(b.id));
                }}
              />
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl">A new board</h2>
            {form}
            <Marginalia dash>
              a mansion is a few floors, stacked — start with the ground
            </Marginalia>
          </div>
        </>
      )}
    </div>
  );
}
