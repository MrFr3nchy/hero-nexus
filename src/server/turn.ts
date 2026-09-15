/**
 * The turn, on the server: what a combatant spends, and who may spend it.
 *
 * `initiative_entries.turn` holds one `TurnState` per row (0050). This module
 * is the only writer of it besides `advanceTurn`'s reset and `moveToken`'s
 * feet — both of which call in here — so "has the goblin acted" has one
 * answer. The rules of *what a slot is* live in `campaign/lib/turn.ts`, pure;
 * the table's mode (01) decides whether a spent slot is a refusal or a note,
 * and `canAct` (04) whether there was a turn to spend at all.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { canAct, speedFor } from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import {
  actionDef,
  applyAction,
  beginTurn,
  movementBudget,
  parseTurn,
  slotFor,
  spend,
  type ActionKey,
  type TurnState,
} from '@/@creator/campaign/lib/turn';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  parseContentData,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import { db } from '@/db';
import {
  battleMapTokens,
  campaignMembers,
  characters,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { resolveContentRefs } from './content';
import { bumpVersion, publish, type Audience } from './live-hub';
import { effectiveRules, fence } from './table-rules';

type Entry = typeof initiativeEntries.$inferSelect;

/** The default a monster walks at when its block is not to hand. */
const DEFAULT_SPEED_FEET = 30;

/**
 * Who may spend this combatant's turn: its player, or staff. The same gate
 * `moveToken` applies to a token, on the entry behind it.
 */
export async function authorizeEntry(entryId: string): Promise<{
  entry: Entry;
  campaignId: string;
  userId: string;
  isStaff: boolean;
}> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true },
    where: eq(initiativeEncounters.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  const { role, userId } = await requireCampaignRole(enc.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  if (!isStaff) {
    const seat = await db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, enc.campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    if (!entry.characterId || seat?.characterId !== entry.characterId) {
      throw new Error('FORBIDDEN');
    }
  }
  return { entry, campaignId: enc.campaignId, userId, isStaff };
}

/**
 * How far this combatant walks in a turn, after conditions and exhaustion:
 * a seated hero off the sheet, a dealt-in monster off its block, a
 * hand-typed foe at the default.
 */
export async function speedOfEntry(entry: Entry): Promise<number> {
  let base = DEFAULT_SPEED_FEET;
  let exhaustion = 0;
  if (entry.characterId) {
    const character = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    const sheet = character?.sheet as CharacterSheet | undefined;
    base = sheet?.combat?.speed ?? base;
    exhaustion = sheet?.combat?.exhaustion ?? 0;
  } else if (entry.creatureRef) {
    const resolved = await resolveContentRefs([
      entry.creatureRef as ContentRef,
    ]);
    const block = [...resolved.values()][0];
    if (block) {
      const d = parseContentData('creature', block.data) as CreatureData;
      if (d.speed.walk > 0) base = d.speed.walk;
    }
  }
  return speedFor(base, parseConditions(entry.conditionKeys), exhaustion);
}

/** The entry whose turn it is in this fight, or null. */
export async function currentEntryId(
  encounterId: string
): Promise<string | null> {
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { turnIndex: true, isActive: true },
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) return null;
  const rows = await db
    .select({
      id: initiativeEntries.id,
      initiative: initiativeEntries.initiative,
      sort: initiativeEntries.sort,
    })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const ordered = [...rows].sort(
    (a, b) => b.initiative - a.initiative || a.sort - b.sort
  );
  return ordered[enc.turnIndex]?.id ?? null;
}

/**
 * Who hears about a combatant's action. A foe the DM has not revealed on the
 * board acts behind the screen; everybody else's turn is the table's.
 */
async function audienceFor(entry: Entry): Promise<Audience> {
  if (entry.side === 'party') return 'everyone';
  const token = await db.query.battleMapTokens.findFirst({
    columns: { visibility: true },
    where: eq(battleMapTokens.entryId, entry.id),
  });
  return token?.visibility === 'dm' ? 'staff' : 'everyone';
}

