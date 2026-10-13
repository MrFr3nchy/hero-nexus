import 'server-only';
import { and, eq } from 'drizzle-orm';

import { type CharacterSheet } from '@/@creator/character/schema';
import { parseContentData, refKey } from '@/@shared/content';
import {
  parseNotation,
  rollNotation,
  type NotationRoll,
} from '@/@shared/lib/dice';
import { randomUUID } from 'node:crypto';
import { resolveContentRefs } from '../content';

import { db } from '@/db';
import {
  campaignRolls,
  characterHistory,
  characters,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { writeConditions } from '../conditions';
import { bumpVersion, publish } from '../live-hub';
import { effectiveRules, fence } from '../table-rules';
import { takeActionUnchecked } from '../turn';
import { DEFAULT_TABLE_RULES } from '@/@creator/campaign/lib/table-rules';
import { requireUserId } from '../session-user';
import { getPlayLoadout } from './loadout';
import type { PlayLoadout } from './loadout';
import { SLOT_KEYS, authorize } from './shared';
import type { PlayPatch } from './shared';
import { tradingPair } from './trading';
import { applyPlayPatchUnchecked } from './state';

/**
 * Using a thing (improvements 09).
 */
export interface UseItemResult {
  loadout: PlayLoadout;
  /** What the dice said, for the tray. Null for a thing with no dice. */
  roll: NotationRoll | null;
  /** One line: "Kessa drinks a Potion of Healing · 7 hit points". */
  words: string;
}

/**
 * Use something carried: drink the potion, snap the wand, swallow the
 * antitoxin. Owner or staff; `targetCharacterId` is another seated hero for
 * administering — always the Action in 2024, whatever the table says a
 * potion costs for yourself.
 *
 * In a fight the turn pays first (05), through the table's `potionAction`
 * for a healing potion and the item's own cost for anything else;
 * `ALREADY_ACTED` under Enforce, staff may rule. The dice roll on the
 * server — `healingPotions: 'max'` takes the maximum — and land through the
 * play patch; a cure takes the conditions off; a consumed row loses one,
 * and at zero goes unless a starting package granted it, in which case it
 * stays at zero so the kit is remembered; a charge comes off a wand,
 * `NO_CHARGES` at zero. One history line, one roll in the log, a `gift`
 * event when it was given to somebody else.
 */
export async function consumeItem(
  characterId: string,
  campaignId: string | null,
  input: { itemId: string; targetCharacterId?: string | null; ruling?: boolean }
): Promise<UseItemResult> {
  const { character, canEdit, isStaff } = await authorize(
    characterId,
    campaignId
  );
  if (!canEdit) throw new Error('FORBIDDEN');
  const userId = await requireUserId();
  const sheet = character.sheet as CharacterSheet;
  const row = sheet.inventory.find(i => i.id === input.itemId);
  if (!row) throw new Error('NO_SUCH_ITEM');
  if (row.quantity <= 0) throw new Error('NOTHING_LEFT');

  const resolved = row.ref ? await resolveContentRefs([row.ref]) : new Map();
  const entry = row.ref ? resolved.get(refKey(row.ref)) : undefined;
  const data =
    entry && entry.type === 'item'
      ? parseContentData('item', entry.data)
      : null;
  const use = data?.use ?? null;
  const charges = data?.charges ?? 0;
  if (!use && charges === 0) throw new Error('NOTHING_TO_USE');

  const rules = campaignId
    ? await effectiveRules(campaignId)
    : DEFAULT_TABLE_RULES;
  const who = { isStaff, ruling: input.ruling };

  // Who it lands on.
  const targetId = input.targetCharacterId ?? characterId;
  const toOther = targetId !== characterId;
  let target = character;
  if (toOther) {
    if (!campaignId) throw new Error('NOT_AT_TABLE');
    const { receiver } = await tradingPair(characterId, campaignId, targetId);
    target = receiver;
  }

  // Charges before the turn pays: a wand with nothing in it does nothing,
  // and the refusal should not cost the action.
  let inventory = sheet.inventory;
  if (charges > 0) {
    const left = row.charges ?? charges;
    if (left <= 0) fence('NO_CHARGES', rules, who);
    inventory = inventory.map(i =>
      i.id === row.id ? { ...i, charges: Math.max(0, left - 1) } : i
    );
  }

  // The turn pays (05), in a fight, on the user's own turn.
  if (campaignId) {
    const enc = await db.query.initiativeEncounters.findFirst({
      columns: { id: true },
      where: and(
        eq(initiativeEncounters.campaignId, campaignId),
        eq(initiativeEncounters.isActive, true)
      ),
    });
    const mine = enc
      ? await db.query.initiativeEntries.findFirst({
          where: and(
            eq(initiativeEntries.encounterId, enc.id),
            eq(initiativeEntries.characterId, characterId)
          ),
        })
      : null;
    if (mine && enc) {
      const isPotion = use?.effect === 'heal' && data?.kind === 'consumable';
      const cost = toOther
        ? 'action'
        : isPotion
          ? rules.potionAction
          : (use?.action ?? 'action');
      if (cost === 'action' || cost === 'bonus') {
        await takeActionUnchecked(
          mine,
          campaignId,
          { userId, isStaff },
          cost === 'action' ? 'utilize' : 'bonus',
          { note: row.name, ruling: input.ruling }
        );
      }
    }
  }

  // The dice.
  let roll: NotationRoll | null = null;
  if (use?.dice) {
    const rolled = rollNotation(use.dice);
    if (rolled) {
      if (use.effect === 'heal' && rules.healingPotions === 'max') {
        const parsed = parseNotation(use.dice);
        const max = parsed
          ? parsed.terms.reduce((n, t) => n + t.count * t.sides, 0) +
            parsed.modifier
          : rolled.total;
        roll = { ...rolled, dice: rolled.dice.map(() => 0), total: max };
      } else {
        roll = rolled;
      }
    }
  }

  // What it does, on the target.
  const words: string[] = [];
  const targetSheet = target.sheet as CharacterSheet;
  const patch: PlayPatch = {};
  if (use && roll) {
    if (use.effect === 'heal') {
      patch.hpCurrentDelta = roll.total;
      words.push(`${roll.total} hit points`);
    } else if (use.effect === 'damage') {
      patch.hpCurrentDelta = -roll.total;
      words.push(`${roll.total} damage`);
    } else if (use.effect === 'temp-hp') {
      patch.hpTemp = Math.max(
        targetSheet.combat.hitPointsTemp ?? 0,
        roll.total
      );
      words.push(`${roll.total} temporary hit points`);
    }
  }
  if (use?.effect === 'restore-slot' && use.slot_level > 0) {
    const key = SLOT_KEYS[use.slot_level - 1];
    const slot = targetSheet.spellcasting.slots[key];
    if (slot) {
      patch.slot = {
        level: use.slot_level,
        expended: Math.max(0, slot.expended - 1),
      };
      words.push(`a level ${use.slot_level} slot back`);
    }
  }
  if (Object.keys(patch).length > 0) {
    await applyPlayPatchUnchecked(target, campaignId, patch);
  }
  if (use && (use.cure.length > 0 || use.condition)) {
    const current = new Set(
      ((target.sheet as CharacterSheet).combat.conditions ?? []) as string[]
    );
    for (const c of use.cure) {
      if (current.delete(c)) words.push(`no longer ${c}`);
    }
    if (use.condition) {
      current.add(use.condition);
      words.push(use.condition);
    }
    await writeConditions(target.id, [...current]);
  }

  // The row: consumed, or a charge down.
  if (use?.consumed) {
    const left = row.quantity - 1;
    inventory = inventory
      .map(i => (i.id === row.id ? { ...i, quantity: left } : i))
      .filter(i => i.id !== row.id || left > 0 || i.grantedBy);
  }
  const fresh = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  const freshSheet = (fresh?.sheet ?? sheet) as CharacterSheet;
  const nextInventory =
    // The patch above may have rewritten the user's own sheet (self-use):
    // apply the row change to whatever is there now.
    freshSheet.inventory
      .map(i => inventory.find(x => x.id === i.id) ?? i)
      .filter(i => inventory.some(x => x.id === i.id) || i.id !== row.id);
  const now = new Date().toISOString();
  await db
    .update(characters)
    .set({ sheet: { ...freshSheet, inventory: nextInventory }, updatedAt: now })
    .where(eq(characters.id, characterId));

  const verb =
    data?.kind === 'consumable' ? (toOther ? 'gives' : 'drinks') : 'uses';
  const line = `${character.name} ${verb} ${row.name}${
    toOther ? ` to ${target.name}` : ''
  }${words.length > 0 ? ` · ${words.join(' · ')}` : ''}`;
  await db.insert(characterHistory).values({
    characterId,
    actorUserId: userId,
    kind: 'inventory',
    field: `inventory.${row.id}`,
    fromValue: String(row.quantity),
    toValue: use?.consumed ? String(row.quantity - 1) : String(row.quantity),
    detail: line,
    occurredAt: now,
  });

  if (campaignId) {
    if (roll) {
      await db.insert(campaignRolls).values({
        campaignId,
        actorUserId: userId,
        characterId,
        actorName: character.name,
        label: `${row.name}${toOther ? ` · for ${target.name}` : ''}`.slice(
          0,
          80
        ),
        notation: roll.notation.slice(0, 60),
        dice: roll.dice,
        dropped: roll.dropped,
        modifier: roll.modifier,
        total: roll.total,
        visibility: 'table',
      });
    }
    bumpVersion(campaignId);
    if (toOther) {
      publish(
        campaignId,
        {
          kind: 'gift',
          id: randomUUID(),
          at: now,
          by: userId,
          fromName: character.name,
          toName: target.name,
          what: `${row.name}${words.length > 0 ? ` · ${words.join(' · ')}` : ''}`,
        },
        { users: [...new Set([character.ownerId, target.ownerId])] }
      );
    }
  }

  return {
    loadout: await getPlayLoadout(characterId, campaignId),
    roll,
    words: line,
  };
}
