import 'server-only';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

import { handsFor, handTotal } from '@/@creator/campaign/lib/crowns';
import {
  currentScore,
  diceFor,
  scoreWords,
} from '@/@creator/campaign/lib/custom-dice';
import { cupsFor, diceOut } from '@/@creator/campaign/lib/liars-dice';
import {
  holdCp,
  normalizeRules,
  rulesLines,
  type TavernKind,
  type TavernLogLine,
  type TavernNpcSeat,
  type TavernSeatView,
  type TavernView,
} from '@/@creator/campaign/lib/tavern';
import { purseInCp } from '@/@creator/character/lib/coins';
import { db } from '@/db';
import {
  campaignSessions,
  tavernGameMoves,
  tavernGameSeats,
  tavernGames,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from '../campaigns';
import { readState, seatNumbers, type GameRow, type SeatRow } from './shared';

/**
 * A tavern game as one viewer may see it.
 *
 * The one place the round state is filtered. A player gets their own cup or
 * hand and nobody else's until the cups come up or the show; staff get every
 * cup and hand (the screen hides heroes' cups behind a switch, but nothing is
 * hidden from the DM), each NPC's attitude and stat block, and every seat's
 * passives. The deck never leaves the server.
 *
 * Built in seat order with no clock in it, so an unchanged game serialises
 * to the same text and the live state's fingerprint stays still.
 */

const LOG_LINES = 14;

/**
 * The tavern game the panel shows: the one running, or — so the table can
 * read how it ended — the last one, while the sitting it was played in is
 * still going.
 */
async function currentGame(campaignId: string): Promise<GameRow | null> {
  const latest = await db.query.tavernGames.findFirst({
    where: eq(tavernGames.campaignId, campaignId),
    orderBy: [desc(tavernGames.createdAt)],
  });
  if (!latest) return null;
  if (latest.status !== 'ended') return latest;
  if (!latest.sessionId) return null;
  const sitting = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.id, latest.sessionId),
      eq(campaignSessions.status, 'live')
    ),
  });
  return sitting ? latest : null;
}

function visibleLog(
  rows: (typeof tavernGameMoves.$inferSelect)[],
  viewer: { userId: string; staff: boolean }
): TavernLogLine[] {
  return rows
    .filter(r => !r.hidden || viewer.staff || r.actorUserId === viewer.userId)
    .slice(-LOG_LINES)
    .map(r => ({ id: r.id, round: r.round, line: r.line, hidden: r.hidden }));
}

