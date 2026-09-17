'use client';

/**
 * The shelf: every board this campaign has built, and a new one. A
 * collection page — the boards are the objects, so they lead.
 */
import { Button, Input, Select, SelectItem } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MATERIALS, MAX_SIDE, MIN_SIDE, VOID } from '@/@shared/battlemap/types';
import {
  BattlefieldScene,
  EmptyState,
  Glyph,
  Marginalia,
  PageHeader,
  PageShell,
  Ribbon,
} from '@/@shared/components/ui';
import type { listBattleMaps } from '@/server/battlemap';
import { createBattleMapAction } from '../../battlemap-actions';

type BoardRow = Awaited<ReturnType<typeof listBattleMaps>>[number];

export function WorkshopShelf({
  campaignId,
  campaignName,
  boards,
}: {
  campaignId: string;
  campaignName: string;
  boards: BoardRow[];
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
    router.push(`/campaigns/${campaignId}/workshop/${res.data.id}`);
  };

  const form = (
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

  return (
    <PageShell>
      <PageHeader
        title="The workshop"
        description={`${campaignName} — the boards on the shelf, and a new one.`}
        rule={false}
        actions={
          <Link
            href={`/campaigns/${campaignId}/screen`}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
          >
            <Glyph name="back" size={14} />
            Back to the table
          </Link>
        }
      />
      {boards.length === 0 ? (
        <EmptyState
          scene={<BattlefieldScene />}
          title="No board on the shelf"
          description="Lay one out, then build the house on it."
          action={form}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="flex flex-wrap gap-3">
            {boards.map(b => (
              <li key={b.id}>
                <Link
                  href={`/campaigns/${campaignId}/workshop/${b.id}`}
                  className="flex w-56 flex-col gap-1 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-gold"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-lg">
                      {b.name || 'The sand table'}
                    </span>
                    {b.isActive && <Ribbon tone="gold">On the table</Ribbon>}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {b.w} × {b.h} · {b.levels}{' '}
                    {b.levels === 1 ? 'floor' : 'floors'}
                    {b.visibility === 'shared' ? ' · the party sees it' : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-xl">A new board</h2>
            {form}
            <Marginalia dash>
              a mansion is a few floors, stacked — start with the ground
            </Marginalia>
          </div>
        </div>
      )}
    </PageShell>
  );
}
