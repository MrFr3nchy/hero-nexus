'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
} from '@heroui/react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useRef, useState } from 'react';

import { MATERIALS, VOID, type TerrainDoc } from '@/@shared/battlemap/types';
import { Glyph, Marginalia } from '@/@shared/components/ui';
import type { PlanSpot } from '@/server/encounter-plans';
import {
  getBoardTerrainAction,
  listBattleMapsAction,
} from '../battlemap-actions';
import { setPlanLineSpotsAction } from '../encounter-actions';

type BoardChoice = Awaited<ReturnType<typeof listBattleMapsAction>>[number];
type BoardTerrain = NonNullable<
  Awaited<ReturnType<typeof getBoardTerrainAction>>
>;

/**
 * Where a planned monster's copies stand.
 *
 * A small map of the chosen board in a popover: tap a tile to put the next
 * copy there, tap a spot to take it back. A plan places on one board — a
 * line placed on the cellar is a line placed on the cellar — so picking a
 * different board starts over. Saved on every tap; a plan is prep, and
 * prep is saved as it is written.
 */
export function PlanSpots({
  campaignId,
  lineId,
  name,
  count,
  spots,
  onChange,
}: {
  campaignId: string;
  lineId: string;
  name: string;
  count: number;
  spots: PlanSpot[];
  onChange: () => Promise<void>;
}) {
  const [boards, setBoards] = useState<BoardChoice[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(
    spots[0]?.mapId ?? null
  );
  const [board, setBoard] = useState<BoardTerrain | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || boards) return;
    listBattleMapsAction(campaignId).then(list => {
      setBoards(list);
      // Default to the board on the table: the one the fight will be on.
      if (!boardId)
        setBoardId(list.find(b => b.isActive)?.id ?? list[0]?.id ?? null);
    });
  }, [open, boards, boardId, campaignId]);

  useEffect(() => {
    if (!boardId) {
      setBoard(null);
      return;
    }
    let live = true;
    getBoardTerrainAction(boardId).then(b => {
      if (live) setBoard(b);
    });
    return () => {
      live = false;
    };
  }, [boardId]);

  const here = spots.filter(s => s.mapId === boardId);

  const write = async (next: PlanSpot[]) => {
    const res = await setPlanLineSpotsAction(lineId, next);
    if (res.ok) await onChange();
  };

  const tap = (x: number, y: number) => {
    if (!boardId) return;
    const at = here.findIndex(s => s.x === x && s.y === y);
    if (at >= 0) {
      void write(here.filter((_, i) => i !== at));
      return;
    }
    if (here.length >= count) return;
    void write([...here, { mapId: boardId, x, y }]);
  };

  const placed = spots.length;

  return (
    <Popover placement="bottom" isOpen={open} onOpenChange={setOpen} shouldFlip>
      <PopoverTrigger>
        <Button
          size="sm"
          variant={placed > 0 ? 'flat' : 'light'}
          className={
            placed > 0 ? 'text-gold-strong dark:text-gold' : 'text-ink-subtle'
          }
          startContent={<Glyph name="map" size={13} />}
        >
          {placed > 0 ? `${placed} of ${count} placed` : 'Place'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] border border-line bg-surface p-3">
        <div className="flex w-full flex-col gap-2">
          <p className="text-xs text-ink-muted">
            Where the {name} stand when this is dealt. Tap a tile; tap a spot to
            take it back.
          </p>
          {boards && boards.length > 0 ? (
            <Select
              size="sm"
              aria-label="Which board"
              selectedKeys={boardId ? [boardId] : []}
              onSelectionChange={keys => {
                const key = String(Array.from(keys)[0] ?? '');
                if (!key || key === boardId) return;
                setBoardId(key);
                // Another board is another plan for the room: start over.
                if (spots.length > 0) void write([]);
              }}
              classNames={{ trigger: 'h-9 min-h-9' }}
            >
              {boards.map(b => (
                <SelectItem key={b.id} textValue={b.name || 'The sand table'}>
                  {b.name || 'The sand table'}
                  {b.isActive ? ' · on the table' : ''}
                </SelectItem>
              ))}
            </Select>
          ) : boards ? (
            <p className="text-sm text-ink-muted">
              No board yet. Lay one out on the Board tab, then place them.
            </p>
          ) : (
            <p className="text-xs text-ink-subtle">Finding the boards…</p>
          )}
          {board && (
            <MiniBoard
              terrain={board.terrain}
              taken={board.taken}
              spots={here}
              onTap={tap}
            />
          )}
          <Marginalia dash>
            {here.length >= count
              ? 'all placed — the rest is the deal'
              : `${count - here.length} still to place; unplaced ones are dealt in from the edge`}
          </Marginalia>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The board, small: a swatch per tile, a dot where something already
 * stands, a numbered mark where a copy will. Drawn on a canvas so a 60×60
 * board is one element, not 3,600.
 */
function MiniBoard({
  terrain,
  taken,
  spots,
  onTap,
}: {
  terrain: TerrainDoc;
  taken: { x: number; y: number; footprint: number }[];
  spots: PlanSpot[];
  onTap: (x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const size = useMemo(
    () =>
      Math.max(
        6,
        Math.min(14, Math.floor(320 / Math.max(terrain.w, terrain.h)))
      ),
    [terrain.w, terrain.h]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = size * terrain.w;
    const H = size * terrain.h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const gold = css.getPropertyValue('--gold').trim() || '#b4894a';
    const ink = css.getPropertyValue('--ink').trim() || '#2b2620';
    const line = css.getPropertyValue('--line').trim() || '#e4dccb';

    for (let y = 0; y < terrain.h; y++) {
      for (let x = 0; x < terrain.w; x++) {
        const i = y * terrain.w + x;
        const m = terrain.material[i] ?? VOID;
        if (m === VOID) continue;
        const mat = MATERIALS[m] ?? MATERIALS[VOID];
        ctx.fillStyle = dark ? mat.swatchDark : mat.swatch;
        ctx.fillRect(x * size, y * size, size, size);
      }
    }
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (let x = 0; x <= terrain.w; x++) {
      ctx.moveTo(x * size + 0.5, 0);
      ctx.lineTo(x * size + 0.5, H);
    }
    for (let y = 0; y <= terrain.h; y++) {
      ctx.moveTo(0, y * size + 0.5);
      ctx.lineTo(W, y * size + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.5;
    for (const t of taken) {
      const f = Math.max(1, t.footprint);
      ctx.beginPath();
      ctx.arc(
        (t.x + f / 2) * size,
        (t.y + f / 2) * size,
        Math.max(2, (size * f) / 3),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    spots.forEach((s, n) => {
      ctx.fillStyle = gold;
      ctx.fillRect(s.x * size + 1, s.y * size + 1, size - 2, size - 2);
      if (size >= 10) {
        ctx.fillStyle = dark ? '#16130f' : '#faf6ef';
        ctx.font = `700 ${Math.floor(size * 0.7)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          String(n + 1),
          (s.x + 0.5) * size,
          (s.y + 0.5) * size + 0.5
        );
      }
    });
  }, [terrain, taken, spots, size, dark]);

  return (
    <div className="max-h-72 overflow-auto rounded-md border border-line bg-bg p-1">
      <canvas
        ref={canvasRef}
        className="block cursor-crosshair"
        onPointerDown={ev => {
          const rect = ev.currentTarget.getBoundingClientRect();
          const x = Math.floor((ev.clientX - rect.left) / size);
          const y = Math.floor((ev.clientY - rect.top) / size);
          if (x < 0 || y < 0 || x >= terrain.w || y >= terrain.h) return;
          if ((terrain.material[y * terrain.w + x] ?? VOID) === VOID) return;
          onTap(x, y);
        }}
      />
    </div>
  );
}
