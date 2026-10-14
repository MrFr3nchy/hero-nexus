import 'server-only';

import { randomInt, randomUUID } from 'node:crypto';

import { and, eq, inArray, ne } from 'drizzle-orm';

import {
  applyBet,
  applyDraw,
  applyDrawBest,
  applyFold as crownsFold,
  applyStand,
  deck,
  holdsCrowned,
  newRound as newCrownsRound,
  shuffle,
  SUIT_LABEL,
  type CrownsRound,
} from '@/@creator/campaign/lib/crowns';
import {
  applyBet as customBet,
  applyFold as customFold,
  applyRoll,
  applyStop,
  isAhead,
  newRound as newCustomRound,
  palmDie as palmCustomDie,
  scoreDice,
  scoreWords,
  type CustomRound,
} from '@/@creator/campaign/lib/custom-dice';
import {
  applyBid,
  applyCall,
  applyFold as liarsFold,
  applySpotOn,
  diceAfter,
  holdsFace,
  newRound as newLiarsRound,
  nextStarter,
  palmDie,
  type LiarsDiceRound,
} from '@/@creator/campaign/lib/liars-dice';
import { sheetRollNotation } from '@/@creator/campaign/lib/sheet-rolls';
import {
  CHEAT_LABEL,
  MAX_NAME,
  MAX_SEATS,
  MIN_SEATS,
  TAVERN_KIND_LABEL,
  bidWords,
  isTavernKind,
  nextSeat,
  normalizeRules,
  type CrownsRules,
  type CustomDiceRules,
  type LiarsDiceRules,
  type SheetMove,
  type TavernKind,
  type TavernRules,
} from '@/@creator/campaign/lib/tavern';
import {
  addToPurse,
  cpWords,
  payFromPurse,
  purseInCp,
  type Purse,
} from '@/@creator/character/lib/coins';
import type { CharacterSheet } from '@/@creator/character/schema';
import { rollNotation, type NotationRoll } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignSessions,
  canonEntries,
  characterHistory,
  characters,
  tavernGameMoves,
  tavernGameSeats,
  tavernGames,
} from '@/db/schema';
import { requireCampaignRole } from '../campaigns';
import { bumpVersion, publish, type Audience } from '../live-hub';
import { recordRoll } from '../session';
import { findHouseGame } from './house-games';
import {
  loadGame,
  readState,
  seatNumbers,
  type GameRow,
  type SeatRow,
  type StoredState,
} from './shared';

/**
 * Playing a tavern game: opening one, sitting down, each round, each move,
 * reads and cheats, and ending it.
 *
 * The rules are the pure engines' (`campaign/lib/liars-dice.ts`,
 * `crowns.ts`); this module rolls the dice, shuffles the deck, moves the
 * coin, and decides who may do what. Every move reads the game, applies the
 * engine, and writes the new state, the coin and the move lines in one
 * transaction, so a purse and a pot can never disagree.
 *
 * The DM opens a tavern game and starts each round, and plays every NPC
 * seat. A player plays only the seat of a hero they own.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface MoveLine {
  line: string;
  /** Seen by staff and by `actorUserId`; with no actor, by staff alone. */
  hidden?: boolean;
  actorUserId?: string | null;
  seatId?: string | null;
  kind: string;
}

/* --- small helpers -------------------------------------------------------- */

function rulesOf<K extends TavernKind>(game: GameRow, kind: K) {
  return normalizeRules(kind, game.rules);
}

function nameOf(seats: SeatRow[], id: string | null | undefined): string {
  return seats.find(s => s.id === id)?.name || 'Somebody';
}

function announce(
  campaignId: string,
  gameId: string,
  line: string,
  by: string | null,
  audience: Audience = 'everyone'
): void {
  publish(
    campaignId,
    {
      kind: 'tavern',
      id: randomUUID(),
      at: new Date().toISOString(),
      by,
      gameId,
      line,
      secret: audience !== 'everyone',
    },
    audience
  );
}

/**
 * Coin into or out of a hero's purse, with its line in the character's
 * history — in the transaction that moves the pot, so the two never part.
 * A negative `deltaCp` the purse cannot cover throws, and the whole move
 * rolls back.
 */
function moveCoin(
  tx: Tx,
  characterId: string,
  deltaCp: number,
  detail: string,
  actorUserId: string,
  now: string
): void {
  if (deltaCp === 0) return;
  const row = tx
    .select()
    .from(characters)
    .where(eq(characters.id, characterId))
    .get();
  // A hero deleted mid-game: their coin goes nowhere, and nothing breaks.
  if (!row) return;
  const sheet = row.sheet as CharacterSheet;
  const purse = sheet.currency as Purse;
  const next =
    deltaCp < 0 ? payFromPurse(purse, -deltaCp) : addToPurse(purse, deltaCp);
  if (!next) throw new Error('CANNOT_COVER');
  tx.update(characters)
    .set({ sheet: { ...sheet, currency: next }, updatedAt: now })
    .where(eq(characters.id, characterId))
    .run();
  tx.insert(characterHistory)
    .values({
      characterId,
      actorUserId,
      kind: 'currency',
      field: 'currency',
      fromValue: cpWords(purseInCp(purse)),
      toValue: cpWords(purseInCp(next)),
      detail,
      occurredAt: now,
    })
    .run();
}

function writeMoves(
  tx: Tx,
  gameId: string,
  round: number,
  lines: MoveLine[]
): void {
  if (lines.length === 0) return;
  tx.insert(tavernGameMoves)
    .values(
      lines.map(l => ({
        gameId,
        round,
        seatId: l.seatId ?? null,
        actorUserId: l.actorUserId ?? null,
        kind: l.kind,
        line: l.line.slice(0, 400),
        hidden: l.hidden ?? false,
      }))
    )
    .run();
}

