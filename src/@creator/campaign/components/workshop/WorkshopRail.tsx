'use client';

/**
 * The workshop's right rail: the floors, what is selected, and the facts.
 *
 * Floors top to bottom the way a house stacks, each with its height, a
 * line of what is on it and a pip per combatant; "Add a floor" under
 * them, and the ghost toggle. Then the thing in hand — the stairs with
 * their two floors, a door with its lock, a box of the board — and at the
 * foot the board's size, this floor's light, and when the party sees it.
 */
import { Button, Input, Select, SelectItem } from '@heroui/react';
import { useState } from 'react';

import {
  feetLabel,
  levelOf,
  LEVEL_SEENS,
  MAX_LEVELS,
  TILE_FEET,
  type BoardDoc,
  type ItemState,
  type LevelDoc,
  type LevelLink,
  type LevelSeen,
} from '@/@shared/battlemap/types';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import type { WorkshopBoard, WorkshopToken } from '@/server/battlemap';
import { ImagePicker } from '../ImagePicker';
import { AddFloorDialog } from '../session/FloorRail';
import { ThingEffectEditor } from '../session/ThingEffectEditor';
import { Label, Toggle } from './WorkshopPanel';

const SEEN_LABEL: Record<LevelSeen, string> = {
  hero: 'When a hero is up there',
  always: 'Always',
  reveal: 'Only what you reveal',
};

