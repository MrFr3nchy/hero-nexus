'use client';

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Switch,
  Tooltip,
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cpWords, purseInCp } from '@/@creator/character/lib/coins';
import { contentChips } from '@/@shared/content';
import {
  EmptyState,
  Glyph,
  HoardScene,
  Marginalia,
} from '@/@shared/components/ui';
import type { DowntimePeriodRow } from '@/@creator/campaign/lib/downtime';
import type { SellQuote, ShopRow } from '@/server/shops';
import type { LiveState } from '@/server/session';
import { listDowntimeAction } from '../../downtime-actions';
import { getPlayLoadoutAction } from '../../play-actions';
import {
  addStockAction,
  buyAction,
  createShopAction,
  deleteShopAction,
  listShopItemChoicesAction,
  listShopsAction,
  removeStockAction,
  sellAction,
  sellQuotesAction,
  stockBasicsAction,
  updateShopAction,
  updateStockAction,
  type ShopItemChoice,
} from '../../shop-actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/**
 * The shop.
 *
 * A merchant panel: what is on the shelf, what it costs, what they will pay.
 * A player buys with their seated hero's purse and sells out of their pack;
 * the coin and the row move on the server in one transaction and one
 * history line says so. The DM opens shops, stocks them from the compendium
 * and this table's library, sets the markup, and shows a shop to the party
 * when the party has found it. With an open downtime period, a trade can be
 * logged as the shopping it was.
 */
export function ShopPanel({
  campaignId,
  state,
  isStaff,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  onError: (message: string) => void;
}) {
  const [shops, setShops] = useState<ShopRow[] | null>(null);
  const [newName, setNewName] = useState('');
  // Whose purse. A player's is their seated hero; the DM picks from the party.
  const [characterId, setCharacterId] = useState<string | null>(
    state.viewerCharacterId
  );
  const [purse, setPurse] = useState<number | null>(null);
  const [period, setPeriod] = useState<DowntimePeriodRow | null>(null);
  const [logIt, setLogIt] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!characterId && state.viewerCharacterId) {
      setCharacterId(state.viewerCharacterId);
    }
  }, [state.viewerCharacterId, characterId]);

  const load = useCallback(async () => {
    setShops(await listShopsAction(campaignId));
  }, [campaignId]);
  // Re-read whenever the table's state moves: a DM restocking, a fellow
  // player emptying a shelf.
  useEffect(() => {
    void load();
  }, [load, state]);

  const loadPurse = useCallback(async () => {
    if (!characterId) {
      setPurse(null);
      return;
    }
    const loadout = await getPlayLoadoutAction(characterId, campaignId);
    setPurse(loadout ? purseInCp(loadout.currency) : null);
  }, [characterId, campaignId]);
  useEffect(() => {
    void loadPurse();
  }, [loadPurse, state]);

  useEffect(() => {
    listDowntimeAction(campaignId)
      .then(periods =>
        setPeriod(periods.find(p => p.status === 'open') ?? null)
      )
      .catch(() => setPeriod(null));
  }, [campaignId]);

  const act: Act = async p => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'That did not take.');
    await load();
  };

  const party = state.party;
  const periodId = logIt && period ? period.id : null;

  if (shops === null) {
    return <p className="text-sm text-ink-subtle">Opening the shutters…</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      {/* Whose purse, and how full. The DM picks; a player is their hero. */}
      <div className="flex flex-wrap items-center gap-2">
        {isStaff ? (
          <Select
            size="sm"
            aria-label="Whose purse"
            className="w-44"
            classNames={{ trigger: 'h-8 min-h-8' }}
            placeholder="Whose purse"
            selectedKeys={characterId ? [characterId] : []}
            onSelectionChange={keys => {
              const key = Array.from(keys)[0];
              setCharacterId(key ? String(key) : null);
            }}
          >
            {party.map(p => (
              <SelectItem key={p.characterId} textValue={p.name}>
                {p.name}
              </SelectItem>
            ))}
          </Select>
        ) : (
          characterId && (
            <span className="text-ink">
              {party.find(p => p.characterId === characterId)?.name ?? 'You'}
            </span>
          )
        )}
        {purse !== null && (
          <span className="tabular-nums text-ink-muted">
            <Glyph name="coins" size={13} className="mr-1 inline text-gold" />
            {cpWords(purse)}
          </span>
        )}
        {!characterId && !isStaff && (
          <span className="text-ink-subtle">
            Take a seat with a hero to buy anything.
          </span>
        )}
        {period && (
          <Switch
            size="sm"
            isSelected={logIt}
            onValueChange={setLogIt}
            className="ml-auto"
          >
            <span className="text-xs text-ink-muted">
              Log it under {period.label || 'downtime'}
            </span>
          </Switch>
        )}
      </div>

      {notice && (
        <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-success">
          {notice}
        </p>
      )}

      {shops.length === 0 && (
        <EmptyState
          scene={<HoardScene />}
          title={isStaff ? 'No shop open yet' : 'No merchant in sight'}
          description={
            isStaff
              ? 'Open one, stock its shelves, and show it to the party when they walk in.'
              : 'When the party finds a merchant, their wares appear here.'
          }
        />
      )}

      {shops.map(shop => (
        <Shop
          key={shop.id}
          campaignId={campaignId}
          shop={shop}
          isStaff={isStaff}
          characterId={characterId}
          periodId={periodId}
          act={act}
          onTrade={line => {
            setNotice(line);
            void loadPurse();
          }}
          onError={onError}
        />
      ))}

      {isStaff && (
        <form
          className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
          onSubmit={async e => {
            e.preventDefault();
            if (!newName.trim()) return;
            await act(createShopAction(campaignId, { name: newName.trim() }));
            setNewName('');
          }}
        >
          <Input
            size="sm"
            label="Open a shop"
            placeholder="The Gilded Mortar"
            value={newName}
            onValueChange={setNewName}
            className="min-w-48 flex-1"
          />
          <Button
            size="sm"
            color="primary"
            type="submit"
            isDisabled={!newName.trim()}
          >
            Open it
          </Button>
        </form>
      )}
    </div>
  );
}