function adjustNet(tx: Tx, seat: SeatRow, deltaCp: number): void {
  if (deltaCp === 0) return;
  tx.update(tavernGameSeats)
    .set({ netCp: seat.netCp + deltaCp })
    .where(eq(tavernGameSeats.id, seat.id))
    .run();
  seat.netCp += deltaCp;
}

/**
 * Who is acting: the hero this player owns at the game, or — for staff,
 * with `asSeat` — an NPC seat. Staff never play a hero's seat for them;
 * a player who needs nudging is nudged in person.
 */
async function actorFor(
  game: GameRow,
  seats: SeatRow[],
  asSeat: string | null | undefined
): Promise<{ seat: SeatRow; userId: string; isStaff: boolean }> {
  const { role, userId } = await requireCampaignRole(game.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  if (asSeat) {
    if (!isStaff) throw new Error('FORBIDDEN');
    const seat = seats.find(s => s.id === asSeat && !s.characterId);
    if (!seat) throw new Error('NOT_YOUR_SEAT');
    return { seat, userId, isStaff };
  }
  const heroIds = seats.flatMap(s => (s.characterId ? [s.characterId] : []));
  const owned = heroIds.length
    ? await db
        .select({ id: characters.id })
        .from(characters)
        .where(
          and(inArray(characters.id, heroIds), eq(characters.ownerId, userId))
        )
    : [];
  const seat = seats.find(s => owned.some(o => o.id === s.characterId));
  if (!seat) throw new Error('NOT_YOUR_SEAT');
  return { seat, userId, isStaff };
}

/* --- opening one ---------------------------------------------------------- */

export interface OpenInput {
  /** A house game to play by, or null for a plain one of `kind`. */
  houseGameId?: string | null;
  kind?: TavernKind;
  name?: string;
  rules?: unknown;
  /** Canon NPC entries the DM will play. */
  npcIds: string[];
  /** Heroes at this campaign, asked to sit. */
  characterIds: string[];
  /**
   * A dice game against the house: the NPC who keeps the bank, or null for
   * the DM as "the house" itself.
   */
  houseNpcId?: string | null;
}

export async function openTavernGame(
  campaignId: string,
  input: OpenInput
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const running = await db.query.tavernGames.findFirst({
    where: and(
      eq(tavernGames.campaignId, campaignId),
      ne(tavernGames.status, 'ended')
    ),
  });
  if (running) throw new Error('RUNNING');

  let kind: TavernKind;
  let rules: TavernRules;
  let name: string;
  let blurb = '';
  let houseGameId: string | null = null;
  if (input.houseGameId) {
    const house = await findHouseGame(campaignId, input.houseGameId);
    if (!house) throw new Error('NOT_FOUND');
    ({ kind, rules, blurb } = house);
    name = house.name;
    houseGameId = house.id;
  } else {
    if (!isTavernKind(input.kind)) throw new Error('BAD_KIND');
    kind = input.kind;
    rules = normalizeRules(kind, input.rules);
    name = TAVERN_KIND_LABEL[kind];
  }
  const given = (input.name ?? '').trim().slice(0, MAX_NAME);
  if (given) name = given;

  const vsHouse =
    kind === 'custom-dice' && (rules as CustomDiceRules).opponent === 'house';
  const houseNpcId = vsHouse ? (input.houseNpcId ?? null) : null;
  // The NPC keeping the bank is the house, not a player against it.
  const npcIds = [...new Set(input.npcIds)].filter(id => id !== houseNpcId);
  const charIds = [...new Set(input.characterIds)];
  if (npcIds.length + charIds.length < (vsHouse ? 1 : MIN_SEATS)) {
    throw new Error('TOO_FEW_SEATS');
  }
  if (npcIds.length + charIds.length > MAX_SEATS) {
    throw new Error('TOO_MANY_SEATS');
  }
  const [npcs, heroes, sitting, banker] = await Promise.all([
    npcIds.length
      ? db.select().from(canonEntries).where(inArray(canonEntries.id, npcIds))
      : [],
    charIds.length
      ? db.select().from(characters).where(inArray(characters.id, charIds))
      : [],
    db.query.campaignSessions.findFirst({
      where: and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.status, 'live')
      ),
    }),
    houseNpcId
      ? db.query.canonEntries.findFirst({
          where: eq(canonEntries.id, houseNpcId),
        })
      : null,
  ]);
  if (
    (houseNpcId &&
      (!banker || banker.campaignId !== campaignId || banker.kind !== 'npc')) ||
    npcs.length !== npcIds.length ||
    npcs.some(n => n.campaignId !== campaignId || n.kind !== 'npc') ||
    heroes.length !== charIds.length ||
    heroes.some(h => h.campaignId !== campaignId)
  ) {
    throw new Error('BAD_SEAT');
  }

  // NPCs and heroes alternate round the table, in the order they were picked.
  const order: {
    npc?: (typeof npcs)[number];
    hero?: (typeof heroes)[number];
  }[] = [];
  for (let i = 0; i < Math.max(npcs.length, heroes.length); i++) {
    const n = npcs.find(x => x.id === npcIds[i]);
    const h = heroes.find(x => x.id === charIds[i]);
    if (h) order.push({ hero: h });
    if (n) order.push({ npc: n });
  }

  const gameId = randomUUID();
  const houseSeat = vsHouse ? randomUUID() : null;
  try {
    db.transaction(tx => {
      tx.insert(tavernGames)
        .values({
          id: gameId,
          campaignId,
          houseGameId,
          kind,
          name,
          blurb,
          rules,
          status: 'seating',
          sessionId: sitting?.id ?? null,
          createdBy: userId,
          state: { ...readState(null), houseSeat },
        })
        .run();
      tx.insert(tavernGameSeats)
        .values(
          order.map((o, i) => ({
            gameId,
            seatOrder: i,
            characterId: o.hero?.id ?? null,
            canonEntryId: o.npc?.id ?? null,
            name: (o.hero?.name ?? o.npc?.title ?? '').slice(0, MAX_NAME),
            // The DM's NPCs sit at once; a hero is asked.
            status: o.npc ? ('seated' as const) : ('invited' as const),
          }))
        )
        .run();
      if (houseSeat) {
        // The bank sits last, played by the DM: as an NPC, or as itself.
        tx.insert(tavernGameSeats)
          .values({
            id: houseSeat,
            gameId,
            seatOrder: order.length,
            characterId: null,
            canonEntryId: banker?.id ?? null,
            name: (banker?.title || 'The house').slice(0, MAX_NAME),
            status: 'seated',
          })
          .run();
      }
      writeMoves(tx, gameId, 0, [
        { kind: 'open', line: `The DM opens ${name}.`, actorUserId: userId },
      ]);
    });
  } catch (err) {
    // Two DMs opening at once: the partial unique index says no to one.
    if (String(err).includes('UNIQUE')) throw new Error('RUNNING');
    throw err;
  }
  bumpVersion(campaignId);
  announce(campaignId, gameId, `A tavern game opens: ${name}.`, userId);
  return gameId;
}