export function WorkshopRail({
  campaignId,
  bench,
  doc,
  terrain,
  tokens,
  onLevel,
  onion,
  onOnion,
  onChange,
  selectedLink,
  selectedToken,
  box,
  onClearSelection,
  onRemoveSelection,
  onTokenChange,
  onError,
  reload,
}: {
  campaignId: string;
  bench: WorkshopBoard;
  doc: BoardDoc;
  terrain: LevelDoc;
  tokens: WorkshopToken[];
  onLevel: (id: string) => void;
  onion: boolean;
  onOnion: (on: boolean) => void;
  onChange: (next: BoardDoc) => void;
  selectedLink: LevelLink | null;
  selectedToken: WorkshopToken | null;
  box: { x: number; y: number; w: number; h: number } | null;
  onClearSelection: () => void;
  onRemoveSelection: () => void;
  onTokenChange: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onError: (message: string) => void;
  reload: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [changingLink, setChangingLink] = useState(false);
  const levelIdx = doc.levels.findIndex(l => l.id === terrain.id);

  const writeLevel = (patch: Partial<LevelDoc>) =>
    onChange({
      ...doc,
      levels: doc.levels
        .map(l => (l.id === terrain.id ? { ...l, ...patch } : l))
        .sort((a, b) => a.feet - b.feet),
    });
  const writeLink = (patch: Partial<LevelLink>) =>
    selectedLink &&
    onChange({
      ...doc,
      links: doc.links.map(l =>
        l.id === selectedLink.id ? { ...l, ...patch } : l
      ),
    });

  const partyHere = (id: string) => tokens.filter(t => t.level === id);

  return (
    <aside className="flex w-[312px] shrink-0 flex-col gap-[22px] overflow-y-auto border-l border-line bg-surface px-[18px] py-5">
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h3 className="font-display text-lg">Floors</h3>
          <span className="text-xs text-ink-muted">top to bottom</span>
        </div>
        <div className="flex flex-col gap-1">
          {[...doc.levels].reverse().map(l => {
            const on = l.id === terrain.id;
            const on_it = partyHere(l.id);
            const party = on_it.filter(t => t.side === 'party').length;
            const foes = on_it.filter(t => t.side === 'foe').length;
            const rooms = l.rooms?.length ?? 0;
            const bits = [`${rooms} ${rooms === 1 ? 'room' : 'rooms'}`];
            if (party) bits.push(`${party} ${party === 1 ? 'hero' : 'heroes'}`);
            if (foes) bits.push(`${foes} ${foes === 1 ? 'foe' : 'foes'}`);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => onLevel(l.id)}
                className={`flex h-[52px] items-center gap-2.5 rounded-[10px] border px-3 text-left transition-colors ${
                  on
                    ? 'border-gold bg-gold/10'
                    : 'border-line bg-surface-2 hover:border-ink-subtle'
                }`}
              >
                <span
                  className={`w-11 text-xs font-semibold tabular-nums ${
                    on ? 'text-gold-strong dark:text-gold' : 'text-ink-muted'
                  }`}
                >
                  {feetLabel(l.feet)}
                </span>
                <span className="flex grow flex-col gap-px">
                  <span className="text-sm font-medium">{l.name}</span>
                  <span className="text-[11px] text-ink-muted">
                    {bits.join(' · ')}
                  </span>
                </span>
                <span className="flex gap-[3px]">
                  {on_it
                    .filter(t => t.entryId)
                    .slice(0, 8)
                    .map(t => (
                      <span
                        key={t.id}
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${
                          t.side === 'foe'
                            ? 'bg-danger'
                            : t.side === 'party'
                              ? 'bg-gold'
                              : 'bg-ink-muted'
                        }`}
                      />
                    ))}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={doc.levels.length >= MAX_LEVELS}
          onClick={() => setAdding(true)}
          className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-gold/50 text-[13px] font-medium text-gold-strong hover:bg-gold/10 disabled:opacity-40 dark:text-gold"
        >
          <Glyph name="plus" size={14} />
          <span>Add a floor</span>
        </button>
        {adding && (
          <AddFloorDialog
            open={adding}
            board={doc}
            from={terrain}
            onClose={() => setAdding(false)}
            onAdd={next => {
              if (doc.levels.some(l => l.feet === next.feet)) {
                onError('There is already a floor at that height.');
                return;
              }
              onChange({
                ...doc,
                levels: [...doc.levels, next].sort((a, b) => a.feet - b.feet),
              });
              setAdding(false);
              onLevel(next.id);
            }}
          />
        )}
        {levelIdx > 0 && (
          <Toggle label="Ghost the floor below" on={onion} onChange={onOnion} />
        )}
      </section>

      <span className="h-px bg-line" />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="font-display-alt text-[10px] font-semibold tracking-[0.16em] text-gold-strong dark:text-gold">
            SELECTED
          </span>
          <span className="h-px grow bg-line" />
        </div>

        {selectedLink && (
          <>
            <div className="flex flex-col gap-0.5">
              <Input
                aria-label="What the stairs are called"
                size="sm"
                variant="underlined"
                classNames={{ input: 'font-display text-xl' }}
                placeholder={
                  selectedLink.kind === 'ladder' ? 'The ladder' : 'The stairs'
                }
                defaultValue={selectedLink.name ?? ''}
                onBlur={e => {
                  const v = e.currentTarget.value.trim();
                  if (v !== (selectedLink.name ?? '')) writeLink({ name: v });
                }}
              />
              <span className="text-xs text-ink-muted">
                {selectedLink.kind === 'ladder' ? 'Ladder' : 'Stairs'} ·{' '}
                {selectedLink.w} × {selectedLink.h} tiles
              </span>
            </div>
            <div className="flex flex-col overflow-hidden rounded-[10px] border border-line">
              {[selectedLink.to, selectedLink.from].map((id, i) => {
                const l = levelOf(doc, id);
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2.5 px-3 py-2.5 ${
                      i === 0 ? 'bg-surface-2' : 'border-t border-line'
                    }`}
                  >
                    <span className="w-11 text-xs font-semibold text-ink-muted">
                      {feetLabel(l.feet)}
                    </span>
                    <span className="grow text-[13px]">{l.name}</span>
                    <Glyph
                      name={i === 0 ? 'stairs' : 'ladder'}
                      size={14}
                      className="text-ink-muted"
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              It stands on both floors. A token that ends its move on it is
              offered the other one.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setChangingLink(v => !v)}
                className="h-[38px] grow rounded-lg border border-line text-xs text-ink hover:bg-surface-2"
              >
                Change the link
              </button>
              <button
                type="button"
                onClick={() => writeLink({ hidden: !selectedLink.hidden })}
                className={`h-[38px] grow rounded-lg border text-xs hover:bg-surface-2 ${
                  selectedLink.hidden
                    ? 'border-gold text-gold-strong dark:text-gold'
                    : 'border-line text-ink'
                }`}
              >
                {selectedLink.hidden ? 'Let them find it' : 'Hide until found'}
              </button>
            </div>
            {changingLink && (
              <div className="flex flex-col gap-2 rounded-lg border border-gold/40 p-2">
                <Label>LEADS TO</Label>
                <Select
                  size="sm"
                  aria-label="The other floor"
                  selectedKeys={[
                    selectedLink.from === terrain.id
                      ? selectedLink.to
                      : selectedLink.from,
                  ]}
                  onSelectionChange={keys => {
                    const other = String(Array.from(keys)[0] ?? '');
                    if (!other || other === terrain.id) return;
                    const lower =
                      levelOf(doc, other).feet < terrain.feet
                        ? other
                        : terrain.id;
                    const upper = lower === other ? terrain.id : other;
                    writeLink({ from: lower, to: upper });
                    setChangingLink(false);
                  }}
                >
                  {[...doc.levels]
                    .reverse()
                    .filter(l => l.id !== terrain.id)
                    .map(l => (
                      <SelectItem key={l.id} textValue={l.name}>
                        {l.name} · {feetLabel(l.feet)}
                      </SelectItem>
                    ))}
                </Select>
                <Select
                  size="sm"
                  aria-label="What kind"
                  selectedKeys={[selectedLink.kind]}
                  onSelectionChange={keys => {
                    const k = String(Array.from(keys)[0] ?? '');
                    if (k === 'stairs' || k === 'ladder')
                      writeLink({ kind: k });
                  }}
                >
                  <SelectItem key="stairs">Stairs</SelectItem>
                  <SelectItem key="ladder">Ladder</SelectItem>
                </Select>
              </div>
            )}
            <Button
              size="sm"
              variant="light"
              className="self-start text-danger"
              onPress={onRemoveSelection}
            >
              Remove it
            </Button>
          </>
        )}

        {selectedToken && (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-xl">
                {selectedToken.label || 'Something'}
              </span>
              <span className="text-xs text-ink-muted">
                {selectedToken.entryId
                  ? `${selectedToken.side === 'party' ? 'A hero' : selectedToken.side === 'foe' ? 'A foe' : 'Somebody'} · tile ${selectedToken.x}, ${selectedToken.y}`
                  : `A thing · tile ${selectedToken.x}, ${selectedToken.y}`}
              </span>
            </div>
            {!selectedToken.entryId && (
              <>
                <ImagePicker
                  campaignId={campaignId}
                  label="Stands up as"
                  library
                  hint={false}
                  value={selectedToken.imageId}
                  onChange={imageId =>
                    void onTokenChange(selectedToken.id, { imageId })
                  }
                />
                <Input
                  size="sm"
                  label="Called"
                  defaultValue={selectedToken.label}
                  onBlur={e => {
                    const v = e.currentTarget.value.trim();
                    if (v && v !== selectedToken.label) {
                      void onTokenChange(selectedToken.id, { label: v });
                    }
                  }}
                />
                <div className="grid grid-cols-4 gap-1">
                  {(['open', 'closed', 'locked', 'broken'] as ItemState[]).map(
                    s => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={selectedToken.state === s}
                        onClick={() =>
                          void onTokenChange(selectedToken.id, { state: s })
                        }
                        className={`h-9 rounded-lg border text-xs capitalize ${
                          selectedToken.state === s
                            ? 'border-gold bg-gold font-semibold text-bg'
                            : 'border-line text-ink-muted hover:text-ink'
                        }`}
                      >
                        {s}
                      </button>
                    )
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    size="sm"
                    type="number"
                    label="Lock DC"
                    defaultValue={
                      selectedToken.lockDc === null
                        ? ''
                        : String(selectedToken.lockDc)
                    }
                    onBlur={e => {
                      const v = e.currentTarget.value.trim();
                      void onTokenChange(selectedToken.id, {
                        lockDc: v === '' ? null : Math.trunc(Number(v)),
                      });
                    }}
                  />
                  <Input
                    size="sm"
                    type="number"
                    label="Hit points"
                    placeholder="unbreakable"
                    defaultValue={
                      selectedToken.hpMax === null
                        ? ''
                        : String(selectedToken.hpMax)
                    }
                    onBlur={e => {
                      const v = e.currentTarget.value.trim();
                      const next = v === '' ? null : Math.trunc(Number(v));
                      if (next !== selectedToken.hpMax) {
                        void onTokenChange(selectedToken.id, { hpMax: next });
                      }
                    }}
                  />
                </div>
                <ThingEffectEditor
                  campaignId={campaignId}
                  token={selectedToken}
                  terrain={levelOf(doc, selectedToken.level)}
                  onDone={reload}
                />
              </>
            )}
            {doc.levels.length > 1 && (
              <Select
                size="sm"
                label="Stands on"
                aria-label="Which floor it stands on"
                selectedKeys={[selectedToken.level]}
                onSelectionChange={keys => {
                  const key = String(Array.from(keys)[0] ?? '');
                  if (key && key !== selectedToken.level) {
                    void onTokenChange(selectedToken.id, { level: key });
                  }
                }}
              >
                {[...doc.levels].reverse().map(l => (
                  <SelectItem key={l.id} textValue={l.name}>
                    {l.name} · {feetLabel(l.feet)}
                  </SelectItem>
                ))}
              </Select>
            )}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="flat"
                onPress={() =>
                  void onTokenChange(selectedToken.id, {
                    visibility:
                      selectedToken.visibility === 'shared' ? 'dm' : 'shared',
                  })
                }
              >
                {selectedToken.visibility === 'shared'
                  ? 'Hide from the party'
                  : 'Show the party'}
              </Button>
              <Button
                size="sm"
                variant="light"
                className="text-danger"
                onPress={onRemoveSelection}
              >
                Take it off
              </Button>
            </div>
          </>
        )}

        {box && (
          <>
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-xl">A box of the board</span>
              <span className="text-xs text-ink-muted">
                {box.w} × {box.h} tiles · {box.w * TILE_FEET} ×{' '}
                {box.h * TILE_FEET} ft · from {box.x}, {box.y}
              </span>
            </div>
            <Marginalia dash>
              the Select tool says what to do with it
            </Marginalia>
            <Button size="sm" variant="light" onPress={onClearSelection}>
              Let it go
            </Button>
          </>
        )}

        {!selectedLink && !selectedToken && !box && (
          <Marginalia dash>
            tap the stairs, a thing, or drag a box with Select
          </Marginalia>
        )}
      </section>

      <span className="h-px bg-line" />

      <section className="flex flex-col gap-2 text-[13px]">
        <div className="flex justify-between">
          <span className="text-ink-muted">Board</span>
          <span>
            {doc.w} × {doc.h} · {doc.w * TILE_FEET} × {doc.h * TILE_FEET} ft
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">This floor&apos;s light</span>
          <span className="capitalize">{terrain.ambient}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-muted">Party sees it</span>
          <Select
            size="sm"
            aria-label="When the party sees this floor"
            className="w-40"
            classNames={{ trigger: 'h-8 min-h-8' }}
            selectedKeys={[terrain.seen ?? 'hero']}
            onSelectionChange={keys => {
              const k = String(Array.from(keys)[0] ?? 'hero') as LevelSeen;
              if (!LEVEL_SEENS.includes(k)) return;
              writeLevel(k === 'hero' ? { seen: undefined } : { seen: k });
            }}
          >
            {LEVEL_SEENS.map(s => (
              <SelectItem key={s} textValue={SEEN_LABEL[s]}>
                {SEEN_LABEL[s]}
              </SelectItem>
            ))}
          </Select>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-muted">In play</span>
          <span>{bench.isActive ? 'Yes' : 'On the shelf'}</span>
        </div>
      </section>
    </aside>
  );
}
