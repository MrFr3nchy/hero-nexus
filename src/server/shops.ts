import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

import {
  addToPurse,
  cpWords,
  gpToCp,
  markedUp,
  payFromPurse,
  purseInCp,
  type Purse,
} from '@/@creator/character/lib/coins';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  parseContentData,
  refKey,
  type ContentEntry,
  type ContentRef,
  type ItemData,
} from '@/@shared/content';
import { db } from '@/db';
import {
  campaignMembers,
  campaignShopStock,
  campaignShops,
  characterHistory,
  characters,
  downtimeActions,
  downtimePeriods,
} from '@/db/schema';
import { listCampaignContentIds } from './campaign-content';
import { requireCampaignRole, type CampaignRole } from './campaigns';
import { listPickableContent, resolveContentRefs } from './content';
import { bumpVersion } from './live-hub';
import { requireUserId } from './session-user';

/**
 * A shop: a place the party buys and sells.
 *
 * Stock rows point at content (content-model rule 1): an SRD item, or a
 * homebrew item this campaign has in play (rule 6). The stats — the book
 * cost, the weight — are resolved when the shelf is read, so a DM who
 * corrects a homebrew potion's price sees every shop stocking it follow.
 * `buy` and `sell` are one transaction each: the purse moves, the row moves,
 * the stock moves, and one `character_history` line says what happened.
 * `giveItem` and `giveCoin` in `play.ts` are the halves this joins; the
 * price list is the part that was missing.
 */

export interface StockRow {
  id: string;
  ref: ContentRef;
  name: string;
  /** The price on the shelf, in copper: set by hand, or the book cost with the markup. */
  priceCp: number;
  /** What the book says it costs, in copper, when the item resolves. */
  bookCostCp: number | null;
  /** Null is a shelf that never empties. */
  quantity: number | null;
  sortOrder: number;
  /** For the chips under the name. Absent when the ref no longer resolves. */
  entry: ContentEntry | null;
}

export interface ShopRow {
  id: string;
  campaignId: string;
  name: string;
  blurb: string;
  markupPercent: number;
  buysAtPercent: number;
  visibility: 'dm' | 'shared';
  stock: StockRow[];
  createdAt: string;
}

const isStaffRole = (role: CampaignRole) => role === 'gm' || role === 'co-gm';

async function staffForShop(shopId: string) {
  const shop = await db.query.campaignShops.findFirst({
    where: eq(campaignShops.id, shopId),
  });
  if (!shop) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(shop.campaignId, [
    'gm',
    'co-gm',
  ]);
  return { shop, userId };
}

function toRef(row: { contentSource: string; contentKey: string }): ContentRef {
  return {
    source: row.contentSource === 'homebrew' ? 'homebrew' : 'srd',
    type: 'item',
    key: row.contentKey,
  };
}

/** The shelf price of a row, given what the book says about the item. */
export function shelfPrice(
  row: { priceCp: number | null },
  bookCostCp: number | null,
  markupPercent: number
): number {
  if (row.priceCp !== null) return row.priceCp;
  return markedUp(bookCostCp ?? 0, markupPercent);
}

/* --- reading --------------------------------------------------------- */

/**
 * The shops at a table. Staff see every one; a player sees only what the DM
 * has opened to the party (`visibility = 'shared'`) — a shop in prep is not
 * yet a place the party has found.
 */
export async function listShops(campaignId: string): Promise<ShopRow[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const shops = await db
    .select()
    .from(campaignShops)
    .where(eq(campaignShops.campaignId, campaignId))
    .orderBy(asc(campaignShops.createdAt));
  const visible = shops.filter(
    s => isStaffRole(role) || s.visibility === 'shared'
  );
  if (visible.length === 0) return [];

  const stock = await db
    .select()
    .from(campaignShopStock)
    .orderBy(asc(campaignShopStock.sortOrder));
  const mine = stock.filter(s => visible.some(v => v.id === s.shopId));
  const resolved = await resolveContentRefs(mine.map(toRef));

  return visible.map(shop => ({
    id: shop.id,
    campaignId: shop.campaignId,
    name: shop.name,
    blurb: shop.blurb,
    markupPercent: shop.markupPercent,
    buysAtPercent: shop.buysAtPercent,
    visibility: shop.visibility,
    createdAt: shop.createdAt,
    stock: mine
      .filter(s => s.shopId === shop.id)
      .map(s => {
        const entry = resolved.get(refKey(toRef(s))) ?? null;
        const data = entry
          ? (parseContentData('item', entry.data) as ItemData)
          : null;
        const bookCostCp = data ? gpToCp(data.cost) : null;
        return {
          id: s.id,
          ref: toRef(s),
          // The live name when it resolves; the stored one only as a
          // fallback, the same rule the encounter planner follows.
          name: entry?.name || s.name,
          priceCp: shelfPrice(s, bookCostCp, shop.markupPercent),
          bookCostCp,
          quantity: s.quantity,
          sortOrder: s.sortOrder,
          entry,
        };
      }),
  }));
}

