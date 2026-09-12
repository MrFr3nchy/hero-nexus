'use client';

import {
  Button,
  Checkbox,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { useEffect, useState } from 'react';

import {
  applyLoadoutPatchAction,
  giveCoinAction,
  giveItemAction,
  type LoadoutPatchInput,
} from '@/@creator/campaign/play-actions';
import {
  Refused,
  type RefusedState,
} from '@/@creator/campaign/components/Refused';
import { Glyph, Pill, SectionCard } from '@/@shared/components/ui';
import type { Coins, CoinKey, PlayLoadout, Seat } from '@/server/play';

const COINS: CoinKey[] = ['pp', 'gp', 'ep', 'sp', 'cp'];

/** "12 gp · 3 sp", or nothing for an empty purse. */
function purseLine(coins: Coins): string {
  return COINS.filter(k => coins[k] > 0)
    .map(k => `${coins[k]} ${k}`)
    .join(' · ');
}

/**
 * Who a thing goes to, and the one press that moves it.
 *
 * Given, not offered — the table already has an accept/refuse flow, and it is
 * the person across from you saying no. One popover for both items and
 * coins: pick a seat, say how much, hand it over. The server moves it in one
 * write and writes both sheets' history; this only redraws.
 */
function GivePopover({
  label,
  others,
  disabled,
  children,
  onGive,
}: {
  label: string;
  others: Seat[];
  disabled: boolean;
  /** The amount controls, rendered inside the popover. */
  children?: React.ReactNode;
  onGive: (toCharacterId: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string>(others[0]?.characterId ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <Popover
      placement="bottom-end"
      isOpen={open}
      onOpenChange={setOpen}
      shouldCloseOnBlur
    >
      <PopoverTrigger>
        <Button
          size="sm"
          variant="light"
          className="h-6 min-w-0 px-1.5 text-xs text-ink-muted"
          isDisabled={disabled}
          aria-label={label}
        >
          Give
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 border border-line bg-surface p-3">
        <div className="flex w-full flex-col gap-2">
          <p className="text-xs text-ink-muted">{label}</p>
          <Select
            aria-label="To whom"
            size="sm"
            selectedKeys={to ? [to] : []}
            onSelectionChange={keys => {
              const key = Array.from(keys)[0];
              if (key) setTo(String(key));
            }}
          >
            {others.map(o => (
              <SelectItem key={o.characterId} textValue={o.name}>
                {o.name}
              </SelectItem>
            ))}
          </Select>
          {children}
          <Button
            size="sm"
            color="primary"
            isDisabled={!to || busy}
            isLoading={busy}
            onPress={async () => {
              setBusy(true);
              const ok = await onGive(to);
              setBusy(false);
              if (ok) setOpen(false);
            }}
          >
            Hand it over
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const ORDINAL = [
  'Cantrips',
  '1st level',
  '2nd level',
  '3rd level',
  '4th level',
  '5th level',
  '6th level',
  '7th level',
  '8th level',
  '9th level',
];

/**
 * What is in hand, and what is prepared today.
 *
 * Only toggles. Adding a longsword to your pack is a builder job — you do it
 * between sessions — while drawing the one you are already carrying is a table
 * job, and keeping the two apart is what makes this safe to hand somebody
 * mid-fight. The builder at `/creator/character` remains the one place rows
 * are created and deleted, so there is no second inventory editor to drift.
 *
 * Every toggle writes straight through, like the rest of play mode. There is
 * no save button at a table.
 */
export function LoadoutSection({
  initial,
  characterId,
  campaignId,
  onError,
  stacked = false,
}: {
  initial: PlayLoadout;
  characterId: string;
  campaignId: string | null;
  onError: (message: string) => void;
  /**
   * One column instead of two.
   *
   * Set by the table screen, where this sits in a box a third of the window
   * wide. `lg:` is a viewport breakpoint, not a container one, so a two-column
   * grid inside a narrow panel stays two columns and wraps "Longsword" across
   * two lines — the caller knows how much room it has and this does not.
   */
  stacked?: boolean;
}) {
  const [loadout, setLoadout] = useState(initial);
  // The caller re-reads when the sheet moves under this — a gift arriving
  // from across the table — and the newer read wins. Synced rather than keyed
  // so an open popover survives it.
  useEffect(() => setLoadout(initial), [initial]);
  const [busy, setBusy] = useState(false);
  const locked = !loadout.canEdit || busy;
  // How many of a stack to give, per row, while its popover is open.
  const [giving, setGiving] = useState<Record<string, string>>({});
  const [coins, setCoins] = useState<Partial<Record<CoinKey, string>>>({});

  // A gift is a table verb: it needs a table and somebody else seated at it.
  const canGive =
    campaignId !== null && loadout.canEdit && loadout.others.length > 0;

  const give = async (input: unknown): Promise<boolean> => {
    if (!campaignId) return false;
    setBusy(true);
    const res = await giveItemAction(characterId, campaignId, input);
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return false;
    }
    setLoadout(res.data);
    return true;
  };

  const giveCoins = async (toCharacterId: string): Promise<boolean> => {
    if (!campaignId) return false;
    const amounts: Partial<Coins> = {};
    for (const k of COINS) {
      const n = Number(coins[k] ?? 0);
      if (Number.isFinite(n) && n > 0) amounts[k] = Math.trunc(n);
    }
    setBusy(true);
    const res = await giveCoinAction(characterId, campaignId, {
      toCharacterId,
      coins: amounts,
    });
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return false;
    }
    setLoadout(res.data);
    setCoins({});
    return true;
  };

  // A refusal the rules made, shown beside the rows it refused. The server
  // says whether this caller may rule past it; the button appears only then.
  const [refused, setRefused] = useState<RefusedState | null>(null);

  const patch = async (input: LoadoutPatchInput) => {
    setBusy(true);
    const res = await applyLoadoutPatchAction(characterId, campaignId, input);
    setBusy(false);
    if (!res.ok) {
      if (res.overridable) {
        setRefused({
          message: res.error,
          ruling: () => patch({ ...input, ruling: true }),
        });
      } else {
        onError(res.error);
      }
      return;
    }
    setRefused(null);
    setLoadout(res.data);
  };

  const atCap = loadout.attunedCount >= loadout.maxAttuned;
  // Over the cap is a fence only where the table enforces; elsewhere the
  // control says what the rules say and lets the box be ticked.
  const capHolds = atCap && loadout.attunementEnforced;

  // Cantrips and always-prepared spells are never a decision, so they are
  // counted apart from the ones a player actually picks each morning.
  const choosable = loadout.spells.filter(s => !s.alwaysPrepared);
  const preparedCount = choosable.filter(s => s.prepared).length;

  const byLevel = [...loadout.spells]
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .reduce<Map<number, typeof loadout.spells>>((map, spell) => {
      const list = map.get(spell.level) ?? [];
      list.push(spell);
      map.set(spell.level, list);
      return map;
    }, new Map());

  return (
    <div className={stacked ? 'space-y-5' : 'grid gap-5 lg:grid-cols-2'}>
      <SectionCard
        title="What you are carrying"
        description="Tick what is in hand. Worn armour and a held shield move your armour class."
        actions={
          <Pill
            tone={
              loadout.attunedCount > loadout.maxAttuned
                ? 'danger'
                : atCap
                  ? 'warning'
                  : 'default'
            }
          >
            {loadout.attunedCount}/{loadout.maxAttuned} attuned
          </Pill>
        }
      >
        {refused && (
          <div className="mb-3">
            <Refused refusal={refused} onDismiss={() => setRefused(null)} />
          </div>
        )}
        {loadout.items.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing in your pack yet. Rows are added in the builder — this is
            where you decide what is in hand.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {loadout.items.map(item => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface px-3 py-2"
              >
                <span className="tabular-nums text-ink-subtle">
                  {item.quantity}&times;
                </span>
                <span className="min-w-0 flex-1 text-ink">{item.name}</span>

                <Checkbox
                  size="sm"
                  isSelected={item.equipped}
                  isDisabled={locked}
                  onValueChange={v =>
                    patch({ equip: { itemId: item.id, equipped: v } })
                  }
                >
                  <span className="text-sm text-ink-muted">Equipped</span>
                </Checkbox>

                {/*
                  Only offered where the content says attunement is required —
                  a tick box on a coil of rope is a question with one answer —
                  or where the row is *already* attuned. Without that second
                  case a sheet that got attuned to something that does not
                  require it (an older sheet, or an item whose stats later
                  changed) has no control to undo it, and silently spends one
                  of three slots forever.
                */}
                {(item.requiresAttunement || item.attuned) && (
                  <Tooltip
                    content={
                      capHolds && !item.attuned
                        ? 'You are already attuned to three items. This table enforces the cap.'
                        : atCap && !item.attuned
                          ? 'The rules allow three attuned items. This would be one more; the table is advising, not refusing.'
                          : 'This item does nothing until you attune to it.'
                    }
                  >
                    <span>
                      <Checkbox
                        size="sm"
                        isSelected={item.attuned}
                        isDisabled={locked || (capHolds && !item.attuned)}
                        onValueChange={v =>
                          patch({ attune: { itemId: item.id, attuned: v } })
                        }
                      >
                        <span className="text-sm text-ink-muted">Attuned</span>
                      </Checkbox>
                    </span>
                  </Tooltip>
                )}

                {/* Attunement is a bond with the owner and does not travel:
                    an attuned row has no Give, and says why on hover. */}
                {canGive &&
                  (item.attuned ? (
                    <Tooltip content="Break the attunement first, then give it.">
                      <span className="text-xs text-ink-subtle">Bound</span>
                    </Tooltip>
                  ) : (
                    <GivePopover
                      label={`Give ${item.name}`}
                      others={loadout.others}
                      disabled={locked || item.quantity === 0}
                      onGive={to =>
                        give({
                          itemId: item.id,
                          toCharacterId: to,
                          quantity:
                            item.quantity > 1
                              ? Math.max(
                                  1,
                                  Math.min(
                                    item.quantity,
                                    Math.trunc(Number(giving[item.id])) ||
                                      item.quantity
                                  )
                                )
                              : undefined,
                        })
                      }
                    >
                      {item.quantity > 1 && (
                        <Input
                          size="sm"
                          type="number"
                          label="How many"
                          min={1}
                          max={item.quantity}
                          value={giving[item.id] ?? String(item.quantity)}
                          onValueChange={v =>
                            setGiving(prev => ({ ...prev, [item.id]: v }))
                          }
                        />
                      )}
                    </GivePopover>
                  ))}
              </li>
            ))}
          </ul>
        )}

        {/* The purse. Coins move the same way an item does; each denomination
            on its own, because the app cannot know what this table thinks an
            electrum piece is worth. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
          <Glyph name="coins" size={13} className="text-gold" />
          <span className="min-w-0 flex-1 text-sm tabular-nums text-ink">
            {purseLine(loadout.currency) || (
              <span className="text-ink-subtle">An empty purse</span>
            )}
          </span>
          {canGive && purseLine(loadout.currency) && (
            <GivePopover
              label="Give coins"
              others={loadout.others}
              disabled={locked}
              onGive={giveCoins}
            >
              <div className="grid grid-cols-2 gap-1.5">
                {COINS.filter(k => loadout.currency[k] > 0).map(k => (
                  <Input
                    key={k}
                    size="sm"
                    type="number"
                    label={`${k} (of ${loadout.currency[k]})`}
                    min={0}
                    max={loadout.currency[k]}
                    value={coins[k] ?? ''}
                    onValueChange={v => setCoins(prev => ({ ...prev, [k]: v }))}
                  />
                ))}
              </div>
            </GivePopover>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Prepared today"
        description="What you have in mind this morning. Cantrips are always ready."
        actions={
          choosable.length > 0 ? (
            <Pill tone="arcane">
              {preparedCount}/{choosable.length} prepared
            </Pill>
          ) : undefined
        }
      >
        {loadout.spells.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No spells on this sheet. Add them in the builder and they will be
            here to prepare.
          </p>
        ) : (
          <div className="space-y-3">
            {[...byLevel.entries()].map(([level, list]) => (
              <div key={level}>
                <h4 className="mb-1 font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-arcane">
                  {ORDINAL[level] ?? 'Unavailable'}
                </h4>
                <ul className="space-y-1">
                  {list.map(spell => (
                    <li
                      key={spell.key}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface px-3 py-1.5"
                    >
                      <Glyph name="orb" size={13} className="text-gold" />
                      <span className="min-w-0 flex-1 text-sm text-ink">
                        {spell.name}
                      </span>
                      {spell.alwaysPrepared ? (
                        <Pill tone="gold">Always</Pill>
                      ) : (
                        <Checkbox
                          size="sm"
                          isSelected={spell.prepared}
                          isDisabled={locked}
                          onValueChange={v =>
                            patch({
                              prepare: { key: spell.key, prepared: v },
                            })
                          }
                        >
                          <span className="text-sm text-ink-muted">
                            Prepared
                          </span>
                        </Checkbox>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