/* --- sitting down --------------------------------------------------------- */

/** A player answers the DM's invitation: Sit down, or Not this time. */
export async function answerSeat(gameId: string, sit: boolean): Promise<void> {
  const { game, seats } = await loadGame(gameId);
  if (game.status === 'ended') throw new Error('GAME_OVER');
  const { seat, userId } = await actorFor(game, seats, null);
  if (seat.status !== 'invited') throw new Error('NOT_INVITED');
  const line = sit
    ? `${seat.name} sits down.`
    : `${seat.name} won’t play this time.`;
  db.transaction(tx => {
    tx.update(tavernGameSeats)
      .set({ status: sit ? 'seated' : 'declined' })
      .where(eq(tavernGameSeats.id, seat.id))
      .run();
    writeMoves(tx, gameId, game.round, [
      {
        kind: sit ? 'sit' : 'decline',
        line,
        actorUserId: userId,
        seatId: seat.id,
      },
    ]);
  });
  bumpVersion(game.campaignId);
  announce(game.campaignId, gameId, line, userId);
}

/* --- a round -------------------------------------------------------------- */

/**
 * Shake the cups or deal the cards. The DM starts every round; nothing
 * advances by itself. A hero who cannot cover the ante stands up for the
 * rest of the game, and that is committed even when too few are left to
 * play — so the DM sees why, rather than a button that does nothing.
 */
export async function startRound(
  gameId: string
): Promise<{ started: boolean; line: string }> {
  const { game, seats } = await loadGame(gameId);
  const { userId } = await requireCampaignRole(game.campaignId, [
    'gm',
    'co-gm',
  ]);
  if (game.status === 'ended') throw new Error('GAME_OVER');
  const state = readState(game.state);
  if (state.current && !state.current.result) throw new Error('ROUND_RUNNING');

  const kind = game.kind as TavernKind;
  const rules = rulesOf(game, kind);
  const { numbers } = await seatNumbers(seats, kind);

  // The house keeps the bank: it never antes, and it is never short of coin.
  const houseSeat = state.houseSeat;
  const seated = seats.filter(s => s.status === 'seated' && s.id !== houseSeat);
  const diceLeft = { ...state.diceLeft };
  if (kind === 'liars-dice') {
    for (const s of seated) {
      diceLeft[s.id] ??= (rules as LiarsDiceRules).dicePerCup;
    }
  }
  const withDice = seated.filter(
    s => kind !== 'liars-dice' || (diceLeft[s.id] ?? 0) > 0
  );
  const broke = withDice.filter(s => {
    const sheet = numbers.get(s.id)?.sheet;
    return sheet && purseInCp(sheet.currency) < rules.anteCp;
  });
  const players = withDice.filter(s => !broke.includes(s));
  const round = game.round + 1;
  const now = new Date().toISOString();
  const outLines: MoveLine[] = broke.map(s => ({
    kind: 'out',
    line: `${s.name} can’t cover the ante and stands up.`,
    seatId: s.id,
  }));

  if (players.length < (houseSeat ? 1 : MIN_SEATS)) {
    db.transaction(tx => {
      for (const s of broke) {
        tx.update(tavernGameSeats)
          .set({ status: 'out' })
          .where(eq(tavernGameSeats.id, s.id))
          .run();
      }
      writeMoves(tx, gameId, game.round, outLines);
    });
    if (broke.length) bumpVersion(game.campaignId);
    return {
      started: false,
      line: 'Not enough seats can cover the ante to play a round.',
    };
  }

  const order = players.map(s => s.id);
  let current: LiarsDiceRound | CrownsRound | CustomRound;
  let opening: string;
  if (kind === 'liars-dice') {
    const r = rules as LiarsDiceRules;
    const starter =
      state.starter && order.includes(state.starter) ? state.starter : order[0];
    current = newLiarsRound(order, diceLeft, r, starter, n => {
      const roll = rollNotation(`${n}d6`);
      return roll ? roll.dice : [];
    });
    opening = `Round ${round}. Everyone antes ${cpWords(r.anteCp)}, and the cups are shaken.`;
  } else if (kind === 'custom-dice') {
    const r = rules as CustomDiceRules;
    const starter =
      state.starter && order.includes(state.starter) ? state.starter : order[0];
    current = newCustomRound(
      order,
      houseSeat,
      r,
      starter,
      state.carryCp,
      state.points
    );
    const bank = houseSeat ? nameOf(seats, houseSeat) : null;
    opening = `Round ${round}. Everyone ${
      bank ? 'bets at least' : 'antes'
    } ${cpWords(r.anteCp)}${bank ? `, and ${bank} keeps the bank` : ''}.`;
  } else {
    const r = rules as CrownsRules;
    const starter =
      state.starter && order.includes(state.starter) ? state.starter : order[0];
    const c = newCrownsRound(
      order,
      shuffle(deck(), n => randomInt(n)),
      r,
      starter,
      state.carryCp
    );
    current = c;
    opening = `Round ${round}. Everyone antes ${cpWords(r.anteCp)}. The crown is the ${c.crown.rank} of ${SUIT_LABEL[c.crown.suit]}.`;
  }

  const next: StoredState = {
    ...state,
    diceLeft,
    carryCp: 0,
    // Crowns and dice games pass the first turn round the table; liar's dice
    // sets it at the call.
    starter:
      kind === 'liars-dice'
        ? state.starter
        : nextSeat(order, current.turn ?? order[0], []),
    current,
    result: null,
  };

  db.transaction(tx => {
    for (const s of broke) {
      tx.update(tavernGameSeats)
        .set({ status: 'out' })
        .where(eq(tavernGameSeats.id, s.id))
        .run();
    }
    for (const s of players) {
      if (s.characterId) {
        moveCoin(
          tx,
          s.characterId,
          -rules.anteCp,
          `Ante at ${game.name}, round ${round}`,
          userId,
          now
        );
      }
      adjustNet(tx, s, -rules.anteCp);
    }
    tx.update(tavernGames)
      .set({ status: 'playing', round, state: next })
      .where(eq(tavernGames.id, gameId))
      .run();
    writeMoves(tx, gameId, round, [
      ...outLines,
      { kind: 'round', line: opening, actorUserId: userId },
    ]);
  });
  bumpVersion(game.campaignId);
  announce(game.campaignId, gameId, opening, userId);
  return { started: true, line: opening };
}

