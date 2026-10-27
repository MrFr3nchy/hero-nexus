'use client';

import { Button, Select, SelectItem } from '@heroui/react';
import { useEffect, useState } from 'react';

import {
  draftPlacementAction,
  getAiSettingsAction,
} from '@/@creator/ai/actions';
import { DraftWithAi } from '@/@creator/ai/components';
import { ControlRow } from '@/@shared/components/ui';
import type { PlacementDraft } from '@/server/ai/drafts';

import {
  getBoardTerrainAction,
  listBattleMapsAction,
} from '../battlemap-actions';
import { setPlanLineSpotsAction } from '../encounter-actions';

type BoardChoice = Awaited<ReturnType<typeof listBattleMapsAction>>[number];

/**
 * A planned fight's creatures set out on a battle board by the DM's AI.
 *
 * What comes back is a proposal of tiles per line, already checked against
 * the floor on the server. Keeping it writes each line's spots through
 * `setPlanLineSpotsAction` — the same call a tap on the board makes — so
 * the planner's own map shows them, and moves them, afterwards.
 */
export function PlaceWithAi({
  campaignId,
  planId,
  onKept,
  onError,
}: {
  campaignId: string;
  planId: string;
  onKept: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [boards, setBoards] = useState<BoardChoice[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [floors, setFloors] = useState<{ id: string; name: string }[]>([]);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PlacementDraft | null>(null);
  const [keeping, setKeeping] = useState(false);

  useEffect(() => {
    getAiSettingsAction().then(res => {
      if (!res.ok || !res.data.available || !res.data.runsATable) return;
      if (!res.data.key) return;
      setReady(true);
      listBattleMapsAction(campaignId).then(list => {
        setBoards(list);
        setBoardId(list.find(b => b.isActive)?.id ?? list[0]?.id ?? null);
      });
    });
  }, [campaignId]);

  useEffect(() => {
    setFloors([]);
    setFloorId(null);
    if (!boardId) return;
    getBoardTerrainAction(boardId).then(board => {
      const levels = board?.terrain.levels ?? [];
      setFloors(levels.map(l => ({ id: l.id, name: l.name })));
      setFloorId(levels[0]?.id ?? null);
    });
  }, [boardId]);

  if (!ready || !boards) return null;

  if (boards.length === 0) {
    return (
      <p className="text-xs text-ink-subtle">
        Lay out a battle board in the workshop, and the AI can set this fight
        out on it.
      </p>
    );
  }

  const keep = async () => {
    if (!proposal) return;
    setKeeping(true);
    try {
      for (const line of proposal.lines) {
        if (line.spots.length === 0) continue;
        const res = await setPlanLineSpotsAction(line.lineId, line.spots);
        if (!res.ok) onError(res.error);
      }
      setProposal(null);
      await onKept();
    } finally {
      setKeeping(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ControlRow size="sm" align="end">
        <Select
          label="On the board"
          labelPlacement="outside"
          className="min-w-44 flex-1"
          selectedKeys={boardId ? [boardId] : []}
          onSelectionChange={keys => {
            const key = Array.from(keys)[0];
            setBoardId(key ? String(key) : null);
            setProposal(null);
          }}
        >
          {boards.map(b => (
            <SelectItem key={b.id} textValue={b.name}>
              {b.name}
              {b.isActive && (
                <span className="ml-2 text-xs text-ink-subtle">in play</span>
              )}
            </SelectItem>
          ))}
        </Select>
        {floors.length > 1 && (
          <Select
            label="Floor"
            labelPlacement="outside"
            className="min-w-32"
            selectedKeys={floorId ? [floorId] : []}
            onSelectionChange={keys => {
              const key = Array.from(keys)[0];
              setFloorId(key ? String(key) : null);
              setProposal(null);
            }}
          >
            {floors.map(f => (
              <SelectItem key={f.id}>{f.name}</SelectItem>
            ))}
          </Select>
        )}
      </ControlRow>

      <DraftWithAi
        label="Set them out with AI"
        placeholder="Archers up on the crane platform, the captain by the gangway, the hag under the pier…"
        onDraft={async prompt => {
          if (!boardId) return 'Pick a board first.';
          const res = await draftPlacementAction(
            planId,
            boardId,
            floorId,
            prompt
          );
          if (!res.ok) return res.error;
          setProposal(res.data);
          return null;
        }}
      />

      {proposal && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3 text-sm">
          <ul className="flex flex-col gap-1">
            {proposal.lines.map(line => (
              <li key={line.lineId} className="flex gap-3">
                <span className="flex-1 text-ink">{line.name}</span>
                <span className="tabular-nums text-ink-muted">
                  {line.spots.length} of {line.count} placed
                </span>
              </li>
            ))}
          </ul>
          {proposal.notes && <p className="text-ink-muted">{proposal.notes}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              color="primary"
              isLoading={keeping}
              onPress={keep}
            >
              Keep these spots
            </Button>
            <Button
              size="sm"
              variant="light"
              isDisabled={keeping}
              onPress={() => setProposal(null)}
            >
              Throw it out
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">
            Kept spots replace where these were placed before, and show on each
            line’s map, where you can move them.
          </p>
        </div>
      )}
    </div>
  );
}
