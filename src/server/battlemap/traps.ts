import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import {
  distanceFeet,
  footprintTiles,
  type Tile,
} from '@/@creator/campaign/lib/battlemap';
import {
  levelOf,
  normalizeBoard,
  withLevel,
  type LevelDoc,
} from '@/@shared/battlemap/types';
import { skillBonus } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import { rollDie } from '@/@shared/lib/dice';
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
  campaignRolls,
  characters,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { requireCampaignRole } from '../campaigns';
import { bumpVersion, publish } from '../live-hub';
import { resolveContentRefs } from '../content';
import {
  applyTerrainChanges,
  isTerrainChange,
} from '@/@creator/campaign/lib/things';
import { adjustDamage } from '@/@creator/campaign/lib/attack';
import { parseConditions } from '@/@creator/campaign/lib/conditions';
import {
  abilityModifier,
  passivePerception,
  savingThrow,
} from '@/@creator/character/lib/derive';
import type { AbilityKey } from '@/@creator/character/schema';
import { rollNotation } from '@/@shared/lib/dice';
import {
  normalizeThingEffect,
  type ThingEffect,
} from '@/@shared/battlemap/types';
import { putEffect } from '../effects';
import { applyHpUnchecked } from '../hp';
import { isStaffRole, levelFor, revealedOf, storeRevealed } from './shared';

/**
 * Things that do something (08): a trap that fires, and searching for what
 * is hidden.
 */
type ThingRow = typeof battleMapTokens.$inferSelect;
type MapRowT = typeof battleMaps.$inferSelect;

/**
 * Who stands on these tiles: every combatant token whose footprint touches
 * one, with its entry, for a change that lands damage or a condition.
 */
async function standingOn(
  map: MapRowT,
  tiles: readonly number[],
  levelId: string
): Promise<
  { token: ThingRow; entry: typeof initiativeEntries.$inferSelect }[]
> {
  if (tiles.length === 0) return [];
  const board = normalizeBoard(map.terrain);
  const doc = levelOf(board, levelId);
  const set = new Set(tiles);
  const tokens = await db
    .select()
    .from(battleMapTokens)
    .where(eq(battleMapTokens.mapId, map.id));
  const hit = tokens.filter(
    t =>
      t.entryId &&
      levelFor(board, t).id === doc.id &&
      footprintTiles(doc, t).some(i => set.has(i))
  );
  if (hit.length === 0) return [];
  const entries = await db
    .select()
    .from(initiativeEntries)
    .where(
      inArray(
        initiativeEntries.id,
        hit.map(t => t.entryId as string)
      )
    );
  const byId = new Map(entries.map(e => [e.id, e]));
  return hit
    .map(t => ({ token: t, entry: byId.get(t.entryId as string)! }))
    .filter(x => x.entry);
}

/** A combatant's save bonus, off the sheet or the block; 0 for a hand-typed foe. */
async function saveBonusOf(
  entry: typeof initiativeEntries.$inferSelect,
  ability: AbilityKey
): Promise<number> {
  if (entry.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    if (c) return savingThrow(c.sheet as CharacterSheet, ability);
  }
  const ref = entry.creatureRef as ContentRef | null;
  if (!ref) return 0;
  const resolved = await resolveContentRefs([ref]);
  const block = [...resolved.values()][0];
  if (!block) return 0;
  const d = parseContentData('creature', block.data) as CreatureData;
  return (
    d.saving_throws[ability] ?? abilityModifier(d.ability_scores[ability] ?? 10)
  );
}

async function defensesOf(entry: typeof initiativeEntries.$inferSelect) {
  if (entry.characterId) {
    const c = await db.query.characters.findFirst({
      columns: { sheet: true },
      where: eq(characters.id, entry.characterId),
    });
    const sheet = c?.sheet as CharacterSheet | undefined;
    if (sheet) {
      return {
        resistances: sheet.combat?.damageResistances ?? [],
        immunities: sheet.combat?.damageImmunities ?? [],
        vulnerabilities: sheet.combat?.damageVulnerabilities ?? [],
      };
    }
  }
  const ref = entry.creatureRef as ContentRef | null;
  const block = ref ? [...(await resolveContentRefs([ref])).values()][0] : null;
  const d = block
    ? (parseContentData('creature', block.data) as CreatureData)
    : null;
  return {
    resistances: d?.damage_resistances ?? [],
    immunities: d?.damage_immunities ?? [],
    vulnerabilities: d?.damage_vulnerabilities ?? [],
  };
}