export async function tavernViewFor(
  campaignId: string,
  viewer: { userId: string; role: CampaignRole }
): Promise<TavernView | null> {
  const game = await currentGame(campaignId);
  if (!game) return null;
  const staff = viewer.role === 'gm' || viewer.role === 'co-gm';
  const kind = game.kind as TavernKind;
  const rules = normalizeRules(kind, game.rules);
  const state = readState(game.state);
  const [seats, moves] = await Promise.all([
    db
      .select()
      .from(tavernGameSeats)
      .where(eq(tavernGameSeats.gameId, game.id))
      .orderBy(asc(tavernGameSeats.seatOrder), asc(tavernGameSeats.id)),
    db
      .select()
      .from(tavernGameMoves)
      .where(eq(tavernGameMoves.gameId, game.id))
      .orderBy(
        asc(tavernGameMoves.createdAt),
        // Lines written together share a millisecond: insertion order is the
        // order they happened in.
        asc(sql`rowid`)
      ),
  ]);
  const { numbers, npc, owners } = await seatNumbers(seats, kind);

  const round = state.current;
  const live = round && !round.result ? round : null;
  const mine: SeatRow | undefined = seats.find(
    s => s.characterId && owners.get(s.id) === viewer.userId
  );

  const seatViews: TavernSeatView[] = seats.map(s => {
    const n = numbers.get(s.id);
    return {
      id: s.id,
      name: s.name,
      npc: !s.characterId,
      characterId: s.characterId,
      status: s.status,
      yours: s.id === mine?.id,
      house: s.id === state.houseSeat,
      inCp: round?.betting.inCp[s.id] ?? 0,
      folded: round?.folded.includes(s.id) ?? false,
      dice: kind === 'liars-dice' ? (state.diceLeft[s.id] ?? null) : null,
      cards:
        round?.kind === 'crowns' ? (round.hands[s.id]?.length ?? null) : null,
      netCp: s.netCp,
      attitude: staff ? (npc.get(s.id)?.attitude ?? null) : null,
      statBlock: staff ? (npc.get(s.id)?.statBlock ?? null) : null,
      passives: staff && n ? n.passives : null,
    };
  });

  const you =
    mine && numbers.get(mine.id)
      ? (() => {
          const n = numbers.get(mine.id)!;
          return {
            seatId: mine.id,
            status: mine.status,
            holdCp: live ? holdCp(live.betting, mine.id) : 0,
            purseCp: n.sheet ? purseInCp(n.sheet.currency) : 0,
            proficient: n.proficient,
            insight: n.insight,
            sleight: n.sleight,
            used: round?.used[mine.id] ?? [],
          };
        })()
      : null;

  const npcs: TavernNpcSeat[] = staff
    ? seats
        .filter(s => !s.characterId && s.status === 'seated')
        .map(s => {
          const n = numbers.get(s.id)!;
          return {
            seatId: s.id,
            holdCp: live ? holdCp(live.betting, s.id) : 0,
            insight: n.insight,
            sleight: n.sleight,
            used: round?.used[s.id] ?? [],
          };
        })
    : [];

  const seen = { seat: mine?.id ?? null, staff };
  return {
    id: game.id,
    kind,
    name: game.name,
    blurb: game.blurb,
    rules,
    lines: rulesLines(kind, rules),
    status: game.status,
    round: game.round,
    staff,
    seats: seatViews,
    turn: live?.turn ?? null,
    inRound: Boolean(live),
    potCp: round?.betting.potCp ?? 0,
    stakeCp: round?.betting.stakeCp ?? 0,
    carryCp: state.carryCp,
    you,
    npcs,
    liars:
      round?.kind === 'liars-dice'
        ? {
            bid: round.bid,
            cups: cupsFor(round, seen),
            diceOut: diceOut(round),
          }
        : null,
    crowns:
      round?.kind === 'crowns'
        ? (() => {
            const hands = handsFor(round, seen);
            const r = normalizeRules('crowns', game.rules);
            const totals = Object.fromEntries(
              Object.entries(hands).flatMap(([id, h]) =>
                h ? [[id, handTotal(h, round.crown.suit, r)]] : []
              )
            );
            return {
              phase: round.phase,
              crown: round.crown,
              hands,
              totals,
              draws: round.draws,
            };
          })()
        : null,
    custom:
      round?.kind === 'custom-dice'
        ? (() => {
            const r = normalizeRules('custom-dice', game.rules);
            const dice = diceFor(round, r, seen);
            const scores: Record<string, number | null> = {};
            const words: Record<string, string> = {};
            for (const s of round.order) {
              // A score is known when its dice are, or when the show says.
              const known = round.result
                ? round.result.scores[s]
                : dice[s] !== null || (r.turn === 'push' && !r.hidden)
                  ? currentScore(round, s, r)
                  : undefined;
              if (known === undefined) continue;
              scores[s] = known;
              words[s] = scoreWords(known, r);
            }
            return {
              phase: round.phase,
              dice,
              rolls: round.rolls,
              turnTotal:
                r.hidden && !round.result && !staff
                  ? Object.fromEntries(
                      Object.entries(round.turnTotal).filter(
                        ([s]) => s === seen.seat
                      )
                    )
                  : round.turnTotal,
              busted: round.busted,
              scores,
              words,
              points: round.result?.points ?? state.points,
              house: round.house,
            };
          })()
        : null,
    result: state.result,
    log: visibleLog(moves, { userId: viewer.userId, staff }),
  };
}

/* --- the record ----------------------------------------------------------- */

export interface TavernGameRecord {
  id: string;
  kind: TavernKind;
  name: string;
  status: 'seating' | 'playing' | 'ended';
  rounds: number;
  createdAt: string;
  endedAt: string | null;
  seats: { name: string; npc: boolean; netCp: number; status: string }[];
  /** Staff only: the reads, cheats and catches, in order. */
  secrets: string[];
}

/**
 * Every tavern game this campaign has played, newest first: who sat, and
 * how each came out. A player sees every game and every seat's net — the
 * pots were paid in front of everyone — and none of the hidden lines.
 */
export async function listTavernGames(
  campaignId: string
): Promise<TavernGameRecord[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const staff = role === 'gm' || role === 'co-gm';
  const games = await db
    .select()
    .from(tavernGames)
    .where(eq(tavernGames.campaignId, campaignId))
    .orderBy(desc(tavernGames.createdAt))
    .limit(50);
  if (games.length === 0) return [];
  const ids = games.map(g => g.id);
  const [seats, hidden] = await Promise.all([
    db
      .select()
      .from(tavernGameSeats)
      .where(inArray(tavernGameSeats.gameId, ids))
      .orderBy(asc(tavernGameSeats.seatOrder)),
    staff
      ? db
          .select()
          .from(tavernGameMoves)
          .where(
            and(
              inArray(tavernGameMoves.gameId, ids),
              eq(tavernGameMoves.hidden, true)
            )
          )
          .orderBy(asc(tavernGameMoves.createdAt), asc(sql`rowid`))
      : [],
  ]);
  return games.map(g => ({
    id: g.id,
    kind: g.kind as TavernKind,
    name: g.name,
    status: g.status,
    rounds: g.round,
    createdAt: g.createdAt,
    endedAt: g.endedAt,
    seats: seats
      .filter(s => s.gameId === g.id && s.status !== 'declined')
      .map(s => ({
        name: s.name,
        npc: !s.characterId,
        netCp: s.netCp,
        status: s.status,
      })),
    // The staff-only lines: who noticed, who got away with it.
    secrets: hidden
      .filter(m => m.gameId === g.id && !m.actorUserId)
      .map(m => m.line),
  }));
}