async function writeTurn(entryId: string, turn: TurnState): Promise<void> {
  await db
    .update(initiativeEntries)
    .set({ turn })
    .where(eq(initiativeEntries.id, entryId));
}

/**
 * Take an action. A player for their own seated character, staff for anyone.
 *
 * Two fences, both the table's (01): `INCAPACITATED` when `canAct` says the
 * slot does not exist this turn, `ALREADY_ACTED` when it is spent. Advising,
 * both record anyway and the line is marked "again"; enforcing, they refuse,
 * and staff may rule past. Movement-side entries (Jump, Stand) spend feet,
 * not a slot.
 */
export async function takeAction(
  entryId: string,
  key: ActionKey,
  opts: { note?: string; ruling?: boolean } = {}
): Promise<TurnState> {
  const { entry, campaignId, userId, isStaff } = await authorizeEntry(entryId);
  return takeActionUnchecked(entry, campaignId, { userId, isStaff }, key, opts);
}

/**
 * The spend behind `takeAction`, for server code that has already decided
 * who may — a spell resumed on a fellow player's yes spends the caster's
 * action although the caster is not the one pressing (07). `who` is the
 * combatant's own player, for the log and the fence.
 */
export async function takeActionUnchecked(
  entry: Entry,
  campaignId: string,
  actor: { userId: string; isStaff: boolean },
  key: ActionKey,
  opts: { note?: string; ruling?: boolean } = {}
): Promise<TurnState> {
  const def = actionDef(key);
  if (!def) throw new Error('NO_SUCH_ACTION');
  const { userId, isStaff } = actor;
  const entryId = entry.id;
  const note = (opts.note ?? '').trim().slice(0, 120);
  if (def.note === 'required' && !note) throw new Error('NEEDS_A_NOTE');

  const rules = await effectiveRules(campaignId, entry.encounterId);
  const who = { isStaff, ruling: opts.ruling };
  const conditions = parseConditions(entry.conditionKeys);
  const allowance = canAct(conditions);
  const slot = slotFor(def);

  let ruling = false;
  if (slot && slot !== 'interaction' && !allowance[slot]) {
    ruling = fence('INCAPACITATED', rules, who) || ruling;
  }
  if (slot === null && !allowance.move) {
    ruling = fence('INCAPACITATED', rules, who) || ruling;
  }

  const before = parseTurn(entry.turn);
  let again = false;
  let next = before;
  if (slot) {
    const spent = spend(before, slot);
    if (spent === null) {
      ruling = fence('ALREADY_ACTED', rules, who) || ruling;
      again = true;
    } else {
      next = spent;
    }
  }
  const speed = await speedOfEntry(entry);
  next = applyAction(next, key, note, speed);
  // Readying again replaces what was held; spending the reaction on the
  // held action clears it, so the nudge stops.
  if (key === 'reaction' || key === 'opportunity') {
    const { ready: _held, ...rest } = next;
    void _held;
    next = rest;
  }

  await writeTurn(entryId, next);
  bumpVersion(campaignId);
  publish(
    campaignId,
    {
      kind: 'action',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorLabel: entry.label,
      action: def.label,
      cost: def.cost,
      note,
      again,
      ruling,
      what: 'took',
    },
    await audienceFor(entry)
  );
  return next;
}

/**
 * Hand a turn back unspent — the DM correcting a mis-tap. Staff only, quiet.
 */
export async function resetTurn(entryId: string): Promise<void> {
  const { entry, campaignId, isStaff } = await authorizeEntry(entryId);
  if (!isStaff) throw new Error('FORBIDDEN');
  await writeTurn(entryId, beginTurn(parseTurn(entry.turn)));
  bumpVersion(campaignId);
}