/**
 * A thing does what it does.
 *
 * The document changes land on a copy of the terrain and are written once;
 * a `toggle` remembers what it undid so the next pull puts it back. A change
 * to another thing sets its state with no reach check — the lever is the
 * reach. Damage and conditions find whoever stands on the tiles, roll the
 * save on the server (a trap fires before anyone can decide anything) with
 * every roll in the log, and land through the same paths a spell uses. A
 * hidden thing that fires is seen by everybody now. Returns false when the
 * thing had nothing to do or was spent.
 */
export async function fireThing(
  tokenId: string,
  cause: { userId: string | null; actorName: string }
): Promise<boolean> {
  const thing = await db.query.battleMapTokens.findFirst({
    where: eq(battleMapTokens.id, tokenId),
  });
  if (!thing) throw new Error('NOT_FOUND');
  const effect = normalizeThingEffect(thing.effect);
  if (!effect) return false;
  if (effect.repeat === 'once' && effect.spent) return false;
  const map = await db.query.battleMaps.findFirst({
    where: eq(battleMaps.id, thing.mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  const campaignId = map.campaignId;
  const name = thing.label || 'Something';

  // A toggle on its second pull runs what put the first back.
  const undoing = effect.repeat === 'toggle' && (effect.undo?.length ?? 0) > 0;
  const changes = undoing ? effect.undo! : effect.changes;

  // 1. The document — the floor the thing is on. A lever in the cellar
  // moves the cellar's walls; its tiles are the cellar's indices.
  const board = normalizeBoard(map.terrain);
  const doc = levelFor(board, thing);
  const terrainChanges = changes.filter(isTerrainChange);
  const applied = applyTerrainChanges(doc, terrainChanges);
  const nextBoard = withLevel(board, { ...doc, ...applied.doc });
  const revealed = revealedOf(map.revealed, board);
  const shown = revealed.get(doc.id)!;
  for (const c of changes) {
    if (c.kind === 'reveal') for (const i of c.tiles) shown.add(i);
  }
  await db
    .update(battleMaps)
    .set({
      terrain: nextBoard,
      revealed: storeRevealed(revealed),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMaps.id, map.id));

  // 2. Other things.
  for (const c of changes) {
    if (c.kind !== 'thing') continue;
    await db
      .update(battleMapTokens)
      .set({ state: c.to, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(battleMapTokens.id, c.tokenId),
          eq(battleMapTokens.mapId, map.id)
        )
      );
  }

  // 3. Whoever stands there.
  const lines: string[] = [];
  for (const c of changes) {
    if (c.kind === 'damage') {
      const rolled = rollNotation(c.dice);
      if (!rolled) continue;
      await db.insert(campaignRolls).values({
        campaignId,
        actorUserId: cause.userId,
        characterId: null,
        actorName: name,
        label: `${name} · ${c.type} damage`.slice(0, 80),
        notation: rolled.notation.slice(0, 60),
        dice: rolled.dice,
        dropped: rolled.dropped,
        modifier: rolled.modifier,
        total: rolled.total,
        visibility: 'table',
      });
      for (const { entry } of await standingOn(
        { ...map, terrain: nextBoard },
        c.area,
        doc.id
      )) {
        let amount = rolled.total;
        if (c.save) {
          const ability = c.save.ability as AbilityKey;
          const modifier = await saveBonusOf(entry, ability);
          const die = rollDie(20);
          const passed = die + modifier >= c.save.dc;
          await db.insert(campaignRolls).values({
            campaignId,
            actorUserId: null,
            characterId: entry.characterId,
            actorName: entry.label,
            label:
              `${ability.charAt(0).toUpperCase() + ability.slice(1)} save vs ${name} · DC ${c.save.dc}`.slice(
                0,
                80
              ),
            notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
            dice: [die],
            dropped: [] as number[],
            modifier,
            total: die + modifier,
            visibility: entry.side === 'party' ? 'table' : 'dm',
          });
          if (passed)
            amount = c.save.effect === 'negates' ? 0 : Math.floor(amount / 2);
        }
        const adjusted = adjustDamage(amount, c.type, await defensesOf(entry));
        if (adjusted.amount > 0) {
          await applyHpUnchecked(entry.id, campaignId, -adjusted.amount);
        }
        lines.push(`${entry.label} takes ${adjusted.amount}`);
      }
    } else if (c.kind === 'condition') {
      const [key] = parseConditions(c.condition);
      if (!key) continue;
      for (const { entry } of await standingOn(
        { ...map, terrain: nextBoard },
        c.area,
        doc.id
      )) {
        if (c.save) {
          const ability = c.save.ability as AbilityKey;
          const modifier = await saveBonusOf(entry, ability);
          const die = rollDie(20);
          const passed = die + modifier >= c.save.dc;
          await db.insert(campaignRolls).values({
            campaignId,
            actorUserId: null,
            characterId: entry.characterId,
            actorName: entry.label,
            label:
              `${ability.charAt(0).toUpperCase() + ability.slice(1)} save vs ${name} · DC ${c.save.dc}`.slice(
                0,
                80
              ),
            notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
            dice: [die],
            dropped: [] as number[],
            modifier,
            total: die + modifier,
            visibility: entry.side === 'party' ? 'table' : 'dm',
          });
          if (passed) continue;
        }
        await putEffect(
          campaignId,
          entry.encounterId,
          [entry.id],
          {
            kind: 'condition',
            conditionKey: key,
            rounds: c.rounds,
            sourceLabel: name,
          },
          cause.userId
        );
      }
    } else if (c.kind === 'sound') {
      lines.push(c.text);
    }
  }

  // 4. The thing itself: spent, toggled, and seen.
  const next: ThingEffect = {
    ...effect,
    ...(effect.repeat === 'once' ? { spent: true } : {}),
    ...(effect.repeat === 'toggle'
      ? { undo: undoing ? [] : applied.undo }
      : {}),
  };
  await db
    .update(battleMapTokens)
    .set({
      effect: next,
      ...(thing.visibility === 'dm' && effect.findDc
        ? { visibility: 'shared' as const }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(battleMapTokens.id, tokenId));

  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'thing',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: cause.userId,
    actorName: cause.actorName,
    name,
    what: 'fired',
    detail: lines.join(' · '),
  });
  return true;
}

/**
 * The hidden things a mover's path crosses that would go off under them
 * (08): `enter` triggers, unspent, for their side. Returns the first, and
 * the tile the move stops on — the plate you stepped on, not the far wall.
 */
export async function trapOnPath(
  map: MapRowT,
  doc: LevelDoc,
  path: Tile[],
  mover: { footprint: number; side: string | null }
): Promise<{ thing: ThingRow; stopAt: Tile } | null> {
  const things = (
    await db
      .select()
      .from(battleMapTokens)
      .where(
        and(
          eq(battleMapTokens.mapId, map.id),
          eq(battleMapTokens.level, doc.id)
        )
      )
  ).filter(t => t.entryId === null && t.state !== 'broken' && t.effect);
  if (things.length === 0) return null;
  for (const step of path) {
    const covered = new Set(
      footprintTiles(doc, { x: step.x, y: step.y, footprint: mover.footprint })
    );
    for (const t of things) {
      const effect = normalizeThingEffect(t.effect);
      if (!effect || effect.trigger !== 'enter') continue;
      if (effect.repeat === 'once' && effect.spent) continue;
      if (effect.triggers === 'party' && mover.side !== 'party') continue;
      if (effect.triggers === 'foe' && mover.side !== 'foe') continue;
      if (footprintTiles(doc, t).some(i => covered.has(i))) {
        return { thing: t, stopAt: step };
      }
    }
  }
  return null;
}

/**
 * Search the ground within 5 ft (08): a Perception check rolled on the
 * server off the hero's own sheet against each hidden thing's `findDc`.
 * Found, the thing is shared and the table is told. The hero's player, or
 * staff. Returns what was found.
 */
export async function searchNearby(entryId: string): Promise<string[]> {
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
  if (!isStaffRole(role)) {
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
  const map = await db.query.battleMaps.findFirst({
    where: and(
      eq(battleMaps.campaignId, enc.campaignId),
      eq(battleMaps.encounterId, entry.encounterId),
      eq(battleMaps.isActive, true)
    ),
  });
  if (!map) return [];
  const me = await db.query.battleMapTokens.findFirst({
    where: and(
      eq(battleMapTokens.mapId, map.id),
      eq(battleMapTokens.entryId, entryId)
    ),
  });
  if (!me) return [];
  const board = normalizeBoard(map.terrain);
  const hidden = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => {
    const effect = normalizeThingEffect(t.effect);
    return (
      t.entryId === null &&
      t.visibility === 'dm' &&
      effect?.findDc &&
      levelFor(board, t).id === levelFor(board, me).id &&
      distanceFeet(me, t) <= 5
    );
  });
  if (hidden.length === 0) return [];

  const character = entry.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, entry.characterId),
      })
    : null;
  const sheet = character?.sheet as CharacterSheet | undefined;
  const modifier = sheet ? skillBonus(sheet, 'perception') : 0;
  const die = rollDie(20);
  const total = die + modifier;
  await db.insert(campaignRolls).values({
    campaignId: enc.campaignId,
    actorUserId: userId,
    characterId: entry.characterId,
    actorName: entry.label,
    label: 'Wisdom (Perception) · searching',
    notation: `1d20${modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`}`,
    dice: [die],
    dropped: [] as number[],
    modifier,
    total,
    visibility: 'table',
  });

  const found: string[] = [];
  for (const t of hidden) {
    const effect = normalizeThingEffect(t.effect)!;
    if (total < (effect.findDc ?? 0)) continue;
    await db
      .update(battleMapTokens)
      .set({ visibility: 'shared', updatedAt: new Date().toISOString() })
      .where(eq(battleMapTokens.id, t.id));
    found.push(t.label || 'something');
    publish(enc.campaignId, {
      kind: 'thing',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName: entry.label,
      name: t.label || 'something hidden',
      what: 'spotted',
    });
  }
  bumpVersion(enc.campaignId);
  return found;
}

/**
 * A nudge to staff (08): the mover stands within 5 ft of something hidden.
 * Advice, not an automatic reveal — the DM decides whether the passive
 * Perception on the line is enough.
 */
export async function nudgeNearHidden(
  map: MapRowT,
  mover: { x: number; y: number; level: string },
  entry: typeof initiativeEntries.$inferSelect
): Promise<void> {
  if (entry.side !== 'party') return;
  const board = normalizeBoard(map.terrain);
  const hidden = (
    await db
      .select()
      .from(battleMapTokens)
      .where(eq(battleMapTokens.mapId, map.id))
  ).filter(t => {
    const effect = normalizeThingEffect(t.effect);
    return (
      t.entryId === null &&
      t.visibility === 'dm' &&
      effect?.findDc &&
      levelFor(board, t).id === levelOf(board, mover.level).id &&
      distanceFeet(mover, t) <= 5
    );
  });
  if (hidden.length === 0) return;
  const character = entry.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, entry.characterId),
      })
    : null;
  const passive = character
    ? passivePerception(character.sheet as CharacterSheet)
    : null;
  for (const t of hidden) {
    const effect = normalizeThingEffect(t.effect)!;
    publish(
      map.campaignId,
      {
        kind: 'thing',
        id: randomUUID(),
        at: new Date().toISOString(),
        by: null,
        actorName: entry.label,
        name: t.label || 'something hidden',
        what: 'near',
        detail:
          passive !== null
            ? `passive Perception ${passive} vs DC ${effect.findDc}${passive >= (effect.findDc ?? 0) ? ' — they would notice' : ''}`
            : `DC ${effect.findDc}`,
      },
      'staff'
    );
  }
}