/* --- settling a round ----------------------------------------------------- */

interface Settled {
  state: StoredState;
  lines: MoveLine[];
  /** Pot shares, by seat id. */
  shares: Record<string, number>;
  /** Seats out of dice, now out of the game. */
  outs: string[];
  /** The game ends with this round. */
  over: boolean;
  /** Dice to write into Dice now they are shown: lifted cups, or dice under cups. */
  lift: { seatId: string; dice: number[]; sides: number }[];
}

function settle(
  game: GameRow,
  seats: SeatRow[],
  state: StoredState,
  round: LiarsDiceRound | CrownsRound | CustomRound
): Settled {
  const pot = round.betting.potCp;
  if (round.kind === 'custom-dice') {
    return settleDice(game, seats, state, round);
  }
  if (round.kind === 'liars-dice') {
    const res = round.result!;
    const diceLeft = diceAfter(state.diceLeft, res);
    const outs = round.order.filter(s => (diceLeft[s] ?? 0) === 0);
    const left = Object.entries(diceLeft).filter(
      ([id, n]) =>
        n > 0 &&
        seats.some(s => s.id === id && s.status === 'seated') &&
        !outs.includes(id)
    );
    const over = left.length <= 1;
    const winner = nameOf(seats, res.winner);
    const loser = res.loser ? nameOf(seats, res.loser) : null;
    let line: string;
    if (res.how === 'folds') {
      line = `${winner} takes ${cpWords(pot)} unshown.`;
    } else {
      const bid = res.bid!;
      const bidder = nameOf(seats, bid.by);
      const caller = nameOf(seats, res.caller);
      const words = bidWords(bid.count, bid.face);
      const counted = `There ${res.counted === 1 ? 'was' : 'were'} ${res.counted}.`;
      line =
        res.how === 'liar'
          ? `Liar! ${caller} calls ${bidder}’s ${words}. ${counted} ${winner} takes ${cpWords(pot)}, and ${loser} sets a die aside.`
          : `Spot on! ${caller} calls ${bidder}’s ${words} exact. ${counted} ${winner} takes ${cpWords(pot)}${loser ? `, and ${loser} sets a die aside` : ''}.`;
    }
    const lines: MoveLine[] = [{ kind: 'result', line }];
    for (const id of outs) {
      lines.push({
        kind: 'out',
        line: `${nameOf(seats, id)} has no dice left.`,
        seatId: id,
      });
    }
    if (over && left.length === 1) {
      lines.push({
        kind: 'end',
        line: `${nameOf(seats, left[0][0])} is the last cup with dice. ${game.name} is over.`,
      });
    }
    return {
      state: {
        ...state,
        diceLeft,
        starter: nextStarter(diceLeft, res),
        current: round,
        result: { line, winners: [res.winner], loser: res.loser },
      },
      lines,
      shares: { [res.winner]: pot },
      outs,
      over,
      lift:
        res.how === 'folds'
          ? []
          : round.order.map(s => ({
              seatId: s,
              dice: round.cups[s] ?? [],
              sides: 6,
            })),
    };
  }

  const res = round.result!;
  const names = res.winners.map(w => nameOf(seats, w));
  let line: string;
  if (res.how === 'folds') {
    line = `${names[0]} takes ${cpWords(pot)} unshown.`;
  } else if (res.how === 'rollover') {
    line = `Everyone is bust. The pot of ${cpWords(pot)} rolls over.`;
  } else {
    const best = res.totals![res.winners[0]];
    line =
      names.length === 1
        ? `The show: ${names[0]} takes ${cpWords(pot)} with ${best}.`
        : `The show: ${names.join(' and ')} split ${cpWords(pot)}, each with ${best}.`;
  }
  return {
    state: {
      ...state,
      carryCp: res.carryCp,
      current: round,
      result: { line, winners: res.winners, loser: null },
    },
    lines: [{ kind: 'result', line }],
    shares: res.shares,
    outs: [],
    over: false,
    lift: [],
  };
}

/**
 * A dice game's show, in words and coin. Against the house each player's
 * line says what they won or lost, and the house's net is what it kept less
 * what it paid; against each other it is Crowns' show. First to N ends the
 * game when somebody gets there.
 */