/* --- the DM's side --------------------------------------------------- */

export interface ShopInput {
  name?: string;
  blurb?: string;
  markupPercent?: number;
  buysAtPercent?: number;
  visibility?: 'dm' | 'shared';
}

function cleanShop(input: ShopInput) {
  const out: Partial<typeof campaignShops.$inferInsert> = {};
  if (input.name !== undefined) out.name = input.name.trim().slice(0, 120);
  if (input.blurb !== undefined) out.blurb = input.blurb.trim().slice(0, 600);
  if (input.markupPercent !== undefined) {
    out.markupPercent = Math.max(
      -90,
      Math.min(500, Math.trunc(input.markupPercent))
    );
  }
  if (input.buysAtPercent !== undefined) {
    out.buysAtPercent = Math.max(
      0,
      Math.min(200, Math.trunc(input.buysAtPercent))
    );
  }
  if (input.visibility === 'dm' || input.visibility === 'shared') {
    out.visibility = input.visibility;
  }
  return out;
}

export async function createShop(
  campaignId: string,
  input: ShopInput
): Promise<string> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const [row] = await db
    .insert(campaignShops)
    .values({ campaignId, ...cleanShop(input) })
    .returning({ id: campaignShops.id });
  bumpVersion(campaignId);
  return row.id;
}

export async function updateShop(
  shopId: string,
  input: ShopInput
): Promise<void> {
  const { shop } = await staffForShop(shopId);
  await db
    .update(campaignShops)
    .set(cleanShop(input))
    .where(eq(campaignShops.id, shopId));
  bumpVersion(shop.campaignId);
}

export async function deleteShop(shopId: string): Promise<void> {
  const { shop } = await staffForShop(shopId);
  await db.delete(campaignShops).where(eq(campaignShops.id, shopId));
  bumpVersion(shop.campaignId);
}

export interface StockInput {
  ref: ContentRef;
  priceCp?: number | null;
  quantity?: number | null;
}

/**
 * Put an item on the shelf. A homebrew item must be in play at this table
 * (content-model rule 6): the library is the answer to "may this be used
 * here?", and a shop selling what the DM has not allowed is a leak.
 */
export async function addStock(
  shopId: string,
  input: StockInput
): Promise<string> {
  const { shop } = await staffForShop(shopId);
  if (input.ref.type !== 'item') throw new Error('NOT_AN_ITEM');
  if (input.ref.source === 'homebrew') {
    const inPlay = await listCampaignContentIds(shop.campaignId);
    if (!inPlay.has(input.ref.key)) throw new Error('NOT_IN_PLAY');
  }
  const resolved = await resolveContentRefs([input.ref]);
  const entry = resolved.get(refKey(input.ref));
  if (!entry) throw new Error('NO_SUCH_ITEM');

  const existing = await db
    .select({ sortOrder: campaignShopStock.sortOrder })
    .from(campaignShopStock)
    .where(eq(campaignShopStock.shopId, shopId));
  const sortOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;

  const [row] = await db
    .insert(campaignShopStock)
    .values({
      shopId,
      contentSource: input.ref.source,
      contentKey: input.ref.key,
      name: entry.name,
      priceCp:
        input.priceCp === null || input.priceCp === undefined
          ? null
          : Math.max(0, Math.trunc(input.priceCp)),
      quantity:
        input.quantity === null || input.quantity === undefined
          ? null
          : Math.max(0, Math.trunc(input.quantity)),
      sortOrder,
    })
    .returning({ id: campaignShopStock.id });
  bumpVersion(shop.campaignId);
  return row.id;
}

