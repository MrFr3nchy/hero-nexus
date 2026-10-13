import 'server-only';
import { and, eq } from 'drizzle-orm';

import { armorClass } from '@/@creator/character/lib/derive';
import { type CharacterSheet } from '@/@creator/character/schema';
import { refKey } from '@/@shared/content';

import { randomUUID } from 'node:crypto';
import { resolveContentRefs } from '../content';

import { db } from '@/db';
import {
  campaignMembers,
  characterHistory,
  characters,
  initiativeEntries,
} from '@/db/schema';
import { bumpVersion, publish } from '../live-hub';
import { requireUserId } from '../session-user';
import { COIN_KEYS, getPlayLoadout, othersAt } from './loadout';
import type { Coins, PlayLoadout } from './loadout';
import { authorize, clamp } from './shared';

/**
 * Trading — a move, not an offer.
 */
/** How a purse reads in one line: "12 gp, 3 sp". Empty for an empty purse. */
export function coinsLine(coins: Partial<Coins>): string {
  return COIN_KEYS.filter(k => (coins[k] ?? 0) > 0)
    .map(k => `${coins[k]} ${k}`)
    .join(', ');
}

/**
 * Who a thing may be handed to, and by whom.
 *
 * The giver's side is `authorize` — the owner, or staff at the table — and
 * the receiver must be another character seated at the same table. Not the
 * owner's other hero at another campaign, not a blueprint on the shelf: a
 * gift crosses a table, and the table is the boundary.
 */
export async function tradingPair(
  characterId: string,
  campaignId: string,
  toCharacterId: string
) {
  const { character, canEdit } = await authorize(characterId, campaignId);
  if (!canEdit) throw new Error('FORBIDDEN');
  if (toCharacterId === characterId) throw new Error('NOT_AT_TABLE');

  // `authorize` lets an owner through before it looks at the table. A gift
  // is a table verb, so the giver must actually be seated here — a hero on
  // the shelf cannot hand things to a table it does not sit at.
  const seat = await db.query.campaignMembers.findFirst({
    columns: { id: true },
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId),
      eq(campaignMembers.status, 'active')
    ),
  });
  if (!seat) throw new Error('NOT_AT_TABLE');

  const seated = await othersAt(campaignId, characterId);
  if (!seated.some(s => s.characterId === toCharacterId)) {
    throw new Error('NOT_AT_TABLE');
  }
  const receiver = await db.query.characters.findFirst({
    where: eq(characters.id, toCharacterId),
  });
  if (!receiver) throw new Error('NOT_AT_TABLE');
  return { giver: character, receiver };
}

/**
 * Tell the two people it passed between, and the DM.
 *
 * `by` is the person who pressed the button, which is the giver's player or
 * the DM — so the giver's own corner stays quiet about what they just did and
 * the receiver's does not.
 */
function announceGift(
  campaignId: string,
  by: string,
  giver: typeof characters.$inferSelect,
  receiver: typeof characters.$inferSelect,
  what: string
): void {
  publish(
    campaignId,
    {
      kind: 'gift',
      id: randomUUID(),
      at: new Date().toISOString(),
      by,
      fromName: giver.name,
      toName: receiver.name,
      what,
    },
    { users: [...new Set([giver.ownerId, receiver.ownerId])] }
  );
}

export interface GiveItemInput {
  itemId: string;
  toCharacterId: string;
  /** How many of the stack. The whole stack when omitted. */
  quantity?: number;
}

/**
 * Hand an item to another character at the table.
 *
 * Given, not offered: the table already has an accept/refuse flow, and it is
 * the person across from you saying no. The row moves in one write —
 * decremented or deleted on the giver's side, merged onto an identical
 * unattuned row on the receiver's or added as a fresh one — and both sheets
 * get a `character_history` line, so "where did the healing potion go" has an
 * answer on both.
 *
 * An attuned item is refused. Attunement is a bond with the item's owner and
 * does not travel; break it first, then give it. The receiver gets the row
 * unequipped and unattuned, because what is in hand is their decision.
 */
