'use server';

import { z } from 'zod';

import { parseContentData, type ItemData } from '@/@shared/content';
import { listPickableContent } from '@/server/content';
import {
  addStock,
  buy,
  createShop,
  deleteShop,
  listShops,
  removeStock,
  sell,
  sellQuotes,
  stockBasics,
  updateShop,
  updateStock,
  type SellQuote,
  type ShopRow,
  type TradeResult,
} from '@/server/shops';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That shop is not here any more.',
    FORBIDDEN: 'Only the table staff run the shops.',
    NOT_YOUR_PURSE: 'That is not your purse.',
    NOT_AT_TABLE: 'They are not seated at this table.',
    NOT_AN_ITEM: 'A shop sells items.',
    NOT_IN_PLAY:
      'That homebrew is not in play at this table. Approve it into the library first.',
    NO_SUCH_ITEM: 'That item no longer resolves.',
    SOLD_OUT: 'There is none of that left.',
    CANNOT_AFFORD: 'Not enough in the purse.',
    ATTUNED: 'Break the attunement first, then sell it.',
    WORTHLESS:
      'The shop will not pay for that — the book prices it at nothing.',
  };
  if (!messages[code]) console.error('[shop-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const shopSchema = z.object({
  name: z.string().trim().max(120).optional(),
  blurb: z.string().trim().max(600).optional(),
  markupPercent: z.number().int().min(-90).max(500).optional(),
  buysAtPercent: z.number().int().min(0).max(200).optional(),
  visibility: z.enum(['dm', 'shared']).optional(),
});

const refSchema = z.object({
  source: z.enum(['srd', 'homebrew']),
  type: z.literal('item'),
  key: z.string().min(1).max(200),
});

const price = z.number().int().min(0).max(100_000_000).nullable().optional();
const count = z.number().int().min(0).max(100_000).nullable().optional();

export async function listShopsAction(campaignId: string): Promise<ShopRow[]> {
  try {
    return await listShops(campaignId);
  } catch {
    return [];
  }
}

/** Every item the DM may stock: the SRD's, plus this table's homebrew. */
export interface ShopItemChoice {
  key: string;
  source: 'srd' | 'homebrew';
  name: string;
  kind: string;
  rarity: string;
  costCp: number;
}

export async function listShopItemChoicesAction(
  campaignId: string
): Promise<ShopItemChoice[]> {
  try {
    const entries = await listPickableContent('item', campaignId);
    return entries
      .map(e => {
        const d = parseContentData('item', e.data) as ItemData;
        return {
          key: e.ref.key,
          source: e.ref.source,
          name: e.name,
          kind: d.kind,
          rarity: d.rarity,
          costCp: Math.round(d.cost * 100),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function createShopAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = shopSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: 'That is not a shop.' };
  try {
    const id = await createShop(campaignId, parsed.data);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Could not open the shop.');
  }
}

export async function updateShopAction(
  shopId: string,
  input: unknown
): Promise<Result> {
  const parsed = shopSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: 'That is not a shop.' };
  try {
    await updateShop(shopId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the shop.');
  }
}

export async function deleteShopAction(shopId: string): Promise<Result> {
  try {
    await deleteShop(shopId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not close the shop.');
  }
}

export async function addStockAction(
  shopId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = z
    .object({ ref: refSchema, priceCp: price, quantity: count })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not stock.' };
  try {
    const id = await addStock(shopId, parsed.data);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Could not put that on the shelf.');
  }
}

export async function updateStockAction(
  stockId: string,
  input: unknown
): Promise<Result> {
  const parsed = z
    .object({ priceCp: price, quantity: count })
    .safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: 'That is not a price.' };
  try {
    await updateStock(stockId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the shelf.');
  }
}

export async function removeStockAction(stockId: string): Promise<Result> {
  try {
    await removeStock(stockId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that off the shelf.');
  }
}

export async function stockBasicsAction(
  shopId: string
): Promise<Result<{ added: number }>> {
  try {
    const added = await stockBasics(shopId);
    return { ok: true, data: { added } };
  } catch (err) {
    return fail(err, 'Could not stock the shelves.');
  }
}

export async function buyAction(
  shopId: string,
  stockId: string,
  characterId: string,
  quantity: number,
  periodId?: string | null
): Promise<Result<TradeResult>> {
  try {
    const data = await buy(shopId, stockId, characterId, quantity, {
      periodId,
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'The sale did not go through.');
  }
}

export async function sellAction(
  shopId: string,
  characterId: string,
  itemId: string,
  quantity: number,
  periodId?: string | null
): Promise<Result<TradeResult>> {
  try {
    const data = await sell(shopId, characterId, itemId, quantity, {
      periodId,
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'The sale did not go through.');
  }
}

export async function sellQuotesAction(
  shopId: string,
  characterId: string
): Promise<SellQuote[]> {
  try {
    return await sellQuotes(shopId, characterId);
  } catch {
    return [];
  }
}