export async function updateStock(
  stockId: string,
  input: { priceCp?: number | null; quantity?: number | null }
): Promise<void> {
  const row = await db.query.campaignShopStock.findFirst({
    where: eq(campaignShopStock.id, stockId),
  });
  if (!row) throw new Error('NOT_FOUND');
  const { shop } = await staffForShop(row.shopId);
  const patch: Partial<typeof campaignShopStock.$inferInsert> = {};
  if (input.priceCp !== undefined) {
    patch.priceCp =
      input.priceCp === null ? null : Math.max(0, Math.trunc(input.priceCp));
  }
  if (input.quantity !== undefined) {
    patch.quantity =
      input.quantity === null ? null : Math.max(0, Math.trunc(input.quantity));
  }
  await db
    .update(campaignShopStock)
    .set(patch)
    .where(eq(campaignShopStock.id, stockId));
  bumpVersion(shop.campaignId);
}

export async function removeStock(stockId: string): Promise<void> {
  const row = await db.query.campaignShopStock.findFirst({
    where: eq(campaignShopStock.id, stockId),
  });
  if (!row) throw new Error('NOT_FOUND');
  const { shop } = await staffForShop(row.shopId);
  await db.delete(campaignShopStock).where(eq(campaignShopStock.id, stockId));
  bumpVersion(shop.campaignId);
}

/**
 * Stock the basics: everything the SRD prices that an ordinary shop would
 * carry — weapons, armour, gear and common consumables with a cost — on
 * unlimited shelves at the book price. Idempotent: what is already stocked
 * is skipped. Returns how many rows went on.
 */
export async function stockBasics(shopId: string): Promise<number> {
  const { shop } = await staffForShop(shopId);
  const items = await listPickableContent('item', shop.campaignId);
  const have = new Set(
    (
      await db
        .select({ key: campaignShopStock.contentKey })
        .from(campaignShopStock)
        .where(eq(campaignShopStock.shopId, shopId))
    ).map(r => r.key)
  );
  const basics = items.filter(e => {
    if (e.ref.source !== 'srd') return false;
    const d = parseContentData('item', e.data) as ItemData;
    if (d.cost <= 0) return false;
    if (d.rarity !== 'common') return false;
    return ['weapon', 'armor', 'gear', 'consumable'].includes(d.kind);
  });
  let sortOrder =
    (
      await db
        .select({ sortOrder: campaignShopStock.sortOrder })
        .from(campaignShopStock)
        .where(eq(campaignShopStock.shopId, shopId))
    ).reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;
  const rows = basics
    .filter(e => !have.has(e.ref.key))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(e => ({
      shopId,
      contentSource: 'srd',
      contentKey: e.ref.key,
      name: e.name,
      priceCp: null,
      quantity: null,
      sortOrder: sortOrder++,
    }));
  if (rows.length > 0) await db.insert(campaignShopStock).values(rows);
  bumpVersion(shop.campaignId);
  return rows.length;
}

/* --- trade ------------------------------------------------------------ */

/**
 * Who is spending: the character's owner, or staff at the table, and the
 * character must be seated here — a shop sells to the party in front of it.
 */
async function shopper(campaignId: string, characterId: string) {
  const userId = await requireUserId();
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');
  const seat = await db.query.campaignMembers.findFirst({
    columns: { id: true },
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId)
    ),
  });
  if (!seat) throw new Error('NOT_AT_TABLE');
  if (character.ownerId !== userId && !isStaffRole(role)) {
    throw new Error('NOT_YOUR_PURSE');
  }
  return { userId, character, isStaff: isStaffRole(role) };
}

/** A shop the caller may trade at: shared, or any for staff. */
async function shopFor(shopId: string, isStaff: boolean) {
  const shop = await db.query.campaignShops.findFirst({
    where: eq(campaignShops.id, shopId),
  });
  if (!shop) throw new Error('NOT_FOUND');
  if (!isStaff && shop.visibility !== 'shared') throw new Error('NOT_FOUND');
  return shop;
}

export interface TradeResult {
  /** "Bought 2 × Potion of Healing from The Gilded Mortar for 100 gp". */
  line: string;
  /** The purse after. */
  purse: Purse;
}

/**
 * Log a trade under an open downtime period, when the shopper asked for it
 * and it is theirs to log. A period that has closed, or somebody else's
 * character, is quietly left alone — the trade itself already happened.
 */