function settleDice(
  game: GameRow,
  seats: SeatRow[],
  state: StoredState,
  round: CustomRound
): Settled {
  const rules = normalizeRules('custom-dice', game.rules);
  const res = round.result!;
  const pot = round.betting.potCp;
  const words = (s: string) => scoreWords(res.scores[s] ?? null, rules);
  const names = res.winners.map(w => nameOf(seats, w));
  const shares = { ...res.shares };
  let line: string;
  if (res.how === 'folds') {
    line = `${names[0]} takes ${cpWords(pot)} unrolled.`;
  } else if (res.how === 'house') {
    const house = round.house!;
    const parts = round.order
      .filter(s => s !== house && !round.folded.includes(s))
      .map(s => {
        const bet = round.betting.inCp[s] ?? 0;
        const back = res.shares[s] ?? 0;
        const outcome =
          back > bet
            ? `wins ${cpWords(back - bet)}`
            : back === bet
              ? 'gets the stake back'
              : `loses ${cpWords(bet)}`;
        return `${nameOf(seats, s)} (${words(s)}) ${outcome}`;
      });
    const paid = Object.values(res.shares).reduce((n, cp) => n + cp, 0);
    // The bank keeps what it did not pay; on the record, not in a purse.
    shares[house] = pot - paid;
    line = `Against ${nameOf(seats, house)}’s ${words(house)}: ${
      parts.join('; ') || 'nobody stayed in'
    }.`;
  } else if (res.how === 'rollover') {
    line =
      rules.winsOn === 'first-to'
        ? `Nobody has ${rules.target} yet. The pot of ${cpWords(pot)} rolls over.`
        : `Nobody wins. The pot of ${cpWords(pot)} rolls over.`;
  } else if (res.over) {
    line = `${names.join(' and ')} ${names.length === 1 ? 'reaches' : 'reach'} ${
      res.points?.[res.winners[0]] ?? rules.target
    } and ${names.length === 1 ? 'takes' : 'split'} ${cpWords(pot)}. ${game.name} is over.`;
  } else if (res.instant.length > 0) {
    line = `${names.join(' and ')} ${names.length === 1 ? 'wins' : 'win'} outright with ${words(res.winners[0])}, and ${
      names.length === 1 ? 'takes' : 'split'
    } ${cpWords(pot)}.`;
  } else {
    line =
      names.length === 1
        ? `The show: ${names[0]} takes ${cpWords(pot)} with ${words(res.winners[0])}.`
        : `The show: ${names.join(' and ')} split ${cpWords(pot)}, each with ${words(res.winners[0])}.`;
  }
  return {
    state: {
      ...state,
      carryCp: res.carryCp,
      points: res.points ?? state.points,
      current: round,
      result: { line, winners: res.winners, loser: null },
    },
    lines: [{ kind: 'result', line }],
    shares,
    outs: [],
    over: res.over,
    // Under cups the dice go into Dice when they are shown; in the open,
    // every roll already did.
    lift:
      rules.hidden && res.how !== 'folds'
        ? round.order
            .filter(s => (round.dice[s] ?? []).length > 0)
            .map(s => ({ seatId: s, dice: round.dice[s], sides: rules.sides }))
        : [],
  };
}

/**
 * Write a round that moved: the coin the actor paid, the pot if it was won,
 * the seats now out, and the lines. Then the cups into Dice, once the
 * transaction has committed.
 */
async function commitMove(
  game: GameRow,
  seats: SeatRow[],
  state: StoredState,
  round: LiarsDiceRound | CrownsRound | CustomRound,
  actor: { seat: SeatRow; userId: string },
  paidCp: number,
  lines: MoveLine[],
  publicLine: string | null
): Promise<void> {
  const now = new Date().toISOString();
  const settled = round.result ? settle(game, seats, state, round) : null;
  const next: StoredState = settled
    ? settled.state
    : { ...state, current: round };

  db.transaction(tx => {
    if (paidCp > 0) {
      if (actor.seat.characterId) {
        moveCoin(
          tx,
          actor.seat.characterId,
          -paidCp,
          `Stake at ${game.name}, round ${game.round}`,
          actor.userId,
          now
        );
      }
      adjustNet(tx, actor.seat, -paidCp);
    }
    if (settled) {
      for (const [seatId, share] of Object.entries(settled.shares)) {
        const seat = seats.find(s => s.id === seatId);
        if (!seat) continue;
        if (seat.characterId) {
          moveCoin(
            tx,
            seat.characterId,
            share,
            `Won the pot at ${game.name}, round ${game.round}`,
            actor.userId,
            now
          );
        }
        adjustNet(tx, seat, share);
      }
      for (const id of settled.outs) {
        tx.update(tavernGameSeats)
          .set({ status: 'out' })
          .where(eq(tavernGameSeats.id, id))
          .run();
      }
    }
    tx.update(tavernGames)
      .set({
        state: next,
        ...(settled?.over ? { status: 'ended' as const, endedAt: now } : {}),
      })
      .where(eq(tavernGames.id, game.id))
      .run();
    writeMoves(tx, game.id, game.round, [...lines, ...(settled?.lines ?? [])]);
  });

  if (settled?.lift.length) {
    const label = `${game.name} · round ${game.round}`;
    for (const shown of settled.lift) {
      const seat = seats.find(s => s.id === shown.seatId);
      const result = rollNotation(
        `${shown.dice.length}d${shown.sides}`,
        shown.dice
      );
      if (!seat || !result) continue;
      await recordRoll(game.campaignId, {
        actorUserId: null,
        characterId: seat.characterId,
        actorName: seat.name,
        label,
        result,
        secret: false,
        audience: null,
      });
    }
  }
  bumpVersion(game.campaignId);
  for (const line of [publicLine, ...(settled?.lines ?? []).map(l => l.line)]) {
    if (line) announce(game.campaignId, game.id, line, actor.userId);
  }
}

/* --- a move --------------------------------------------------------------- */

export type TavernMove =
  | { kind: 'bid'; count: number; face: number; raiseCp?: number }
  | { kind: 'call' }
  | { kind: 'spot-on' }
  | { kind: 'fold' }
  | { kind: 'bet'; raiseCp?: number }
  | { kind: 'draw' }
  | { kind: 'stand' }
  | { kind: 'roll'; hold?: number[] }
  | { kind: 'stop' };

