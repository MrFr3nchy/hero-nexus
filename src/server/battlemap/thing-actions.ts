import 'server-only';
import { and, eq } from 'drizzle-orm';

import { normalizeBoard, type ItemState } from '@/@shared/battlemap/types';
import { skillBonus } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import { d20Faces, d20Result, type NotationRoll } from '@/@shared/lib/dice';
import { randomUUID } from 'node:crypto';

import { db } from '@/db';
import {
  battleMapTokens,
  battleMaps,
  campaignMembers,
  campaignRolls,
  characters,
  initiativeEntries,
  users,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from '../campaigns';
import { bumpVersion, publish } from '../live-hub';
import { claimedFaces } from '../dice-claims';

import { normalizeThingEffect } from '@/@shared/battlemap/types';
import { isStaffRole, levelFor } from './shared';
import { fireThing } from './traps';

/**
 * Doing something to a thing: operating it, picking its lock, breaking it.
 */
/**
 * Whether the reader's own character is beside a thing on the board — one
 * tile away from any tile of its footprint. Staff reach everything; a player
 * has to be there, which is what "I open the door" means at a table.
 */
async function withinReach(
  map: typeof battleMaps.$inferSelect,
  thing: typeof battleMapTokens.$inferSelect,
  userId: string,
  role: CampaignRole
): Promise<boolean> {
  if (isStaffRole(role)) return true;
  const seat = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: and(
      eq(campaignMembers.campaignId, map.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  if (!seat?.characterId || !map.encounterId) return false;
  const mine = await db
    .select({
      x: battleMapTokens.x,
      y: battleMapTokens.y,
      level: battleMapTokens.level,
      footprint: battleMapTokens.footprint,
    })
    .from(battleMapTokens)
    .innerJoin(
      initiativeEntries,
      eq(initiativeEntries.id, battleMapTokens.entryId)
    )
    .where(
      and(
        eq(battleMapTokens.mapId, map.id),
        eq(initiativeEntries.encounterId, map.encounterId),
        eq(initiativeEntries.characterId, seat.characterId)
      )
    );
  const gap = (a: number, aSize: number, b: number, bSize: number) =>
    Math.max(0, Math.max(a, b) - Math.min(a + aSize, b + bSize) + 1);
  const board = normalizeBoard(map.terrain);
  return mine.some(
    m =>
      levelFor(board, m).id === levelFor(board, thing).id &&
      gap(m.x, m.footprint, thing.x, thing.footprint) <= 1 &&
      gap(m.y, m.footprint, thing.y, thing.footprint) <= 1
  );
}

async function thingAndMap(tokenId: string) {
  const thing = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!thing) throw new Error('NOT_FOUND');
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, thing.mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  const { userId, role } = await requireCampaignRole(map.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  // A combatant is not a thing to open.
  if (thing.entryId) throw new Error('NOT_A_THING');
  return { thing, map, userId, role };
}

export async function nameOf(
  userId: string,
  campaignId: string
): Promise<string> {
  const seat = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  if (seat?.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { name: true },
      where: eq(characters.id, seat.characterId),
    });
    if (c?.name) return c.name;
  }
  const u = await db.query.users.findFirst({
    columns: { name: true },
    where: eq(users.id, userId),
  });
  return u?.name?.trim() || 'The DM';
}

/**
 * Open or close a thing. Anyone beside it; a locked thing refuses, and says
 * so — the lock is picked or the thing is broken, not argued with.
 */
export async function operateThing(
  tokenId: string,
  verb: 'open' | 'close'
): Promise<void> {
  const { thing, map, userId, role } = await thingAndMap(tokenId);
  if (thing.state === null) throw new Error('NOTHING_TO_DO');
  if (thing.state === 'broken') throw new Error('BROKEN');
  if (thing.state === 'locked') throw new Error('LOCKED');
  if (!(await withinReach(map, thing, userId, role))) {
    throw new Error('OUT_OF_REACH');
  }
  const next: ItemState = verb === 'open' ? 'open' : 'closed';
  if (next === thing.state) return;
  await db
    .update(battleMapTokens)
    .set({ state: next, updatedAt: new Date().toISOString() })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
  const actorName = await nameOf(userId, map.campaignId);
  publish(map.campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName,
    name: thing.label || 'Something',
    what: next === 'open' ? 'opened' : 'closed',
  });
  // A lever does what it does (08).
  if (normalizeThingEffect(thing.effect)?.trigger === 'operate') {
    await fireThing(tokenId, { userId, actorName });
  }
}