async function logDowntime(
  campaignId: string,
  periodId: string | null | undefined,
  characterId: string,
  userId: string,
  line: string
): Promise<void> {
  if (!periodId) return;
  const period = await db.query.downtimePeriods.findFirst({
    where: eq(downtimePeriods.id, periodId),
  });
  if (!period || period.campaignId !== campaignId) return;
  if (period.status !== 'open') return;
  await db.insert(downtimeActions).values({
    periodId,
    characterId,
    actorUserId: userId,
    kind: 'shopping',
    body: line,
    visibility: 'party',
  });
}

/**
 * Buy from the shelf. One transaction: the purse pays (`CANNOT_AFFORD` and
 * nothing moves), the row lands in the pack — onto a matching stack, or as
 * a new row — the shelf's count goes down, and one history line says so.
 */
export async function buy(
  shopId: string,
  stockId: string,
  characterId: string,
  quantity = 1,
  options: { periodId?: string | null } = {}
): Promise<TradeResult> {
  const shop0 = await db.query.campaignShops.findFirst({
    where: eq(campaignShops.id, shopId),
  });
  if (!shop0) throw new Error('NOT_FOUND');
  const { userId, character, isStaff } = await shopper(
    shop0.campaignId,
    characterId
  );
  const shop = await shopFor(shopId, isStaff);
  const row = await db.query.campaignShopStock.findFirst({
    where: and(
      eq(campaignShopStock.id, stockId),
      eq(campaignShopStock.shopId, shopId)
    ),
  });
  if (!row) throw new Error('NOT_FOUND');
  const qty = Math.max(1, Math.min(99, Math.trunc(quantity) || 1));
  if (row.quantity !== null && row.quantity < qty) throw new Error('SOLD_OUT');

  const ref = toRef(row);
  const entry = (await resolveContentRefs([ref])).get(refKey(ref));
  if (!entry) throw new Error('NO_SUCH_ITEM');
  const data = parseContentData('item', entry.data) as ItemData;
  const each = shelfPrice(row, gpToCp(data.cost), shop.markupPercent);
  const price = each * qty;

  const sheet = character.sheet as CharacterSheet;
  const purse = payFromPurse(sheet.currency as Purse, price);
  if (!purse) throw new Error('CANNOT_AFFORD');

  const key = refKey(ref);
  const match = sheet.inventory.find(i => i.ref && refKey(i.ref) === key);
  const inventory = match
    ? sheet.inventory.map(i =>
        i.id === match.id ? { ...i, quantity: i.quantity + qty } : i
      )
    : [
        ...sheet.inventory,
        {
          id: randomUUID(),
          // The sheet's ref carries the name too — the denormalisation
          // rule 1 allows, so a deleted item still reads as a word.
          ref: { ...ref, name: entry.name },
          name: entry.name,
          quantity: qty,
          equipped: false,
          attuned: false,
          notes: '',
          grantedBy: '',
        },
      ];
  const next: CharacterSheet = { ...sheet, currency: purse, inventory };
  const now = new Date().toISOString();
  const what = `${qty} × ${entry.name}`;
  const line = `Bought ${what} from ${shop.name || 'the shop'} for ${cpWords(price)}`;

  db.transaction(tx => {
    tx.update(characters)
      .set({ sheet: next, updatedAt: now })
      .where(eq(characters.id, character.id))
      .run();
    if (row.quantity !== null) {
      tx.update(campaignShopStock)
        .set({ quantity: row.quantity - qty })
        .where(eq(campaignShopStock.id, row.id))
        .run();
    }
    tx.insert(characterHistory)
      .values({
        characterId: character.id,
        actorUserId: userId,
        kind: 'currency',
        field: 'currency',
        fromValue: cpWords(purseInCp(sheet.currency)),
        toValue: cpWords(purseInCp(purse)),
        detail: line,
        occurredAt: now,
      })
      .run();
  });
  await logDowntime(
    shop.campaignId,
    options.periodId,
    character.id,
    userId,
    line
  );
  bumpVersion(shop.campaignId);
  return { line, purse };
}

/** What the shop would pay for each thing in a pack, for the sell list. */
export interface SellQuote {
  itemId: string;
  name: string;
  quantity: number;
  attuned: boolean;
  /** Copper apiece; 0 when the book prices it at nothing or it does not resolve. */
  eachCp: number;
}

