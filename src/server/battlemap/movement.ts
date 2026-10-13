import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import {
  distanceFeet,
  footprintTiles,
  landingFor,
  linkCostFeet,
  linksUnder,
  reachFor,
  standingIssue,
  type Occupant,
  type Tile,
} from '@/@creator/campaign/lib/battlemap';
import {
  inBounds,
  levelOf,
  linkOtherEnd,
  normalizeBoard,
} from '@/@shared/battlemap/types';

import { randomUUID } from 'node:crypto';
import {
  parseContentData,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  campaignMembers,
  initiativeEntries,
} from '@/db/schema';
import { requireCampaignRole } from '../campaigns';
import { bumpVersion, publish } from '../live-hub';
import { recordUndo } from '../undo';
import { resolveContentRefs } from '../content';
import { effectiveRules, fence } from '../table-rules';
import { spendMovement } from '../turn';
import { parseTurn } from '@/@creator/campaign/lib/turn';
import { pathBetween } from '@/@creator/campaign/lib/things';
import { blocksStanding } from '@/@shared/battlemap/types';
import { isStaffRole, levelFor } from './shared';
import { occupantsExcept } from './tokens';
import { fireThing, nudgeNearHidden, trapOnPath } from './traps';
import { PARTY_SIGHT_FEET, revealFromPartyUnchecked } from './fog';

/**
 * Moving a token: the rules a move is checked against, taking a stair or a
 * ladder, and the opportunity attacks a move provokes.
 */
/**
 * A standing refusal, sorted into the two kinds `standingIssue` tells apart.
 *
 * Off the board, on no board, or on somebody: refused for everyone, always.
 * Lava or a pillar: the rules, so it goes through the table's fence — nothing
 * advising, a refusal staff can overrule enforcing.
 */
export async function refuseStanding(
  issue: ReturnType<typeof standingIssue>,
  campaignId: string,
  encounterId: string | null,
  who: { isStaff: boolean; ruling?: boolean }
): Promise<void> {
  if (issue === null) return;
  if (issue !== 'terrain') throw new Error('CANNOT_STAND_THERE');
  const rules = await effectiveRules(campaignId, encounterId);
  fence('CANNOT_STAND_THERE', rules, who);
}

/**
 * Move a token. The one write a player may make to the board.
 *
 * A player may move a token for their own seated character and nothing else;
 * staff may move anything. The destination is checked against the rules —
 * bounds, void, occupancy — and refused rather than trusted.
 *
 * Distance is the table's call (01 + 05): on the mover's own turn the move
 * is priced by the cheapest path and spent from the turn's budget. Advising,
 * a long move is recorded and the strip says so; enforcing with
 * `movementFence`, it is refused as `TOO_FAR`, which staff may overrule. Off
 * the mover's turn — the DM tidying the board — nobody's feet are spent.
 *
 * Then the offer: every hostile with its reaction whose reach the mover just
 * left, without Disengaging, is told it may take an opportunity attack.
 * Told, not made to — the app never swings for anybody.
 */
