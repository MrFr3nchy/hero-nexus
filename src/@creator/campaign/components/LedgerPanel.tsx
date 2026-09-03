'use client';

import {
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Switch,
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiceSpinner,
  HoardScene,
  EmptyState,
  Marginalia,
  Pill,
  SectionCard,
} from '@/@shared/components/ui';
import type { LedgerState, LootKind } from '@/server/quests';
import {
  COIN_KEYS,
  COIN_LABELS,
  describeTreasury,
  splitTreasury,
  type Treasury,
} from '../lib/treasury';
import {
  addLootAction,
  adjustTreasuryAction,
  deleteLootAction,
  getLedgerAction,
  updateLootAction,
} from '../quest-actions';

const KINDS: { key: LootKind; label: string }[] = [
  { key: 'item', label: 'Gear' },
  { key: 'consumable', label: 'Consumable' },
  { key: 'treasure', label: 'Treasure' },
  { key: 'magic', label: 'Magic' },
];

const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k.key, k.label]));

/* --- the purse -------------------------------------------------------- */

/**
 * The common purse, and the split that ends the argument.
 *
 * The split is only ever shown, never applied: who actually takes what is a
 * conversation, and an app that silently empties the party's money because
 * someone pressed a button is not helping.
 */
function Purse({
  campaignId,
  treasury,
  partySize,
  onChange,
  onError,
}: {
  campaignId: string;
  treasury: Treasury;
  partySize: number;
  onChange: (next: Treasury) => void;
  onError: (message: string) => void;
}) {
  const [delta, setDelta] = useState<Partial<Treasury>>({});
  const [ways, setWays] = useState(Math.max(1, partySize));
  const [showSplit, setShowSplit] = useState(false);

  const split = useMemo(() => splitTreasury(treasury, ways), [treasury, ways]);

  const apply = async (sign: 1 | -1) => {
    const signed = Object.fromEntries(
      COIN_KEYS.map(key => [key, (delta[key] ?? 0) * sign])
    );
    const res = await adjustTreasuryAction(campaignId, signed);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setDelta({});
    onChange(res.data);
  };

  const anyDelta = COIN_KEYS.some(key => (delta[key] ?? 0) !== 0);

  return (
    <SectionCard
      title="The purse"
      description="Everyone at the table can bank and draw from this."
    >
      <div className="grid grid-cols-5 gap-2">
        {COIN_KEYS.map(key => (
          <div
            key={key}
            className="rounded-[var(--radius-card)] border border-line bg-surface-2 px-2 py-3 text-center"
          >
            <div className="text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle">
              {key}
            </div>
            <div
              className={`mt-0.5 font-display text-xl tabular-nums ${
                key === 'gp' || key === 'pp'
                  ? 'text-gold-strong dark:text-gold'
                  : 'text-ink'
              }`}
            >
              {treasury[key]}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="grid grid-cols-5 gap-2">
          {COIN_KEYS.map(key => (
            <NumberInput
              key={key}
              aria-label={COIN_LABELS[key]}
              size="sm"
              hideStepper
              minValue={0}
              placeholder="0"
              value={delta[key] ?? 0}
              onValueChange={v =>
                setDelta(d => ({ ...d, [key]: Number(v) || 0 }))
              }
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="flat"
            className="text-success"
            isDisabled={!anyDelta}
            onPress={() => apply(1)}
          >
            Bank it
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="text-danger"
            isDisabled={!anyDelta}
            onPress={() => apply(-1)}
          >
            Spend it
          </Button>
          <Button
            size="sm"
            variant="light"
            className="ml-auto text-ink-muted"
            onPress={() => setShowSplit(s => !s)}
          >
            {showSplit ? 'Hide the split' : 'Split it'}
          </Button>
        </div>
      </div>

      {showSplit && (
        <div className="mt-4 rounded-md border border-gold/40 bg-gold/[0.05] p-3">
          <div className="flex flex-wrap items-end gap-2">
            <NumberInput
              size="sm"
              label="Ways"
              minValue={1}
              maxValue={20}
              className="w-24"
              value={ways}
              onValueChange={v => setWays(Math.max(1, Number(v) || 1))}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink">
                Each gets{' '}
                <span className="font-display text-gold-strong dark:text-gold">
                  {describeTreasury(split.share)}
                </span>
              </p>
              <p className="text-xs text-ink-subtle">
                {describeTreasury(split.remainder) === 'nothing'
                  ? 'Nothing left over.'
                  : `${describeTreasury(split.remainder)} left over.`}
              </p>
            </div>
          </div>
          <Marginalia className="mt-2" dash>
            shown, not taken — sort it out among yourselves
          </Marginalia>
        </div>
      )}
    </SectionCard>
  );
}

/* --- the haul --------------------------------------------------------- */

export function LedgerPanel({
  campaignId,
  onError,
}: {
  campaignId: string;
  onError?: (message: string) => void;
}) {
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [kind, setKind] = useState<LootKind>('item');

  const report = useCallback(
    (message: string) => {
      setError(message);
      onError?.(message);
    },
    [onError]
  );

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setLedger(await getLedgerAction(campaignId));
    } catch {
      report('Failed to open the ledger.');
    }
  }, [campaignId, report]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) report(res.error ?? 'Something went wrong.');
    await refresh();
  };

  if (!ledger) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Counting the coin…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Purse
        campaignId={campaignId}
        treasury={ledger.treasury}
        partySize={Math.max(1, ledger.holders.length)}
        onChange={next => setLedger(l => (l ? { ...l, treasury: next } : l))}
        onError={report}
      />

      <SectionCard
        title="The haul"
        description="What the party is carrying, and who is carrying it."
      >
        <div className="mb-4 flex flex-wrap items-end gap-2 border-b border-line pb-4">
          <Input
            size="sm"
            label="Item"
            placeholder="Emberstep Boots"
            value={name}
            onValueChange={setName}
            className="min-w-40 flex-1"
          />
          <NumberInput
            size="sm"
            label="How many"
            minValue={1}
            className="w-28"
            value={quantity}
            onValueChange={v => setQuantity(Math.max(1, Number(v) || 1))}
          />
          <Select
            aria-label="Kind"
            size="sm"
            className="w-36"
            selectedKeys={[kind]}
            onSelectionChange={keys => {
              const key = Array.from(keys)[0];
              if (key) setKind(String(key) as LootKind);
            }}
          >
            {KINDS.map(k => (
              <SelectItem key={k.key} textValue={k.label}>
                {k.label}
              </SelectItem>
            ))}
          </Select>
          <Button
            size="sm"
            color="primary"
            isDisabled={!name.trim()}
            onPress={async () => {
              await act(addLootAction(campaignId, { name, quantity, kind }));
              setName('');
              setQuantity(1);
            }}
          >
            Add
          </Button>
        </div>

        {ledger.loot.length === 0 ? (
          <EmptyState
            scene={<HoardScene />}
            title="The chest is empty"
            description="Anyone at the table can write down what you found."
          />
        ) : (
          <ul className="divide-y divide-line">
            {ledger.loot.map(item => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5"
              >
                <span className="w-8 shrink-0 text-right font-display tabular-nums text-ink-muted">
                  {item.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                    {item.identified ? item.name : `${item.name} — unknown`}
                    <Pill tone={item.kind === 'magic' ? 'arcane' : 'default'}>
                      {KIND_LABEL[item.kind]}
                    </Pill>
                  </p>
                  {item.notes && (
                    <p className="text-xs text-ink-subtle">{item.notes}</p>
                  )}
                </div>

                <Select
                  aria-label={`Who has ${item.name}`}
                  size="sm"
                  className="w-40"
                  placeholder="Party pack"
                  selectedKeys={
                    item.holderCharacterId ? [item.holderCharacterId] : []
                  }
                  onSelectionChange={keys => {
                    const key = Array.from(keys)[0];
                    act(
                      updateLootAction(item.id, {
                        holderCharacterId: key ? String(key) : null,
                      })
                    );
                  }}
                >
                  {ledger.holders.map(h => (
                    <SelectItem key={h.characterId} textValue={h.name}>
                      {h.name}
                    </SelectItem>
                  ))}
                </Select>

                <Switch
                  size="sm"
                  isSelected={item.identified}
                  onValueChange={v =>
                    act(updateLootAction(item.id, { identified: v }))
                  }
                >
                  <span className="text-xs text-ink-muted">Known</span>
                </Switch>

                <Button
                  size="sm"
                  variant="light"
                  aria-label={`Remove ${item.name}`}
                  className="min-w-0 px-2 text-ink-subtle data-[hover=true]:text-danger"
                  onPress={() => act(deleteLootAction(item.id))}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