/**
 * Pick the lock. Rolled on the server as a Dexterity (Sleight of Hand) check
 * off the reader's own sheet against the DC the DM set, the way every other
 * roll here is — a number the browser produced is a claim, not a record.
 * The roll lands in the shared log either way; the DC does not, and the
 * verdict says only whether the lock gave.
 */
export async function pickLock(
  tokenId: string,
  mode: 'straight' | 'advantage' | 'disadvantage' = 'straight',
  faces?: number[]
): Promise<{
  total: number;
  opened: boolean;
  /** The roll as the log has it, for the tray. */
  roll: NotationRoll;
  physical: boolean;
}> {
  const { thing, map, userId, role } = await thingAndMap(tokenId);
  if (thing.state !== 'locked') throw new Error('NOT_LOCKED');
  if (!(await withinReach(map, thing, userId, role))) {
    throw new Error('OUT_OF_REACH');
  }
  const claimed = await claimedFaces(map.campaignId, isStaffRole(role), faces);

  const seat = await db.query.campaignMembers.findFirst({
    columns: { characterId: true },
    where: and(
      eq(campaignMembers.campaignId, map.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  const character = seat?.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, seat.characterId),
      })
    : null;
  const bonus = character
    ? skillBonus(character.sheet as CharacterSheet, 'sleightOfHand')
    : 0;

  const dice = d20Faces(mode, claimed);
  if (!dice) throw new Error('BAD_FACES');
  const { face, dropped } = d20Result(mode, dice);
  const total = face + bonus;
  // No DC set is a lock that always gives: the DM said "locked" and not how
  // hard, and a lock nobody can ever pick is a wall.
  const opened = total >= (thing.lockDc ?? 10);
  const name = thing.label || 'the lock';

  await db.insert(campaignRolls).values({
    campaignId: map.campaignId,
    actorUserId: userId,
    characterId: character?.id ?? null,
    actorName: character?.name ?? (await nameOf(userId, map.campaignId)),
    label: `Pick the lock — ${name}`.slice(0, 80),
    notation: `${dice.length}d20${bonus >= 0 ? '+' : ''}${bonus}`,
    dice,
    dropped,
    modifier: bonus,
    total,
    visibility: 'table',
    physical: claimed !== undefined,
  });
  if (opened) {
    await db
      .update(battleMapTokens)
      .set({ state: 'closed', updatedAt: new Date().toISOString() })
      .where(eq(battleMapTokens.id, tokenId));
  }
  bumpVersion(map.campaignId);
  publish(map.campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorName: character?.name ?? (await nameOf(userId, map.campaignId)),
    name: thing.label || 'Something',
    what: opened ? 'unlocked' : 'held',
  });
  return {
    total,
    opened,
    roll: {
      notation: `${dice.length}d20${bonus >= 0 ? '+' : ''}${bonus}`,
      dice,
      dropped,
      modifier: bonus,
      total,
    },
    physical: claimed !== undefined,
  };
}

/**
 * Damage or mend a thing with hit points. Staff only, the way `applyHp` is
 * for a foe: the player rolls at it through the attacks panel and the DM
 * applies what landed. Broken at 0, and a broken thing no longer blocks.
 */
export async function damageThing(
  tokenId: string,
  delta: number
): Promise<void> {
  const { thing, map, userId, role } = await thingAndMap(tokenId);
  if (!isStaffRole(role)) throw new Error('FORBIDDEN');
  if (thing.hpMax === null) throw new Error('INDESTRUCTIBLE');
  const before = thing.hpCurrent ?? thing.hpMax;
  const after = Math.max(0, Math.min(thing.hpMax, before + Math.trunc(delta)));
  const broken = after === 0;
  await db
    .update(battleMapTokens)
    .set({
      hpCurrent: after,
      // Mended above zero, a broken thing is closed again, not open: a
      // repaired door is a door.
      state: broken
        ? 'broken'
        : thing.state === 'broken'
          ? 'closed'
          : thing.state,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));
  bumpVersion(map.campaignId);
  const actorName = await nameOf(userId, map.campaignId);
  if (broken && before > 0) {
    publish(map.campaignId, {
      kind: 'thing',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName,
      name: thing.label || 'Something',
      what: 'broken',
    });
  }
  // A cracked dam, a collapsing pillar (08).
  const effect = normalizeThingEffect(thing.effect);
  if (delta < 0 && effect?.trigger === 'damage') {
    await fireThing(tokenId, { userId, actorName });
  } else if (broken && before > 0 && effect?.trigger === 'destroy') {
    await fireThing(tokenId, { userId, actorName });
  }
}