export async function moveToken(
  tokenId: string,
  destination: { x: number; y: number },
  opts: { ruling?: boolean } = {}
): Promise<void> {
  let to = { x: destination.x, y: destination.y };
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, token.mapId),
  });
  if (!map) throw new Error('NOT_FOUND');

  const { role, userId } = await requireCampaignRole(map.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);

  if (!isStaffRole(role)) {
    if (!token.entryId) throw new Error('NOT_YOUR_TOKEN');
    const membership = await db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, map.campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    const entry = await db.query.initiativeEntries.findFirst({
      columns: { characterId: true },
      where: eq(initiativeEntries.id, token.entryId),
    });
    if (
      !membership?.characterId ||
      !entry?.characterId ||
      entry.characterId !== membership.characterId
    ) {
      throw new Error('NOT_YOUR_TOKEN');
    }
  }

  const board = normalizeBoard(map.terrain);
  const doc = levelFor(board, token);
  if (!inBounds(doc, to.x, to.y)) throw new Error('CANNOT_STAND_THERE');
  const who = { isStaff: isStaffRole(role), ruling: opts.ruling };
  await refuseStanding(
    standingIssue(
      doc,
      { x: to.x, y: to.y, footprint: token.footprint },
      await occupantsExcept(map.id, tokenId, doc.id)
    ),
    map.campaignId,
    map.encounterId,
    who
  );

  /*
   * The turn's feet. Priced the way the board lights reach — the cheapest
   * path through this terrain among these tokens — so a player is refused
   * only what the board already showed them was out of reach. Where no path
   * exists (a wall between, and they were dragged over it) the straight
   * distance stands in. Before the write, so a refusal moves nothing.
   */
  const entry = token.entryId
    ? await db.query.initiativeEntries.findFirst({
        where: eq(initiativeEntries.id, token.entryId),
      })
    : null;
  // Everything on this floor. The floors below and above are as far away
  // as another board: nothing there blocks, threatens or prices this move.
  const all = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => levelFor(board, t).id === doc.id);
  const entryIds = all
    .map(t => t.entryId)
    .filter((id): id is string => id !== null);
  const entries =
    entryIds.length > 0
      ? await db
          .select()
          .from(initiativeEntries)
          .where(inArray(initiativeEntries.id, entryIds))
      : [];
  const sideOf = new Map(entries.map(e => [e.id, e.side as string]));

  /*
   * The path, tile by tile, before anything is written: a plate on the
   * way goes off under the mover and the move stops there (08). A move no
   * path reaches — staff dragging over a wall — is a jump that crosses
   * nothing. The destination `to` may move here; everything after reads it.
   */
  let trap: {
    thing: typeof battleMapTokens.$inferSelect;
    stopAt: Tile;
  } | null = null;
  if (entry && (token.x !== to.x || token.y !== to.y)) {
    const blockedTiles = new Set<number>();
    for (const t of all) {
      if (t.id === token.id || !blocksStanding(t)) continue;
      // Allies are walked through; only the destination tile is refused,
      // and `standingIssue` already did that.
      const ally = t.entryId && entry.side === (sideOf.get(t.entryId) ?? null);
      if (ally) continue;
      for (const i of footprintTiles(doc, t)) blockedTiles.add(i);
    }
    const path = pathBetween(doc, { x: token.x, y: token.y }, to, blockedTiles);
    if (path) {
      trap = await trapOnPath(map, doc, path, {
        footprint: token.footprint,
        side: entry.side,
      });
      if (trap) to = { x: trap.stopAt.x, y: trap.stopAt.y };
    }
  }

  const me: Occupant = { x: to.x, y: to.y, footprint: token.footprint };
  let spent: { ruling: boolean } | null = null;
  if (entry && (token.x !== to.x || token.y !== to.y)) {
    const asReach = (t: typeof token) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      footprint: t.footprint,
      side: t.entryId ? (sideOf.get(t.entryId) ?? null) : null,
    });
    const costs = reachFor(
      doc,
      asReach(token),
      all.filter(t => t.id !== token.id && blocksStanding(t)).map(asReach),
      10_000
    );
    const cost =
      costs.get(to.y * doc.w + to.x) ??
      distanceFeet({ x: token.x, y: token.y }, to);
    spent = await spendMovement(entry, cost, who);
  }

  await db
    .update(battleMapTokens)
    .set({ x: to.x, y: to.y, updatedAt: new Date().toISOString() })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
  // The DM's undo (11): the square it stood on, and the feet it spent.
  if (isStaffRole(role) && (token.x !== to.x || token.y !== to.y)) {
    const from = { x: token.x, y: token.y };
    const turnBefore = entry?.turn ?? null;
    recordUndo(map.campaignId, {
      label: `Move ${entry?.label ?? token.label ?? 'a token'} back to ${from.x},${from.y}`,
      inverse: async () => {
        await db
          .update(battleMapTokens)
          .set({ x: from.x, y: from.y, updatedAt: new Date().toISOString() })
          .where(eq(battleMapTokens.id, tokenId));
        if (entry && turnBefore !== null) {
          await db
            .update(initiativeEntries)
            .set({ turn: turnBefore })
            .where(eq(initiativeEntries.id, entry.id));
        }
      },
    });
  }

  if (entry && spent && !parseTurn(entry.turn).disengaged) {
    await offerOpportunityAttacks(
      map.campaignId,
      entry,
      { x: token.x, y: token.y, footprint: token.footprint },
      me,
      all.filter(t => t.id !== token.id),
      entries,
      userId
    );
  }

  // The plate goes off under them; then, standing still, whether they are
  // beside anything else they have not found.
  if (entry && trap) {
    await fireThing(trap.thing.id, { userId, actorName: entry.label });
  }
  if (entry) await nudgeNearHidden(map, { ...to, level: doc.id }, entry);
}

