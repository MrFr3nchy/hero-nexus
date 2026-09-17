'use client';

/**
 * The floors of the sand table, as tabs across the top of the board.
 *
 * One tab per floor, top to bottom the way a house stacks, each with a pip
 * per combatant standing on it — gold for the party, oxblood for a foe —
 * so the DM sees at a glance that the ghouls are upstairs. The board
 * follows somebody by default (the turn, or a player's own hero); picking
 * a tab stops that until "Follow" is pressed again.
 *
 * Staff get the rest of the house here too: add a floor, ghost the floor
 * below, and — behind a popover — rename, re-height or remove the one in
 * front. A player gets the tabs alone, and only for the floors the server
 * has let them see: the tabs *are* the fog's answer to "how big is this
 * place", so a floor the party has not set foot on is not a tab at all.
 */
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
} from '@heroui/react';
import { useTheme } from 'next-themes';
import { useState } from 'react';

import {
  newLevelFrom,
  type LevelStart,
} from '@/@creator/campaign/lib/battlemap';
import {
  feetLabel,
  levelOf,
  MATERIALS,
  MAX_LEVELS,
  type Ambient,
  type BoardDoc,
  type LevelDoc,
} from '@/@shared/battlemap/types';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import type { BattleTokenRow } from '@/server/battlemap';
import type { EntryRow } from '@/server/session';