/* --- one shop ------------------------------------------------------------ */

function Shop({
  campaignId,
  shop,
  isStaff,
  characterId,
  periodId,
  act,
  onTrade,
  onError,
}: {
  campaignId: string;
  shop: ShopRow;
  isStaff: boolean;
  characterId: string | null;
  periodId: string | null;
  act: Act;
  onTrade: (line: string) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? shop.stock.filter(r => r.name.toLowerCase().includes(needle))
    : shop.stock;

  const buyOne = async (stockId: string) => {
    if (!characterId) return;
    setBusy(true);
    const res = await buyAction(
      shop.id,
      stockId,
      characterId,
      qty[stockId] ?? 1,
      periodId
    );
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    onTrade(res.data.line);
    await act(Promise.resolve({ ok: true }));
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Glyph name="coins" size={14} className="text-gold" />
        <span className="font-display text-base text-ink">
          {shop.name || 'The shop'}
        </span>
        {shop.markupPercent !== 0 && (
          <span className="text-xs text-ink-subtle">
            {shop.markupPercent > 0 ? '+' : ''}
            {shop.markupPercent}% on the book
          </span>
        )}
        {isStaff && (
          <Tooltip
            content={
              shop.visibility === 'shared'
                ? 'The party can see this shop. Tap to hide it.'
                : 'Only you can see this shop. Tap to show the party.'
            }
          >
            <button
              type="button"
              onClick={() =>
                act(
                  updateShopAction(shop.id, {
                    visibility: shop.visibility === 'shared' ? 'dm' : 'shared',
                  })
                )
              }
              className={`rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] ${
                shop.visibility === 'shared'
                  ? 'border-success/50 text-success'
                  : 'border-line text-ink-subtle'
              }`}
            >
              {shop.visibility === 'shared' ? 'Open to the party' : 'Hidden'}
            </button>
          </Tooltip>
        )}
        <span className="ml-auto flex gap-1">
          {characterId && (
            <Button
              size="sm"
              variant={selling ? 'flat' : 'light'}
              className="h-7 min-w-0 px-2 text-xs text-ink-muted"
              onPress={() => setSelling(s => !s)}
            >
              Sell
            </Button>
          )}
          {isStaff && (
            <Button
              size="sm"
              variant={editing ? 'flat' : 'light'}
              className="h-7 min-w-0 px-2 text-xs text-ink-muted"
              onPress={() => setEditing(e => !e)}
            >
              {editing ? 'Done' : 'Stock it'}
            </Button>
          )}
        </span>
      </header>

      {shop.blurb && <p className="px-3 pt-2 text-ink-muted">{shop.blurb}</p>}

      {editing && isStaff && (
        <ShopEditor campaignId={campaignId} shop={shop} act={act} />
      )}

      {/* The shelf. A long one gets a filter, so "the rope" is one word away. */}
      {shop.stock.length > 8 && (
        <div className="px-3 pt-2">
          <Input
            size="sm"
            aria-label="Find on the shelf"
            placeholder="Find on the shelf…"
            value={filter}
            onValueChange={setFilter}
            isClearable
            onClear={() => setFilter('')}
            startContent={
              <Glyph name="magnifier" size={13} className="text-ink-subtle" />
            }
          />
        </div>
      )}
      {shop.stock.length === 0 ? (
        <p className="px-3 py-3 text-ink-subtle">
          {isStaff
            ? 'Bare shelves. Stock it above.'
            : 'The shelves are bare today.'}
        </p>
      ) : shown.length === 0 ? (
        <p className="px-3 py-3 text-ink-subtle">
          Nothing on the shelf by that name.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map(row => {
            const out = row.quantity !== null && row.quantity <= 0;
            const chips = row.entry ? contentChips(row.entry).slice(0, 3) : [];
            const left =
              row.quantity === null
                ? 'plenty'
                : out
                  ? 'sold out'
                  : `${row.quantity} left`;
            return (
              <li key={row.id} className="px-3 py-2">
                {/* Name and price on one line; what it is, how many, and the
                    buying on the next — so the shelf reads at any width. */}
                <div className="flex items-baseline justify-between gap-x-3">
                  <p className={`min-w-0 text-ink ${out ? 'opacity-60' : ''}`}>
                    {row.name}
                    {!row.entry && (
                      <span className="ml-1.5 rounded-sm border border-danger/40 px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-danger">
                        Unavailable
                      </span>
                    )}
                  </p>
                  <span className="shrink-0 tabular-nums text-ink">
                    {cpWords(row.priceCp)}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-xs text-ink-subtle">
                    {chips.join(' · ')}
                  </p>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs tabular-nums text-ink-subtle">
                      {left}
                    </span>
                    {editing && isStaff ? (
                      <StockEditor row={row} act={act} />
                    ) : (
                      characterId &&
                      row.entry &&
                      !out && (
                        <span className="flex items-center gap-1">
                          <NumberInput
                            size="sm"
                            aria-label="How many"
                            className="w-16"
                            minValue={1}
                            maxValue={row.quantity ?? 99}
                            value={qty[row.id] ?? 1}
                            onValueChange={v =>
                              setQty(q => ({ ...q, [row.id]: Number(v) || 1 }))
                            }
                          />
                          <Button
                            size="sm"
                            color="primary"
                            className="h-8 min-w-0 px-2.5 text-xs"
                            isDisabled={busy}
                            onPress={() => buyOne(row.id)}
                          >
                            Buy
                          </Button>
                        </span>
                      )
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {selling && characterId && (
        <SellList
          shop={shop}
          characterId={characterId}
          periodId={periodId}
          onTrade={line => {
            onTrade(line);
            void act(Promise.resolve({ ok: true }));
          }}
          onError={onError}
        />
      )}
    </section>
  );
}

/* --- the DM's shelf -------------------------------------------------- */

function ShopEditor({
  campaignId,
  shop,
  act,
}: {
  campaignId: string;
  shop: ShopRow;
  act: Act;
}) {
  const [name, setName] = useState(shop.name);
  const [blurb, setBlurb] = useState(shop.blurb);
  const [markup, setMarkup] = useState(shop.markupPercent);
  const [buysAt, setBuysAt] = useState(shop.buysAtPercent);
  const [choices, setChoices] = useState<ShopItemChoice[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listShopItemChoicesAction(campaignId).then(setChoices);
  }, [campaignId]);

  const chosen = useMemo(
    () => choices?.find(c => `${c.source}:${c.key}` === picked) ?? null,
    [choices, picked]
  );
  const dirty =
    name !== shop.name ||
    blurb !== shop.blurb ||
    markup !== shop.markupPercent ||
    buysAt !== shop.buysAtPercent;

  return (
    <div className="space-y-3 border-b border-line bg-surface-2/40 px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input size="sm" label="Name" value={name} onValueChange={setName} />
        <Input
          size="sm"
          label="A line about it"
          value={blurb}
          onValueChange={setBlurb}
          placeholder="Smells of camphor. The owner never blinks."
        />
        <NumberInput
          size="sm"
          label="Markup on the book price, %"
          minValue={-90}
          maxValue={500}
          value={markup}
          onValueChange={v => setMarkup(Number(v) || 0)}
        />
        <NumberInput
          size="sm"
          label="Pays for the party's things, % of book"
          minValue={0}
          maxValue={200}
          value={buysAt}
          onValueChange={v => setBuysAt(Number(v) || 0)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          color="primary"
          isDisabled={!dirty}
          onPress={() =>
            act(
              updateShopAction(shop.id, {
                name,
                blurb,
                markupPercent: markup,
                buysAtPercent: buysAt,
              })
            )
          }
        >
          Save the shop
        </Button>
        <Tooltip content="Every priced weapon, armour, gear and common consumable in the SRD, on unlimited shelves at the book price.">
          <Button
            size="sm"
            variant="flat"
            isDisabled={busy}
            onPress={async () => {
              setBusy(true);
              await act(stockBasicsAction(shop.id));
              setBusy(false);
            }}
          >
            Stock the basics
          </Button>
        </Tooltip>
        <Button
          size="sm"
          variant="light"
          className="ml-auto text-ink-subtle data-[hover=true]:text-danger"
          onPress={() => act(deleteShopAction(shop.id))}
        >
          Close the shop
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Autocomplete
          size="sm"
          label="Put something on the shelf"
          placeholder={
            choices ? 'Potion of Healing' : 'Reading the compendium…'
          }
          isDisabled={!choices}
          className="min-w-52 flex-1"
          defaultItems={choices ?? []}
          selectedKey={picked}
          onSelectionChange={key => setPicked(key ? String(key) : null)}
        >
          {choice => (
            <AutocompleteItem
              key={`${choice.source}:${choice.key}`}
              textValue={choice.name}
            >
              <span className="flex items-baseline gap-2">
                <span>{choice.name}</span>
                <span className="text-xs text-ink-subtle">
                  {choice.kind}
                  {choice.costCp > 0 ? ` · ${cpWords(choice.costCp)}` : ''}
                  {choice.source === 'homebrew' ? ' · homebrew' : ''}
                </span>
              </span>
            </AutocompleteItem>
          )}
        </Autocomplete>
        <Input
          size="sm"
          type="number"
          label="Price, gp"
          placeholder={
            chosen
              ? cpWords(Math.round(chosen.costCp * (1 + markup / 100)))
              : 'book'
          }
          className="w-28"
          value={price}
          onValueChange={setPrice}
        />
        <Input
          size="sm"
          type="number"
          label="How many"
          placeholder="plenty"
          className="w-24"
          value={count}
          onValueChange={setCount}
        />
        <Button
          size="sm"
          variant="flat"
          isDisabled={!chosen}
          onPress={async () => {
            if (!chosen) return;
            await act(
              addStockAction(shop.id, {
                ref: { source: chosen.source, type: 'item', key: chosen.key },
                priceCp:
                  price.trim() === '' ? null : Math.round(Number(price) * 100),
                quantity:
                  count.trim() === '' ? null : Math.trunc(Number(count)),
              })
            );
            setPicked(null);
            setPrice('');
            setCount('');
          }}
        >
          Shelve it
        </Button>
      </div>
      <Marginalia dash>
        a homebrew item has to be in play at this table before it can be sold
        here
      </Marginalia>
    </div>
  );
}

function StockEditor({
  row,
  act,
}: {
  row: ShopRow['stock'][number];
  act: Act;
}) {
  return (
    <span className="flex items-center gap-1">
      <Input
        size="sm"
        type="number"
        aria-label="Price in gold"
        placeholder="book"
        className="w-24"
        defaultValue={String(row.priceCp / 100)}
        onBlur={e => {
          const v = e.target.value.trim();
          void act(
            updateStockAction(row.id, {
              priceCp: v === '' ? null : Math.round(Number(v) * 100),
            })
          );
        }}
      />
      <Input
        size="sm"
        type="number"
        aria-label="How many"
        placeholder="plenty"
        className="w-20"
        defaultValue={row.quantity === null ? '' : String(row.quantity)}
        onBlur={e => {
          const v = e.target.value.trim();
          void act(
            updateStockAction(row.id, {
              quantity: v === '' ? null : Math.trunc(Number(v)),
            })
          );
        }}
      />
      <button
        type="button"
        aria-label={`Take ${row.name} off the shelf`}
        onClick={() => act(removeStockAction(row.id))}
        className="px-1 text-ink-subtle hover:text-danger"
      >
        <Glyph name="x" size={12} />
      </button>
    </span>
  );
}

/* --- selling ---------------------------------------------------------- */

function SellList({
  shop,
  characterId,
  periodId,
  onTrade,
  onError,
}: {
  shop: ShopRow;
  characterId: string;
  periodId: string | null;
  onTrade: (line: string) => void;
  onError: (message: string) => void;
}) {
  const [quotes, setQuotes] = useState<SellQuote[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setQuotes(await sellQuotesAction(shop.id, characterId));
  }, [shop.id, characterId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (quotes === null) {
    return (
      <p className="px-3 py-2 text-xs text-ink-subtle">Emptying the pack…</p>
    );
  }
  const sellable = quotes.filter(q => q.eachCp > 0);
  return (
    <div className="border-t border-line px-3 py-2">
      <p className="text-xs text-ink-subtle">
        {shop.name || 'The shop'} pays {shop.buysAtPercent}% of the book price.
      </p>
      {sellable.length === 0 ? (
        <p className="py-1 text-ink-muted">
          Nothing in the pack they would pay for.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {sellable.map(q => (
            <li
              key={q.itemId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
            >
              <span className="min-w-0 flex-1 text-ink">
                {q.name}
                {q.quantity > 1 && (
                  <span className="text-ink-subtle"> ×{q.quantity}</span>
                )}
              </span>
              <span className="tabular-nums text-ink-muted">
                {cpWords(q.eachCp)}
              </span>
              <Tooltip
                content={
                  q.attuned
                    ? 'Break the attunement first.'
                    : `Sell one for ${cpWords(q.eachCp)}`
                }
              >
                <Button
                  size="sm"
                  variant="flat"
                  className="h-7 min-w-0 px-2 text-xs"
                  isDisabled={busy || q.attuned}
                  onPress={async () => {
                    setBusy(true);
                    const res = await sellAction(
                      shop.id,
                      characterId,
                      q.itemId,
                      1,
                      periodId
                    );
                    setBusy(false);
                    if (!res.ok) {
                      onError(res.error);
                      return;
                    }
                    onTrade(res.data.line);
                    await load();
                  }}
                >
                  Sell one
                </Button>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