/**
 * Take the stairs. The one move that changes floors.
 *
 * The token must be standing on the link — every link stands on both of
 * its floors — and lands on the far floor on the same tile, or the first
 * tile of the stairwell with room. Priced as the climb (`linkCostFeet`)
 * and spent from the turn the way a step is, under the same fence; a
 * player takes only their own token, staff anybody's. A hidden stair is
 * the DM's to offer: a player is refused it as if it were not there.
 *
 * Leaving a floor is leaving every hostile's reach on it, so the offer of
 * opportunity attacks is made from where the token stood. A hero who
 * lands looks around: the far floor is revealed from where they stand,
 * so a player whose token climbs into the dark sees their own landing.
 */
export async function takeLink(
  tokenId: string,
  linkId: string,
  opts: { ruling?: boolean } = {}
): Promise<{ level: string; x: number; y: number }> {
  const token = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!token) throw new Error('NOT_FOUND');
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, token.mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  const { role, userId } = await requireCampaignRole(map.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);
  if (!isStaff) {
    if (!token.entryId) throw new Error('NOT_YOUR_TOKEN');
    const membership = await db.query.campaignMembers.findFirst({
      columns: { characterId: true },
      where: and(
        eq(campaignMembers.campaignId, map.campaignId),
        eq(campaignMembers.userId, userId)
      ),
    });
    const entry = await db.query.initiativeEntries.findFirst({
      columns: { characterId: true },
      where: eq(initiativeEntries.id, token.entryId),
    });
    if (
      !membership?.characterId ||
      !entry?.characterId ||
      entry.characterId !== membership.characterId
    ) {
      throw new Error('NOT_YOUR_TOKEN');
    }
  }

  const board = normalizeBoard(map.terrain);
  const here = levelFor(board, token);
  const link = board.links.find(l => l.id === linkId);
  if (!link || (link.hidden && !isStaff)) throw new Error('NO_SUCH_STAIR');
  const otherId = linkOtherEnd(link, here.id);
  if (otherId === null) throw new Error('NOT_ON_THE_STAIR');
  const me: Occupant = { x: token.x, y: token.y, footprint: token.footprint };
  if (!linksUnder(board, here.id, me).some(l => l.id === link.id)) {
    throw new Error('NOT_ON_THE_STAIR');
  }
  const there = levelOf(board, otherId);
  const others = await occupantsExcept(map.id, tokenId, there.id);
  const landing = landingFor(there, link, me, others);
  if (!landing) throw new Error('NO_ROOM_THERE');
  const who = { isStaff, ruling: opts.ruling };
  await refuseStanding(
    standingIssue(there, { ...landing, footprint: token.footprint }, others),
    map.campaignId,
    map.encounterId,
    who
  );

  const entry = token.entryId
    ? await db.query.initiativeEntries.findFirst({
        where: eq(initiativeEntries.id, token.entryId),
      })
    : null;
  let spent: { ruling: boolean } | null = null;
  if (entry) {
    spent = await spendMovement(entry, linkCostFeet(board, link, here.id), who);
  }

  // Who could swing as they leave: everybody hostile on the floor they are
  // leaving, from where they stood. Read before the write.
  const onThisFloor = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => t.id !== token.id && levelFor(board, t).id === here.id);
  const entryIds = onThisFloor
    .map(t => t.entryId)
    .filter((id): id is string => id !== null);
  const entries =
    entryIds.length > 0
      ? await db
          .select()
          .from(initiativeEntries)
          .where(inArray(initiativeEntries.id, entryIds))
      : [];

  await db
    .update(battleMapTokens)
    .set({
      x: landing.x,
      y: landing.y,
      level: there.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);

  if (isStaff) {
    const from = { x: token.x, y: token.y, level: here.id };
    const turnBefore = entry?.turn ?? null;
    recordUndo(map.campaignId, {
      label: `Put ${entry?.label ?? token.label ?? 'a token'} back on the ${here.name || 'floor below'}`,
      inverse: async () => {
        await db
          .update(battleMapTokens)
          .set({ ...from, updatedAt: new Date().toISOString() })
          .where(eq(battleMapTokens.id, tokenId));
        if (entry && turnBefore !== null) {
          await db
            .update(initiativeEntries)
            .set({ turn: turnBefore })
            .where(eq(initiativeEntries.id, entry.id));
        }
      },
    });
  }

  if (entry && spent && !parseTurn(entry.turn).disengaged) {
    await offerOpportunityAttacks(
      map.campaignId,
      entry,
      me,
      // Gone from the floor: further than any reach.
      { x: -1000, y: -1000, footprint: token.footprint },
      onThisFloor,
      entries,
      userId
    );
  }

  if (entry?.side === 'party' && token.visibility === 'shared') {
    await revealFromPartyUnchecked(map, PARTY_SIGHT_FEET, { tokenId });
  }
  if (entry) {
    await nudgeNearHidden(map, { ...landing, level: there.id }, entry);
  }
  publish(map.campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName: entry?.label ?? token.label ?? 'Somebody',
    name: link.name || (link.kind === 'ladder' ? 'the ladder' : 'the stairs'),
    what: there.feet > here.feet ? 'climbed' : 'descended',
    detail: there.name,
  });
  return { level: there.id, x: landing.x, y: landing.y };
}