function runningRound(state: StoredState) {
  if (!state.current || state.current.result) throw new Error('NO_ROUND');
  return state.current;
}

/**
 * Bid, call, fold, bet, draw, stand, roll or stop — whatever the game in
 * front of you asks for. `asSeat` is an NPC seat (or the house) the DM is
 * playing. A dice-game roll hands back the server's dice, so the roller's
 * tray can throw them.
 */
export async function tavernMove(
  gameId: string,
  move: TavernMove,
  asSeat?: string | null
): Promise<{ roll: NotationRoll | null }> {
  const { game, seats } = await loadGame(gameId);
  if (game.status === 'ended') throw new Error('GAME_OVER');
  const actor = await actorFor(game, seats, asSeat);
  const state = readState(game.state);
  const current = runningRound(state);
  const me = actor.seat.id;
  const who = actor.seat.name;
  const kind = game.kind as TavernKind;
  const lines: MoveLine[] = [];
  let line: string | null = null;
  let round: LiarsDiceRound | CrownsRound | CustomRound;
  let paidCp = 0;
  let thrown: NotationRoll | null = null;

  if (kind === 'custom-dice' && current.kind === 'custom-dice') {
    const rules = rulesOf(game, 'custom-dice');
    if (move.kind === 'bet') {
      const raise = Math.trunc(move.raiseCp ?? 0);
      const owed = Math.max(
        0,
        current.betting.stakeCp - (current.betting.inCp[me] ?? 0)
      );
      ({ round, paidCp } = customBet(current, me, raise, rules));
      line = current.house
        ? `${who} bets ${cpWords(round.betting.inCp[me] ?? 0)}.`
        : raise > 0
          ? `${who} raises the stake to ${cpWords(round.betting.stakeCp)}.`
          : owed > 0
            ? `${who} holds.`
            : `${who} stays in.`;
    } else if (move.kind === 'fold') {
      round = customFold(current, me, rules);
      line = `${who} folds.`;
    } else if (move.kind === 'roll') {
      const again = (current.rolls[me] ?? 0) > 0;
      round = applyRoll(
        current,
        me,
        rules,
        (n, sides) => {
          thrown = rollNotation(`${n}d${sides}`);
          return thrown ? thrown.dice : [];
        },
        move.hold ?? []
      );
      const dice = round.dice[me] ?? [];
      const busted = round.busted.includes(me);
      const verb = again && rules.turn === 'hold' ? 'rerolls' : 'rolls';
      if (rules.hidden) {
        line = `${who} ${verb} under the cup${busted ? ' and busts' : ''}.`;
      } else if (rules.turn === 'push') {
        line = busted
          ? `${who} rolls ${dice.join(', ')} and busts.`
          : `${who} rolls ${dice.join(', ')}: ${round.turnTotal[me] ?? 0} this turn.`;
      } else {
        // The score as the dice lie, whether or not the turn is over.
        line = `${who} ${verb} ${dice.join(', ')}: ${scoreWords(
          scoreDice(dice, rules),
          rules
        )}.`;
      }
    } else if (move.kind === 'stop') {
      round = applyStop(current, me, rules);
      line =
        rules.turn === 'push'
          ? `${who} stops at ${current.turnTotal[me] ?? 0}.`
          : `${who} stands.`;
    } else {
      throw new Error('BAD_MOVE');
    }
  } else if (kind === 'liars-dice' && current.kind === 'liars-dice') {
    const rules = rulesOf(game, 'liars-dice');
    if (move.kind === 'bid') {
      const raise = Math.trunc(move.raiseCp ?? 0);
      ({ round, paidCp } = applyBid(
        current,
        me,
        { count: move.count, face: move.face },
        raise,
        rules
      ));
      line = `${who} bids ${bidWords(move.count, move.face)}${
        raise > 0
          ? ` and raises the stake to ${cpWords(round.betting.stakeCp)}`
          : ''
      }.`;
    } else if (move.kind === 'call') {
      ({ round, paidCp } = applyCall(current, me, rules));
    } else if (move.kind === 'spot-on') {
      ({ round, paidCp } = applySpotOn(current, me, rules));
    } else if (move.kind === 'fold') {
      round = liarsFold(current, me);
      line = `${who} folds.`;
    } else {
      throw new Error('BAD_MOVE');
    }
  } else if (kind === 'crowns' && current.kind === 'crowns') {
    const rules = rulesOf(game, 'crowns');
    if (move.kind === 'bet') {
      const raise = Math.trunc(move.raiseCp ?? 0);
      const owed = Math.max(
        0,
        current.betting.stakeCp - (current.betting.inCp[me] ?? 0)
      );
      ({ round, paidCp } = applyBet(current, me, raise, rules));
      line =
        raise > 0
          ? `${who} raises the stake to ${cpWords(round.betting.stakeCp)}.`
          : owed > 0
            ? `${who} holds.`
            : `${who} stays in.`;
    } else if (move.kind === 'fold') {
      round = crownsFold(current, me, rules);
      line = `${who} folds.`;
    } else if (move.kind === 'draw') {
      round = applyDraw(current, me, rules);
      line = `${who} draws a card.`;
    } else if (move.kind === 'stand') {
      round = applyStand(current, me, rules);
      line = `${who} stands.`;
    } else {
      throw new Error('BAD_MOVE');
    }
  } else {
    throw new Error('BAD_MOVE');
  }

  if (line) {
    lines.push({
      kind: move.kind,
      line,
      actorUserId: actor.userId,
      seatId: me,
    });
  }
  await commitMove(game, seats, state, round, actor, paidCp, lines, line);
  if (thrown) {
    const rolled: NotationRoll = thrown;
    // Every throw lands in Dice: in the open for all, under cups for the
    // roller and staff. The game's own line is the announcement.
    const rules = rulesOf(game, 'custom-dice');
    await recordRoll(game.campaignId, {
      actorUserId: actor.userId,
      characterId: actor.seat.characterId,
      actorName: who,
      label: `${game.name} · round ${game.round}`,
      result: rolled,
      secret: rules.hidden,
      audience: null,
    });
  }
  return { roll: thrown };
}