export function FloorRail({
  board,
  tokens,
  entriesById,
  levelId,
  isStaff,
  follow,
  onPick,
  onFollow,
  onion,
  onOnion,
  onChange,
  onAdded,
  onError,
}: {
  board: BoardDoc;
  tokens: BattleTokenRow[];
  entriesById: Map<string, EntryRow>;
  levelId: string;
  isStaff: boolean;
  follow: boolean;
  onPick: (levelId: string) => void;
  onFollow: () => void;
  onion: boolean;
  onOnion: (on: boolean) => void;
  /** The whole board, changed. The board schedules the save. */
  onChange: (next: BoardDoc) => void;
  /** A floor was added; the board turns to it. */
  onAdded: (levelId: string) => void;
  onError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const level = levelOf(board, levelId);
  const mine = tokens.find(t => t.mine && t.entryId)?.level ?? null;
  const single = board.levels.length === 1;

  const pips = (id: string) =>
    tokens
      .filter(t => t.level === id && t.entryId)
      .map(t => entriesById.get(t.entryId as string)?.side ?? 'other');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <nav
        aria-label="Floors"
        className="inline-flex flex-wrap rounded-md border border-line bg-surface-2 p-0.5"
      >
        {[...board.levels].reverse().map(l => {
          const on = l.id === levelId;
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(l.id)}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                on
                  ? 'bg-gold font-medium text-bg'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <span>
                {l.name || 'A floor'}
                {!isStaff && l.id === mine ? ' · you' : ''}
              </span>
              {isStaff && (
                <span
                  className={`tabular-nums ${on ? 'text-bg/70' : 'text-ink-subtle'}`}
                >
                  {feetLabel(l.feet)}
                </span>
              )}
              {pips(l.id).length > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  {pips(l.id)
                    .slice(0, 8)
                    .map((side, i) => (
                      <span
                        key={i}
                        aria-hidden="true"
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          side === 'foe'
                            ? 'bg-danger'
                            : side === 'party'
                              ? on
                                ? 'bg-bg'
                                : 'bg-gold'
                              : 'bg-ink-muted'
                        }`}
                      />
                    ))}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {!single && (
        <button
          type="button"
          aria-pressed={follow}
          onClick={onFollow}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
            follow
              ? 'border-gold/50 text-gold-strong dark:text-gold'
              : 'border-line text-ink-muted hover:text-ink'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 rounded-full ${follow ? 'bg-gold' : 'bg-ink-subtle'}`}
          />
          {isStaff ? 'Follow the turn' : 'Follow me'}
        </button>
      )}
      {!isStaff && !single && (
        <Marginalia dash className="ml-1">
          each of you sees the floor you stand on
        </Marginalia>
      )}
      {isStaff && (
        <>
          <span className="mx-1 h-5 w-px bg-line" />
          <Popover placement="bottom-start">
            <PopoverTrigger>
              <Button
                size="sm"
                variant="flat"
                className="min-w-0 px-2.5"
                startContent={<Glyph name="floors" size={13} />}
              >
                This floor
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 border border-line bg-surface p-3">
              <ThisFloor
                board={board}
                level={level}
                tokensHere={tokens.filter(t => t.level === level.id).length}
                onChange={onChange}
                onPick={onPick}
              />
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            variant="flat"
            className="min-w-0 px-2.5"
            isDisabled={board.levels.length >= MAX_LEVELS}
            startContent={<Glyph name="plus" size={13} />}
            onPress={() => setAdding(true)}
          >
            Add a floor
          </Button>
          {board.levels.findIndex(l => l.id === levelId) > 0 && (
            <button
              type="button"
              aria-pressed={onion}
              onClick={() => onOnion(!onion)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                onion
                  ? 'border-gold/50 text-gold-strong dark:text-gold'
                  : 'border-line text-ink-muted hover:text-ink'
              }`}
            >
              Ghost the floor below
            </button>
          )}
          {adding && (
            <AddFloorDialog
              open={adding}
              board={board}
              from={level}
              onClose={() => setAdding(false)}
              onAdd={next => {
                const feet = next.feet;
                if (board.levels.some(l => l.feet === feet)) {
                  onError('There is already a floor at that height.');
                  return;
                }
                const levels = [...board.levels, next].sort(
                  (a, b) => a.feet - b.feet
                );
                onChange({ ...board, levels });
                setAdding(false);
                onAdded(next.id);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Rename, re-height, relight or remove the floor in front. */
function ThisFloor({
  board,
  level,
  tokensHere,
  onChange,
  onPick,
}: {
  board: BoardDoc;
  level: LevelDoc;
  tokensHere: number;
  onChange: (next: BoardDoc) => void;
  onPick: (levelId: string) => void;
}) {
  const write = (patch: Partial<LevelDoc>) =>
    onChange({
      ...board,
      levels: board.levels
        .map(l => (l.id === level.id ? { ...l, ...patch } : l))
        .sort((a, b) => a.feet - b.feet),
    });
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex w-full flex-col gap-2">
      <Input
        size="sm"
        label="Called"
        defaultValue={level.name}
        onBlur={e => {
          const v = e.currentTarget.value.trim();
          if (v && v !== level.name) write({ name: v });
        }}
      />
      <Input
        size="sm"
        type="number"
        label="Height, in feet from the ground floor"
        step={5}
        defaultValue={String(level.feet)}
        onBlur={e => {
          const v = Math.trunc(Number(e.currentTarget.value));
          if (!Number.isFinite(v) || v === level.feet) return;
          if (board.levels.some(l => l.id !== level.id && l.feet === v)) return;
          write({ feet: Math.max(-500, Math.min(500, v)) });
        }}
      />
      <Marginalia dash>
        a tile&apos;s height is measured from this floor, not from the garden
      </Marginalia>
      {board.levels.length > 1 &&
        (confirming ? (
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <span>
              {tokensHere > 0
                ? `${tokensHere} on it drop to the ground floor.`
                : 'Gone for good.'}
            </span>
            <Button
              size="sm"
              color="danger"
              variant="flat"
              className="h-7 min-w-0 px-2.5 text-xs"
              onPress={() => {
                const rest = board.levels.filter(l => l.id !== level.id);
                onChange({
                  ...board,
                  levels: rest,
                  links: board.links.filter(
                    k => k.from !== level.id && k.to !== level.id
                  ),
                });
                onPick(levelOf({ ...board, levels: rest }, null).id);
              }}
            >
              Remove it
            </Button>
            <Button
              size="sm"
              variant="light"
              className="h-7 min-w-0 px-2.5 text-xs"
              onPress={() => setConfirming(false)}
            >
              Keep it
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="light"
            className="self-start text-danger"
            onPress={() => setConfirming(true)}
          >
            Remove this floor
          </Button>
        ))}
    </div>
  );
}

const HEIGHTS = [10, 12, 15, 20];

/**
 * "Add a floor": what it is called, which floor it sits above or below,
 * how far, what light it keeps, and what it starts as — open air, the
 * shell of the floor it copies, or the whole floor without the furniture.
 * A mansion is a few of these, stacked.
 */
export function AddFloorDialog({
  open,
  board,
  from,
  onClose,
  onAdd,
}: {
  open: boolean;
  board: BoardDoc;
  from: LevelDoc;
  onClose: () => void;
  onAdd: (level: LevelDoc) => void;
}) {
  const [name, setName] = useState('');
  const [sits, setSits] = useState<'above' | 'below'>('above');
  const [sourceId, setSourceId] = useState<string>(from.id);
  const [height, setHeight] = useState(12);
  const [ambient, setAmbient] = useState<Ambient>('bright');
  const [start, setStart] = useState<LevelStart>('outer');
  const [material, setMaterial] = useState(4);
  const dark = useTheme().resolvedTheme === 'dark';

  const source = levelOf(board, sourceId);
  const feet = source.feet + (sits === 'above' ? height : -height);
  const taken = board.levels.some(l => l.feet === feet);
  const suggested =
    sits === 'above'
      ? source.feet < 0
        ? 'Ground floor'
        : source.feet === 0
          ? 'Upper floor'
          : 'Attic'
      : source.feet > 0
        ? 'Ground floor'
        : 'Cellar';

  const chip = (on: boolean) =>
    `rounded px-2 py-0.5 text-xs transition-colors ${
      on ? 'bg-gold font-medium text-bg' : 'text-ink-muted hover:text-ink'
    }`;

  const STARTS: { id: LevelStart; label: string; sub: string }[] = [
    { id: 'void', label: 'Nothing', sub: 'Open air. Paint it in yourself.' },
    {
      id: 'outer',
      label: 'Outside walls',
      sub: `The ${source.name.toLowerCase()}'s shell, empty inside.`,
    },
    {
      id: 'copy',
      label: 'A full copy',
      sub: 'Rooms, walls and doors. No furniture.',
    },
  ];

  return (
    <Modal
      isOpen={open}
      onOpenChange={o => {
        if (!o) onClose();
      }}
      size="lg"
      backdrop="opaque"
      classNames={{ base: 'border border-line bg-surface' }}
    >
      <ModalContent>
        <ModalHeader className="font-display text-xl font-medium">
          Add a floor
        </ModalHeader>
        <ModalBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              size="md"
              label="Called"
              placeholder={suggested}
              className="w-56"
              value={name}
              onValueChange={setName}
            />
            <Select
              size="md"
              label="Sits"
              aria-label="Above or below"
              className="w-32"
              selectedKeys={[sits]}
              onSelectionChange={keys => {
                const k = String(Array.from(keys)[0] ?? 'above');
                setSits(k === 'below' ? 'below' : 'above');
              }}
            >
              <SelectItem key="above">Above</SelectItem>
              <SelectItem key="below">Below</SelectItem>
            </Select>
            <Select
              size="md"
              label="The"
              aria-label="Which floor"
              className="w-48"
              selectedKeys={[sourceId]}
              onSelectionChange={keys => {
                const k = String(Array.from(keys)[0] ?? '');
                if (k) setSourceId(k);
              }}
            >
              {[...board.levels].reverse().map(l => (
                <SelectItem key={l.id} textValue={l.name}>
                  {l.name} · {feetLabel(l.feet)}
                </SelectItem>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Floor to floor</span>
              <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
                {HEIGHTS.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHeight(h)}
                    className={chip(h === height)}
                  >
                    {h} ft
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">Its light</span>
              <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
                {(['bright', 'dim', 'dark'] as const).map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAmbient(a)}
                    className={`capitalize ${chip(a === ambient)}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-muted">Start it with</span>
            <div className="flex flex-col gap-1.5">
              {STARTS.map(o => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={start === o.id}
                  onClick={() => setStart(o.id)}
                  className={`flex items-baseline gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    start === o.id
                      ? 'border-gold bg-gold/10 text-ink'
                      : 'border-line text-ink-muted hover:text-ink'
                  }`}
                >
                  <span className="font-medium">{o.label}</span>
                  <span className="text-xs text-ink-muted">{o.sub}</span>
                </button>
              ))}
            </div>
            {start === 'outer' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-muted">Floored with</span>
                {MATERIALS.map((m, i) =>
                  i === 0 || m.impassable ? null : (
                    <button
                      key={m.key}
                      type="button"
                      aria-label={m.name}
                      aria-pressed={material === i}
                      onClick={() => setMaterial(i)}
                      className={`h-5 w-5 rounded-sm border ${
                        material === i
                          ? 'border-gold ring-1 ring-gold'
                          : 'border-line'
                      }`}
                      style={{ background: dark ? m.swatchDark : m.swatch }}
                      title={m.name}
                    />
                  )
                )}
              </div>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {taken
              ? `There is already a floor at ${feetLabel(feet)}.`
              : `${name.trim() || suggested}, ${feetLabel(feet)} — ${
                  start === 'void'
                    ? 'a floor with nothing on it'
                    : start === 'outer'
                      ? `the shell of the ${source.name.toLowerCase()}`
                      : `a copy of the ${source.name.toLowerCase()}, without the furniture`
                }.`}
          </p>
          <Marginalia dash>
            a mansion is just a few of these, stacked
          </Marginalia>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            Never mind
          </Button>
          <Button
            color="primary"
            isDisabled={taken}
            onPress={() =>
              onAdd(
                newLevelFrom(board, source, {
                  name: name.trim() || suggested,
                  feet,
                  ambient,
                  start,
                  material,
                })
              )
            }
          >
            Add the floor
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