export async function sellQuotes(
  shopId: string,
  characterId: string
): Promise<SellQuote[]> {
  const shop0 = await db.query.campaignShops.findFirst({
    where: eq(campaignShops.id, shopId),
  });
  if (!shop0) throw new Error('NOT_FOUND');
  const { character, isStaff } = await shopper(shop0.campaignId, characterId);
  const shop = await shopFor(shopId, isStaff);
  const sheet = character.sheet as CharacterSheet;
  const refs = sheet.inventory
    .map(i => i.ref)
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const resolved = await resolveContentRefs(refs);
  return sheet.inventory.map(item => {
    const entry = item.ref ? resolved.get(refKey(item.ref)) : undefined;
    const data = entry
      ? (parseContentData('item', entry.data) as ItemData)
      : null;
    return {
      itemId: item.id,
      name: item.name,
      quantity: item.quantity,
      attuned: item.attuned,
      eachCp: data ? markedUp(gpToCp(data.cost), shop.buysAtPercent - 100) : 0,
    };
  });
}

/**
 * Sell to the shop, at its buying rate on the book cost. The inverse of
 * `buy`: the row leaves the pack (or its stack shrinks), the purse grows,
 * and a shop that counts its shelves gains the item back. An item the book
 * does not price fetches nothing and is refused rather than given away.
 */
export async function sell(
  shopId: string,
  characterId: string,
  itemId: string,
  quantity = 1,
  options: { periodId?: string | null } = {}
): Promise<TradeResult> {
  const shop0 = await db.query.campaignShops.findFirst({
    where: eq(campaignShops.id, shopId),
  });
  if (!shop0) throw new Error('NOT_FOUND');
  const { userId, character, isStaff } = await shopper(
    shop0.campaignId,
    characterId
  );
  const shop = await shopFor(shopId, isStaff);
  const sheet = character.sheet as CharacterSheet;
  const item = sheet.inventory.find(i => i.id === itemId);
  if (!item) throw new Error('NO_SUCH_ITEM');
  if (item.attuned) throw new Error('ATTUNED');
  if (!item.ref) throw new Error('WORTHLESS');
  const qty = Math.max(1, Math.min(item.quantity, Math.trunc(quantity) || 1));

  const entry = (await resolveContentRefs([item.ref])).get(refKey(item.ref));
  if (!entry) throw new Error('WORTHLESS');
  const data = parseContentData('item', entry.data) as ItemData;
  const each = markedUp(gpToCp(data.cost), shop.buysAtPercent - 100);
  if (each <= 0) throw new Error('WORTHLESS');
  const paid = each * qty;

  const purse = addToPurse(sheet.currency as Purse, paid);
  const whole = qty >= item.quantity;
  const inventory = whole
    ? sheet.inventory.filter(i => i.id !== item.id)
    : sheet.inventory.map(i =>
        i.id === item.id ? { ...i, quantity: i.quantity - qty } : i
      );
  const next: CharacterSheet = { ...sheet, currency: purse, inventory };
  const now = new Date().toISOString();
  const what = `${qty} × ${entry.name}`;
  const line = `Sold ${what} to ${shop.name || 'the shop'} for ${cpWords(paid)}`;

  // A shop that counts its shelves takes the item back onto them.
  const shelf = await db.query.campaignShopStock.findFirst({
    where: and(
      eq(campaignShopStock.shopId, shopId),
      eq(campaignShopStock.contentSource, item.ref.source),
      eq(campaignShopStock.contentKey, item.ref.key)
    ),
  });

  db.transaction(tx => {
    tx.update(characters)
      .set({ sheet: next, updatedAt: now })
      .where(eq(characters.id, character.id))
      .run();
    if (shelf && shelf.quantity !== null) {
      tx.update(campaignShopStock)
        .set({ quantity: shelf.quantity + qty })
        .where(eq(campaignShopStock.id, shelf.id))
        .run();
    }
    tx.insert(characterHistory)
      .values({
        characterId: character.id,
        actorUserId: userId,
        kind: 'currency',
        field: 'currency',
        fromValue: cpWords(purseInCp(sheet.currency)),
        toValue: cpWords(purseInCp(purse)),
        detail: line,
        occurredAt: now,
      })
      .run();
  });
  await logDowntime(
    shop.campaignId,
    options.periodId,
    character.id,
    userId,
    line
  );
  bumpVersion(shop.campaignId);
  return { line, purse };
}