export async function giveItem(
  characterId: string,
  campaignId: string,
  input: GiveItemInput
): Promise<PlayLoadout> {
  const userId = await requireUserId();
  const { giver, receiver } = await tradingPair(
    characterId,
    campaignId,
    input.toCharacterId
  );

  const giverSheet = giver.sheet as CharacterSheet;
  const receiverSheet = receiver.sheet as CharacterSheet;

  const item = giverSheet.inventory.find(i => i.id === input.itemId);
  if (!item) throw new Error('NO_SUCH_ITEM');
  if (item.attuned) throw new Error('ATTUNED');
  if (item.quantity <= 0) throw new Error('NOTHING_TO_GIVE');
  const quantity = clamp(
    Math.trunc(input.quantity ?? item.quantity) || item.quantity,
    1,
    item.quantity
  );

  /*
   * The receiver's matching row, if they have one: the same content when
   * the item is content, the same name when it was typed by hand, and not
   * attuned — an attuned row is bound to them and a second copy of the same
   * item must not be folded into it.
   */
  const key = item.ref ? refKey(item.ref) : null;
  const match = receiverSheet.inventory.find(
    r =>
      !r.attuned &&
      (key
        ? r.ref !== null && refKey(r.ref) === key
        : r.ref === null &&
          r.name.trim().toLowerCase() === item.name.trim().toLowerCase())
  );

  const receiverInventory = match
    ? receiverSheet.inventory.map(r =>
        r.id === match.id ? { ...r, quantity: r.quantity + quantity } : r
      )
    : [
        ...receiverSheet.inventory,
        {
          id: randomUUID(),
          ref: item.ref,
          name: item.name,
          quantity,
          equipped: false,
          attuned: false,
          notes: item.notes,
          grantedBy: '',
        },
      ];

  const whole = quantity >= item.quantity;
  const giverInventory = whole
    ? giverSheet.inventory.filter(i => i.id !== item.id)
    : giverSheet.inventory.map(i =>
        i.id === item.id ? { ...i, quantity: i.quantity - quantity } : i
      );

  const nextGiver: CharacterSheet = {
    ...giverSheet,
    inventory: giverInventory,
  };
  // Handing over a worn shield moves the giver's armour class, the same way
  // stowing it would. The receiver's does not move: they have not put it on.
  if (whole && item.equipped) {
    const resolved = await resolveContentRefs(
      giverInventory.map(i => i.ref).filter(r => r !== null)
    );
    nextGiver.combat = {
      ...nextGiver.combat,
      armorClass: armorClass(nextGiver, resolved),
    };
  }
  const nextReceiver: CharacterSheet = {
    ...receiverSheet,
    inventory: receiverInventory,
  };

  const now = new Date().toISOString();
  const count = quantity === 1 ? '' : ` ×${quantity}`;
  const what = `${item.name}${count}`;

  db.transaction(tx => {
    tx.update(characters)
      .set({ sheet: nextGiver, updatedAt: now })
      .where(eq(characters.id, giver.id))
      .run();
    tx.update(characters)
      .set({ sheet: nextReceiver, updatedAt: now })
      .where(eq(characters.id, receiver.id))
      .run();
    if (whole && item.equipped) {
      tx.update(initiativeEntries)
        .set({ armorClass: nextGiver.combat.armorClass })
        .where(eq(initiativeEntries.characterId, giver.id))
        .run();
    }
    tx.insert(characterHistory)
      .values([
        {
          characterId: giver.id,
          actorUserId: userId,
          kind: 'inventory',
          field: `inventory.${item.id}`,
          fromValue: String(item.quantity),
          toValue: whole ? null : String(item.quantity - quantity),
          detail: `Gave "${item.name}"${count} to ${receiver.name}`,
          occurredAt: now,
        },
        {
          characterId: receiver.id,
          actorUserId: userId,
          kind: 'inventory',
          field: `inventory.${match ? match.id : receiverInventory[receiverInventory.length - 1].id}`,
          fromValue: match ? String(match.quantity) : null,
          toValue: String((match?.quantity ?? 0) + quantity),
          detail: `Received "${item.name}"${count} from ${giver.name}`,
          occurredAt: now,
        },
      ])
      .run();
  });

  bumpVersion(campaignId);
  announceGift(campaignId, userId, giver, receiver, what);

  return getPlayLoadout(characterId, campaignId);
}

export interface GiveCoinInput {
  toCharacterId: string;
  coins: Partial<Coins>;
}

/**
 * Hand coins to another character at the table. Each denomination moves on
 * its own — no change is made, because the app cannot know whether the
 * table treats an electrum piece as worth anything.
 */
export async function giveCoin(
  characterId: string,
  campaignId: string,
  input: GiveCoinInput
): Promise<PlayLoadout> {
  const userId = await requireUserId();
  const { giver, receiver } = await tradingPair(
    characterId,
    campaignId,
    input.toCharacterId
  );

  const giverSheet = giver.sheet as CharacterSheet;
  const receiverSheet = receiver.sheet as CharacterSheet;

  const moving: Coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  let total = 0;
  for (const k of COIN_KEYS) {
    const n = Math.max(0, Math.trunc(input.coins[k] ?? 0) || 0);
    if (n > (giverSheet.currency[k] ?? 0)) throw new Error('NOT_ENOUGH_COIN');
    moving[k] = n;
    total += n;
  }
  if (total === 0) throw new Error('NOTHING_TO_GIVE');

  const giverPurse = { ...giverSheet.currency };
  const receiverPurse = { ...receiverSheet.currency };
  for (const k of COIN_KEYS) {
    giverPurse[k] = (giverPurse[k] ?? 0) - moving[k];
    receiverPurse[k] = (receiverPurse[k] ?? 0) + moving[k];
  }

  const now = new Date().toISOString();
  const what = coinsLine(moving);
  const nextGiver: CharacterSheet = { ...giverSheet, currency: giverPurse };
  const nextReceiver: CharacterSheet = {
    ...receiverSheet,
    currency: receiverPurse,
  };

  db.transaction(tx => {
    tx.update(characters)
      .set({ sheet: nextGiver, updatedAt: now })
      .where(eq(characters.id, giver.id))
      .run();
    tx.update(characters)
      .set({ sheet: nextReceiver, updatedAt: now })
      .where(eq(characters.id, receiver.id))
      .run();
    tx.insert(characterHistory)
      .values([
        {
          characterId: giver.id,
          actorUserId: userId,
          kind: 'currency',
          field: 'currency',
          fromValue: coinsLine(giverSheet.currency) || '0',
          toValue: coinsLine(giverPurse) || '0',
          detail: `Gave ${what} to ${receiver.name}`,
          occurredAt: now,
        },
        {
          characterId: receiver.id,
          actorUserId: userId,
          kind: 'currency',
          field: 'currency',
          fromValue: coinsLine(receiverSheet.currency) || '0',
          toValue: coinsLine(receiverPurse) || '0',
          detail: `Received ${what} from ${giver.name}`,
          occurredAt: now,
        },
      ])
      .run();
  });

  bumpVersion(campaignId);
  announceGift(campaignId, userId, giver, receiver, what);

  return getPlayLoadout(characterId, campaignId);
}
