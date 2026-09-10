'use client';

import { Button, Select, SelectItem } from '@heroui/react';
import { useEffect, useState } from 'react';

import { listCampaignsAction } from '@/@creator/campaign/actions';
import { Marginalia } from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';

import { adoptAction, forkAction, unadoptAction } from '../actions';
import { isLiveLinked, type PublicationCard } from '../lib/publication';

/**
 * Taking something home.
 *
 * One component for both surfaces — the shelf card and the listing page —
 * because the rules about what a kind offers are the feature, and two copies of
 * them is two places to get the difference between *take* and *copy* wrong.
 *
 * - **Homebrew** offers both: take it as a link (theirs still, their fixes reach
 *   you) or copy it into your Forge (yours, and it stops tracking theirs).
 * - **A picture** offers only a copy, and needs to know which of your tables
 *   receives it. Images belong to campaigns in this app; there is no personal
 *   image shelf to default to.
 * - **A hero** offers one thing: adding it to your own heroes. That mints the
 *   sheet *and* the homebrew it references, with its refs rewritten to point at
 *   your copies.
 * - **A campaign** mints a table the reader is the DM of: the prep, and none of
 *   the people.
 * - **A bundle**, the one kind with no phase yet, says so plainly rather than
 *   offering a button that fails.
 */
export function AdoptControls({
  card,
  onDone,
  layout = 'row',
}: {
  card: PublicationCard;
  onDone: () => void;
  layout?: 'row' | 'column';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tables, setTables] = useState<CampaignRow[] | null>(null);
  const [target, setTarget] = useState('');

  const needsTable = card.kind === 'image';

  useEffect(() => {
    // Only the picture kind needs the list, and only while the reader could act
    // on it. Loading everybody's campaigns to draw a homebrew card would be a
    // query per shelf for nothing.
    if (!needsTable || card.mine || card.adopted !== null) return;
    let live = true;
    listCampaignsAction()
      .then(rows => {
        if (!live) return;
        const runs = rows.filter(c => c.isGM);
        setTables(runs);
        if (runs.length === 1) setTarget(runs[0].id);
      })
      .catch(() => setTables([]));
    return () => {
      live = false;
    };
  }, [needsTable, card.mine, card.adopted]);

  const run = async (
    action: () => Promise<{ ok: boolean; error?: string }>
  ) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    onDone();
  };

  if (card.mine) return null;

  const wrap =
    layout === 'column'
      ? 'flex flex-col gap-2'
      : 'flex flex-wrap items-center gap-2';

  if (card.adopted !== null) {
    return (
      <div className={wrap}>
        <Button
          size="sm"
          variant="light"
          isLoading={busy}
          onPress={() => run(() => unadoptAction(card.id))}
        >
          Put it back
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
        {card.adopted === 'linked' && (
          <Marginalia dash>
            theirs still — their corrections find you
          </Marginalia>
        )}
      </div>
    );
  }

  if (needsTable) {
    const runs = tables ?? [];
    if (tables !== null && runs.length === 0) {
      return (
        <p className="text-sm text-ink-subtle">
          Pictures land in a campaign you run, and you do not run one yet.
        </p>
      );
    }
    return (
      <div className={wrap}>
        <Select
          size="sm"
          className="max-w-[13rem]"
          aria-label="Which of your tables"
          isLoading={tables === null}
          selectedKeys={target ? [target] : []}
          onSelectionChange={keys =>
            setTarget(String(Array.from(keys)[0] ?? ''))
          }
        >
          {runs.map(table => (
            <SelectItem key={table.id} textValue={table.name}>
              {table.name}
            </SelectItem>
          ))}
        </Select>
        <Button
          size="sm"
          color="primary"
          isLoading={busy}
          isDisabled={!target}
          onPress={() => run(() => adoptAction(card.id, target))}
        >
          Copy it to my table
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  if (card.kind === 'campaign') {
    return (
      <div className={wrap}>
        <Button
          size="sm"
          color="primary"
          isLoading={busy}
          onPress={() => run(() => adoptAction(card.id))}
        >
          Run it at my table
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Marginalia dash>the prep, and none of their players</Marginalia>
      </div>
    );
  }

  if (card.kind === 'character') {
    return (
      <div className={wrap}>
        <Button
          size="sm"
          color="primary"
          isLoading={busy}
          onPress={() => run(() => adoptAction(card.id))}
        >
          Add to my heroes
        </Button>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Marginalia dash>the sheet, and whatever was forged for it</Marginalia>
      </div>
    );
  }

  if (!isLiveLinked(card.kind)) {
    return (
      <p className="text-sm text-ink-subtle">
        Taking a {card.kind} home is not built yet — the listing is here, the
        copying is not.
      </p>
    );
  }

  return (
    <div className={wrap}>
      <Button
        size="sm"
        color="primary"
        isLoading={busy}
        onPress={() => run(() => adoptAction(card.id))}
      >
        Take it
      </Button>
      <Button
        size="sm"
        variant="bordered"
        isDisabled={busy}
        onPress={() => run(() => forkAction(card.id))}
      >
        Copy it to my Forge
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