/**
 * The turn comes round for `entryId`: its slots reset, Dodge ends, the
 * reaction returns. Then, for everyone else still holding a Ready, a
 * staff-only nudge — the moment the trigger describes may be now. Called by
 * `advanceTurn` under the staff check it already made.
 */
export async function beginEntryTurn(
  campaignId: string,
  encounterId: string,
  entryId: string | null,
  byUserId: string
): Promise<void> {
  const rows = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  for (const row of rows) {
    const turn = parseTurn(row.turn);
    if (row.id === entryId) {
      await writeTurn(row.id, beginTurn(turn));
      continue;
    }
    if (turn.ready) {
      publish(
        campaignId,
        {
          kind: 'action',
          id: randomUUID(),
          at: new Date().toISOString(),
          by: byUserId,
          actorLabel: row.label,
          action: turn.ready.action || 'the readied action',
          cost: 'reaction',
          note: turn.ready.trigger,
          again: false,
          ruling: false,
          what: 'holding',
        },
        'staff'
      );
    }
  }
}

/* --- movement ------------------------------------------------------------- */

/**
 * Price a move against the turn and, when the table fences movement, refuse
 * one that does not fit. Called by `moveToken` after the destination itself
 * passed; returns nothing when the token stands for nobody or it is not that
 * combatant's turn (the DM tidying the board spends nobody's feet).
 *
 * `costFeet` is the cheapest path the board found, or the straight distance
 * when no path exists. Advising, the feet are still recorded so the strip
 * reads "35 of 30"; enforcing with `movementFence`, `TOO_FAR` — overridable.
 */
export async function spendMovement(
  entry: Entry,
  costFeet: number,
  who: { isStaff: boolean; ruling?: boolean }
): Promise<{ ruling: boolean } | null> {
  const current = await currentEntryId(entry.encounterId);
  if (current !== entry.id) return null;

  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { campaignId: true, isActive: true },
    where: eq(initiativeEncounters.id, entry.encounterId),
  });
  if (!enc?.isActive) return null;

  const turn = parseTurn(entry.turn);
  const budget = movementBudget(turn, await speedOfEntry(entry));
  let ruling = false;
  if (costFeet > budget) {
    const rules = await effectiveRules(enc.campaignId, entry.encounterId);
    if (rules.movementFence) ruling = fence('TOO_FAR', rules, who);
  }
  await writeTurn(entry.id, {
    ...turn,
    movedFeet: turn.movedFeet + Math.max(0, Math.trunc(costFeet)),
  });
  return { ruling };
}

/* --- the free hand ---------------------------------------------------------- */

/**
 * Drawing or stowing during your own turn. 2024 gives one free object
 * interaction a turn; the second swap is the Utilize action. Off the
 * character's turn, or with no fight running, nothing is spent — you can
 * change your grip between scenes. Advising, a second swap is recorded and
 * that is all; enforcing, it is refused once the action is gone too.
 *
 * Called by `applyLoadoutPatch`, which has already authorised the writer.
 */
export async function spendWeaponSwap(
  characterId: string,
  campaignId: string,
  who: { isStaff: boolean; ruling?: boolean }
): Promise<void> {
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { id: true },
    where: and(
      eq(initiativeEncounters.campaignId, campaignId),
      eq(initiativeEncounters.isActive, true)
    ),
  });
  if (!enc) return;
  const entry = await db.query.initiativeEntries.findFirst({
    where: and(
      eq(initiativeEntries.encounterId, enc.id),
      eq(initiativeEntries.characterId, characterId)
    ),
  });
  if (!entry) return;
  if ((await currentEntryId(enc.id)) !== entry.id) return;

  const turn = parseTurn(entry.turn);
  const free = spend(turn, 'interaction');
  if (free) {
    await writeTurn(entry.id, free);
    return;
  }
  const action = spend(turn, 'action');
  if (!action) {
    const rules = await effectiveRules(campaignId, enc.id);
    fence('ALREADY_ACTED', rules, who);
    return;
  }
  await writeTurn(entry.id, action);
}