/* --- off the sheet -------------------------------------------------------- */

function markUsed<R extends LiarsDiceRound | CrownsRound | CustomRound>(
  round: R,
  seat: string,
  what: SheetMove
): R {
  const used = round.used[seat] ?? [];
  if (used.includes(what)) throw new Error('ALREADY_USED');
  return { ...round, used: { ...round.used, [seat]: [...used, what] } };
}

function inRound(
  round: LiarsDiceRound | CrownsRound | CustomRound,
  seat: string
): void {
  if (!round.order.includes(seat) || round.folded.includes(seat)) {
    throw new Error('NOT_IN_ROUND');
  }
}

function d20(bonus: number, advantage: boolean): NotationRoll {
  const roll = rollNotation(
    sheetRollNotation(bonus, advantage ? 'advantage' : 'straight')
  );
  if (!roll) throw new Error('BAD_NOTATION');
  return roll;
}

/**
 * Read a seat: Insight against their passive Deception. The roll is public
 * — everyone sees Kessa studying Brannoc — and what it tells is not: one
 * true thing, for the reader and staff.
 */
export async function readSeat(
  gameId: string,
  targetSeatId: string,
  asSeat?: string | null
): Promise<{ roll: NotationRoll; line: string }> {
  const { game, seats } = await loadGame(gameId);
  if (game.status === 'ended') throw new Error('GAME_OVER');
  const actor = await actorFor(game, seats, asSeat);
  const state = readState(game.state);
  const current = runningRound(state);
  const me = actor.seat.id;
  inRound(current, me);
  if (targetSeatId === me || !current.order.includes(targetSeatId)) {
    throw new Error('BAD_TARGET');
  }
  const kind = game.kind as TavernKind;
  if (current.kind === 'liars-dice' && !current.bid) throw new Error('NO_BID');
  if (current.kind === 'custom-dice') {
    // Dice in the open need no reading.
    if (!rulesOf(game, 'custom-dice').hidden) throw new Error('NOT_UNDER_CUPS');
    if (!current.rolls[me] || !current.rolls[targetSeatId]) {
      throw new Error('NOT_ROLLED');
    }
  }
  const round = markUsed(current, me, 'read');

  const { numbers } = await seatNumbers(seats, kind);
  const mine = numbers.get(me)!;
  const dc = numbers.get(targetSeatId)!.passives.deception;
  const roll = d20(mine.insight, mine.proficient);
  const target = nameOf(seats, targetSeatId);

  let truth: string;
  if (current.kind === 'custom-dice') {
    truth = isAhead(current, targetSeatId, me, rulesOf(game, 'custom-dice'))
      ? `${target} is ahead of you.`
      : `${target} is not ahead of you.`;
  } else if (current.kind === 'liars-dice') {
    const rules = rulesOf(game, 'liars-dice');
    const face = current.bid!.face;
    truth = holdsFace(current, targetSeatId, face, rules.onesWild)
      ? `${target} holds at least one ${face}${rules.onesWild ? ', counting wild ones' : ''}.`
      : `${target} holds no ${face}s${rules.onesWild ? ' and no wild ones' : ''}.`;
  } else {
    truth = holdsCrowned(current, targetSeatId)
      ? `${target} holds a crowned card.`
      : `${target} holds no crowned card.`;
  }
  const won = roll.total >= dc;
  const secret = `Insight ${roll.total} against ${dc}: ${
    won ? truth : `${target} gives nothing away.`
  }`;
  const open = `${actor.seat.name} studies ${target}.`;

  await recordRoll(game.campaignId, {
    actorUserId: actor.userId,
    characterId: actor.seat.characterId,
    actorName: actor.seat.name,
    label: `Insight · reading ${target}`,
    result: roll,
    secret: false,
    audience: 'everyone',
  });
  db.transaction(tx => {
    tx.update(tavernGames)
      .set({ state: { ...state, current: round } })
      .where(eq(tavernGames.id, game.id))
      .run();
    writeMoves(tx, game.id, game.round, [
      { kind: 'read', line: open, actorUserId: actor.userId, seatId: me },
      {
        kind: 'read',
        line: secret,
        hidden: true,
        actorUserId: actor.userId,
        seatId: me,
      },
    ]);
  });
  bumpVersion(game.campaignId);
  return { roll, line: secret };
}

export interface CheatInput {
  /** Liar's dice: which of your dice, and the face it should show. */
  dieIndex?: number;
  face?: number;
}

/**
 * Cheat: Sleight of Hand against the sharpest eye still in the round — the
 * highest passive Perception or passive Insight. The roll is hidden from
 * everyone but the cheater and staff. When it works the change happens
 * quietly; when it does not, nothing changes and the DM is told who
 * noticed. The app does nothing more: what happens next is the DM's to say.
 */