/**
 * Who could swing as the mover leaves. A hostile is any combatant on another
 * side; its reach is 5 ft, or 10 when its block says so. The mover was in
 * reach and is not any more, and the hostile has its reaction: an
 * `opportunity` event goes to the hostile's owner — staff for a foe, the
 * seated player for a hero — and it is theirs to take or leave.
 */
async function offerOpportunityAttacks(
  campaignId: string,
  mover: typeof initiativeEntries.$inferSelect,
  from: Occupant,
  to: Occupant,
  others: (typeof battleMapTokens.$inferSelect)[],
  entries: (typeof initiativeEntries.$inferSelect)[],
  byUserId: string
): Promise<void> {
  const byId = new Map(entries.map(e => [e.id, e]));
  for (const t of others) {
    const hostile = t.entryId ? byId.get(t.entryId) : undefined;
    if (!hostile || hostile.side === mover.side) continue;
    if (parseTurn(hostile.turn).reaction) continue;
    // Down, incapacitated or otherwise unable to react: no offer.
    if (hostile.hpCurrent !== null && hostile.hpCurrent <= 0) continue;
    const reach = await reachOf(hostile);
    const at = { x: t.x, y: t.y, footprint: t.footprint };
    const before = distanceFeet(from, at);
    const after = distanceFeet(to, at);
    if (before > reach || after <= reach) continue;

    let audience: 'staff' | { users: string[] } = 'staff';
    if (hostile.characterId) {
      const seat = await db.query.campaignMembers.findFirst({
        columns: { userId: true },
        where: and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.characterId, hostile.characterId)
        ),
      });
      if (seat) audience = { users: [seat.userId] };
    }
    publish(
      campaignId,
      {
        kind: 'opportunity',
        id: randomUUID(),
        at: new Date().toISOString(),
        by: byUserId,
        attackerLabel: hostile.label,
        attackerEntryId: hostile.id,
        moverLabel: mover.label,
      },
      audience
    );
  }
}

/**
 * How far a combatant can swing: 10 ft when its block's actions say
 * "reach 10 ft.", else 5. A hero's reach weapon is not read here yet — the
 * equipped weapon is 06's business, and 5 ft is the honest default.
 */
async function reachOf(
  entry: typeof initiativeEntries.$inferSelect
): Promise<number> {
  if (!entry.creatureRef) return 5;
  const resolved = await resolveContentRefs([entry.creatureRef as ContentRef]);
  const block = [...resolved.values()][0];
  if (!block) return 5;
  const d = parseContentData('creature', block.data) as CreatureData;
  const text = d.actions.map(a => a.desc).join(' ');
  return /reach\s+10\s*ft/i.test(text) ? 10 : 5;
}
