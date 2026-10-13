import 'server-only';

import { asc, eq, inArray } from 'drizzle-orm';

import { d20PenaltyFor } from '@/@creator/campaign/lib/condition-effects';
import type { CrownsRound } from '@/@creator/campaign/lib/crowns';
import type { LiarsDiceRound } from '@/@creator/campaign/lib/liars-dice';
import {
  gamingSetProficient,
  type SeatPassives,
  type TavernKind,
  type TavernResultView,
} from '@/@creator/campaign/lib/tavern';
import {
  abilityModifier,
  passivePerception,
  skillBonus,
} from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import { refKey, type ContentRef } from '@/@shared/content';
import { parseContentData } from '@/@shared/content/schemas';
import { db } from '@/db';
import {
  canonEntries,
  characters,
  tavernGameSeats,
  tavernGames,
} from '@/db/schema';
import { resolveContentRefs } from '../content';

/**
 * What every tavern-game server module shares: the stored state, loading a
 * game with its seats, and a seat's numbers off a sheet or a stat block.
 */

/** `tavern_games.state`, as stored. Never sent to a browser as it is. */
export interface StoredState {
  /** Liar's dice: dice left in each seat's cup, by seat id. */
  diceLeft: Record<string, number>;
  /** Crowns: a pot that rolled over, into the next round. */
  carryCp: number;
  /** Who opens the next round. */
  starter: string | null;
  current: LiarsDiceRound | CrownsRound | null;
  /** The last round's outcome, in words, until the next one starts. */
  result: TavernResultView | null;
}

export function readState(raw: unknown): StoredState {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoredState>;
  return {
    diceLeft: s.diceLeft ?? {},
    carryCp: s.carryCp ?? 0,
    starter: s.starter ?? null,
    current: s.current ?? null,
    result: s.result ?? null,
  };
}

export type GameRow = typeof tavernGames.$inferSelect;
export type SeatRow = typeof tavernGameSeats.$inferSelect;

export async function loadGame(
  gameId: string
): Promise<{ game: GameRow; seats: SeatRow[] }> {
  const game = await db.query.tavernGames.findFirst({
    where: eq(tavernGames.id, gameId),
  });
  if (!game) throw new Error('NOT_FOUND');
  const seats = await db
    .select()
    .from(tavernGameSeats)
    .where(eq(tavernGameSeats.gameId, gameId))
    .orderBy(asc(tavernGameSeats.seatOrder));
  return { game, seats };
}

/* --- a seat's numbers ---------------------------------------------------- */

export interface SeatNumbers {
  insight: number;
  sleight: number;
  passives: SeatPassives;
  /** Proficient with the gaming set: advantage on reads and cheats. */
  proficient: boolean;
  /** Heroes only: the purse, copper. */
  sheet: CharacterSheet | null;
}

const ZERO: SeatNumbers = {
  insight: 0,
  sleight: 0,
  passives: { perception: 10, insight: 10, deception: 10 },
  proficient: false,
  sheet: null,
};

function heroNumbers(sheet: CharacterSheet, kind: TavernKind): SeatNumbers {
  // Exhaustion costs every d20 test; a passive is not one, so it stays off.
  const penalty = d20PenaltyFor(sheet.combat?.exhaustion ?? 0);
  return {
    insight: skillBonus(sheet, 'insight') + penalty,
    sleight: skillBonus(sheet, 'sleightOfHand') + penalty,
    passives: {
      perception: passivePerception(sheet),
      insight: 10 + skillBonus(sheet, 'insight'),
      deception: 10 + skillBonus(sheet, 'deception'),
    },
    proficient: gamingSetProficient(sheet.proficiencies?.tools ?? '', kind),
    sheet,
  };
}

/**
 * An NPC's numbers, off the stat block it plays as: the creature's own
 * skill bonus where it has one, the ability modifier where it does not, and
 * +0 with a passive of 10 for an NPC with no stat block at all.
 */
function npcNumbers(data: unknown): SeatNumbers {
  const c = parseContentData('creature', data);
  const skill = (key: 'insight' | 'sleightOfHand' | 'deception') =>
    c.skill_bonuses[key];
  const insight = skill('insight') ?? abilityModifier(c.ability_scores.wisdom);
  return {
    insight,
    sleight:
      skill('sleightOfHand') ?? abilityModifier(c.ability_scores.dexterity),
    passives: {
      perception: c.passive_perception,
      insight: 10 + insight,
      deception:
        10 + (skill('deception') ?? abilityModifier(c.ability_scores.charisma)),
    },
    proficient: false,
    sheet: null,
  };
}

/**
 * Every seat's numbers, by seat id, plus each NPC's attitude and stat block
 * name. One read per kind of row, whatever the number of seats.
 */
export async function seatNumbers(
  seats: SeatRow[],
  kind: TavernKind
): Promise<{
  numbers: Map<string, SeatNumbers>;
  npc: Map<string, { attitude: string | null; statBlock: string | null }>;
  owners: Map<string, string>;
}> {
  const charIds = seats.flatMap(s => (s.characterId ? [s.characterId] : []));
  const npcIds = seats.flatMap(s => (s.canonEntryId ? [s.canonEntryId] : []));
  const [heroes, npcs] = await Promise.all([
    charIds.length
      ? db.select().from(characters).where(inArray(characters.id, charIds))
      : [],
    npcIds.length
      ? db.select().from(canonEntries).where(inArray(canonEntries.id, npcIds))
      : [],
  ]);
  const refs: ContentRef[] = npcs.flatMap(n =>
    n.statSource && n.statKey
      ? [{ source: n.statSource, type: 'creature' as const, key: n.statKey }]
      : []
  );
  const resolved = await resolveContentRefs(refs);

  const numbers = new Map<string, SeatNumbers>();
  const npc = new Map<
    string,
    { attitude: string | null; statBlock: string | null }
  >();
  const owners = new Map<string, string>();
  for (const seat of seats) {
    if (seat.characterId) {
      const hero = heroes.find(h => h.id === seat.characterId);
      if (hero) owners.set(seat.id, hero.ownerId);
      numbers.set(
        seat.id,
        hero ? heroNumbers(hero.sheet as CharacterSheet, kind) : ZERO
      );
      continue;
    }
    const entry = npcs.find(n => n.id === seat.canonEntryId);
    const stat =
      entry?.statSource && entry.statKey
        ? resolved.get(
            refKey({
              source: entry.statSource,
              type: 'creature',
              key: entry.statKey,
            })
          )
        : undefined;
    numbers.set(seat.id, stat ? npcNumbers(stat.data) : ZERO);
    npc.set(seat.id, {
      attitude: entry?.attitude ?? null,
      statBlock: stat?.name ?? null,
    });
  }
  return { numbers, npc, owners };
}