export async function cheat(
  gameId: string,
  input: CheatInput,
  asSeat?: string | null
): Promise<{ roll: NotationRoll; line: string; worked: boolean }> {
  const { game, seats } = await loadGame(gameId);
  if (game.status === 'ended') throw new Error('GAME_OVER');
  const actor = await actorFor(game, seats, asSeat);
  const state = readState(game.state);
  const current = runningRound(state);
  const me = actor.seat.id;
  inRound(current, me);
  const kind = game.kind as TavernKind;

  if (current.kind === 'custom-dice') {
    const rules = rulesOf(game, 'custom-dice');
    // A push-your-luck roll is already counted: there is nothing to palm.
    if (
      rules.turn === 'push' ||
      current.phase !== 'roll' ||
      current.turn !== me ||
      !current.rolls[me]
    ) {
      throw new Error('CANT_CHEAT_NOW');
    }
    palmCustomDie(current, me, input.dieIndex ?? -1, input.face ?? 0, rules);
  } else if (current.kind === 'liars-dice') {
    const cup = current.cups[me] ?? [];
    const i = input.dieIndex ?? -1;
    if (!Number.isInteger(i) || i < 0 || i >= cup.length) {
      throw new Error('BAD_DIE');
    }
    if (!Number.isInteger(input.face) || input.face! < 1 || input.face! > 6) {
      throw new Error('BAD_DIE');
    }
  } else {
    const rules = rulesOf(game, 'crowns');
    if (
      current.phase !== 'draw' ||
      current.turn !== me ||
      (current.draws[me] ?? 0) >= rules.maxDraws
    ) {
      throw new Error('CANT_CHEAT_NOW');
    }
  }
  let round = markUsed(current, me, 'cheat');

  const { numbers } = await seatNumbers(seats, kind);
  const mine = numbers.get(me)!;
  // The sharpest eye among the others still in the round.
  let dc = 10;
  let noticer: string | null = null;
  let sense = 'Perception';
  for (const other of round.order) {
    if (other === me || round.folded.includes(other)) continue;
    const p = numbers.get(other)!.passives;
    if (p.perception > dc || (!noticer && p.perception >= dc)) {
      dc = p.perception;
      noticer = other;
      sense = 'Perception';
    }
    if (p.insight > dc) {
      dc = p.insight;
      noticer = other;
      sense = 'Insight';
    }
  }
  const roll = d20(mine.sleight, mine.proficient);
  const worked = roll.total >= dc;
  const verb = kind === 'crowns' ? 'deal from the bottom' : 'palm a die';
  const who = actor.seat.name;
  const seen = noticer
    ? `${nameOf(seats, noticer)}’s passive ${sense}`
    : 'the room';

  let change = '';
  if (worked) {
    if (round.kind === 'custom-dice') {
      const before = round.dice[me][input.dieIndex!];
      round = palmCustomDie(
        round,
        me,
        input.dieIndex!,
        input.face!,
        rulesOf(game, 'custom-dice')
      );
      change = ` A ${before} became a ${input.face}.`;
    } else if (round.kind === 'liars-dice') {
      const before = round.cups[me][input.dieIndex!];
      round = palmDie(round, me, input.dieIndex!, input.face!);
      change = ` A ${before} became a ${input.face}.`;
    } else {
      round = applyDrawBest(round, me, rulesOf(game, 'crowns'));
    }
  }
  const forActor = worked
    ? `Sleight of Hand ${roll.total}: it worked.${change}`
    : `Sleight of Hand ${roll.total}: it did not work. Somebody may have seen.`;
  const forStaff = worked
    ? `${who} tried to ${verb} and got away with it: ${roll.total} against ${seen} ${dc}.`
    : `Caught: ${who} tried to ${verb}. ${roll.total} against ${seen} ${dc}.`;

  await recordRoll(game.campaignId, {
    actorUserId: actor.userId,
    characterId: actor.seat.characterId,
    actorName: who,
    label: `Sleight of Hand · ${CHEAT_LABEL[kind].toLowerCase()}`,
    result: roll,
    secret: true,
    // The cheater and staff (`reaches` sends `{ users }` to staff too).
    audience: { users: [actor.userId] },
  });

  const lines: MoveLine[] = [
    {
      kind: 'cheat',
      line: forActor,
      hidden: true,
      actorUserId: actor.userId,
      seatId: me,
    },
    // No actor: staff alone. Who noticed is the DM's to know.
    {
      kind: worked ? 'cheat' : 'caught',
      line: forStaff,
      hidden: true,
      seatId: me,
    },
  ];
  if (round.kind === 'crowns' && worked) {
    lines.push({
      kind: 'draw',
      line: `${who} draws a card.`,
      actorUserId: actor.userId,
      seatId: me,
    });
  }
  await commitMove(
    game,
    seats,
    state,
    round,
    actor,
    0,
    lines,
    round.kind === 'crowns' && worked ? `${who} draws a card.` : null
  );
  announce(game.campaignId, game.id, forStaff, actor.userId, 'staff');
  return { roll, line: forActor, worked };
}

/* --- ending it ------------------------------------------------------------ */

/**
 * End the tavern game. Mid-round, every hero gets back what they put in
 * that round — the round never finished, so nobody won it.
 */
export async function endTavernGame(gameId: string): Promise<void> {
  const { game, seats } = await loadGame(gameId);
  const { userId } = await requireCampaignRole(game.campaignId, [
    'gm',
    'co-gm',
  ]);
  if (game.status === 'ended') return;
  const state = readState(game.state);
  const now = new Date().toISOString();
  const running = state.current && !state.current.result ? state.current : null;
  const line = running
    ? `The DM ends ${game.name} mid-round. Every stake for round ${game.round} goes back.`
    : `The DM ends ${game.name}.`;

  db.transaction(tx => {
    if (running) {
      for (const [seatId, cp] of Object.entries(running.betting.inCp)) {
        const seat = seats.find(s => s.id === seatId);
        if (!seat || cp <= 0) continue;
        if (seat.characterId) {
          moveCoin(
            tx,
            seat.characterId,
            cp,
            `Stake returned at ${game.name}, round ${game.round}`,
            userId,
            now
          );
        }
        adjustNet(tx, seat, cp);
      }
    }
    tx.update(tavernGames)
      .set({
        status: 'ended',
        endedAt: now,
        state: { ...state, current: running ? null : state.current },
      })
      .where(eq(tavernGames.id, gameId))
      .run();
    writeMoves(tx, gameId, game.round, [
      { kind: 'end', line, actorUserId: userId },
    ]);
  });
  bumpVersion(game.campaignId);
  announce(game.campaignId, gameId, line, userId);
}
