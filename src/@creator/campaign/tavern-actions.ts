'use server';

import { z } from 'zod';

import {
  MAX_BLURB,
  MAX_NAME,
  TAVERN_KINDS,
  type HouseGameRow,
} from '@/@creator/campaign/lib/tavern';
import type { NotationRoll } from '@/@shared/lib/dice';
import {
  answerSeat,
  cheat,
  endTavernGame,
  openTavernGame,
  readSeat,
  startRound,
  tavernMove,
} from '@/server/tavern/games';
import {
  tavernSeatChoices,
  type TavernSeatChoices,
} from '@/server/tavern/seats';
import { listTavernGames, type TavernGameRecord } from '@/server/tavern/view';
import {
  createHouseGame,
  deleteHouseGame,
  listHouseGames,
  updateHouseGame,
} from '@/server/tavern/house-games';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'You are not signed in.',
  SESSION_STALE: 'Your session is out of date. Sign in again.',
  FORBIDDEN: 'That is the DM’s to do.',
  NOT_FOUND: 'That tavern game is not at this campaign.',
  NO_NAME: 'A house game needs a name.',
  BAD_KIND: 'Pick liar’s dice or Crowns.',
  RUNNING: 'A tavern game is already running here. End it first.',
  TOO_FEW_SEATS: 'A tavern game needs at least two seats.',
  TOO_MANY_SEATS: 'Six seats at most.',
  BAD_SEAT: 'Seat NPCs and heroes from this campaign.',
  GAME_OVER: 'That tavern game is over.',
  NOT_INVITED: 'You have not been asked to sit at this one.',
  ROUND_RUNNING: 'Finish this round first.',
  NO_ROUND: 'No round is being played. The DM starts the next one.',
  NOT_YOUR_SEAT: 'That is not your seat.',
  NOT_YOUR_TURN: 'It is not your turn.',
  ROUND_OVER: 'That round is over.',
  BID_TOO_LOW:
    'A bid must beat the last one: more dice, or as many of a higher face.',
  BAD_RAISE: 'That raise is more than the house allows.',
  NO_BID: 'Nobody has bid yet.',
  OWN_BID: 'You cannot call your own bid.',
  NO_SPOT_ON: 'This house does not play spot on.',
  WRONG_PHASE: 'Not now: the round is past that.',
  NO_MORE_DRAWS: 'No more draws this round.',
  CANNOT_COVER: 'Your purse cannot cover that. Fold, or bid without raising.',
  ALREADY_USED: 'Once a round, and you have done that this round.',
  NOT_IN_ROUND: 'You are not in this round.',
  BAD_TARGET: 'Pick somebody else at the game.',
  BAD_DIE: 'Pick one of your dice, and a face from 1 to 6.',
  CANT_CHEAT_NOW:
    'Not now: a die is palmed on your turn after you roll, and a card dealt from the bottom on your draw.',
  BAD_MOVE: 'That is not a move in this game.',
  NO_MORE_ROLLS: 'No more rolls this turn. Stand, or stop.',
  ROLL_FIRST: 'Roll first.',
  NOT_UNDER_CUPS: 'The dice are in the open. There is nothing to read.',
  NOT_ROLLED: 'Nothing to read until they have rolled.',
};

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  if (!MESSAGES[code]) console.error('[tavern-action]', fallback, err);
  return { ok: false, error: MESSAGES[code] ?? fallback };
}

/* --- house games ---------------------------------------------------------- */

const houseGame = z.object({
  kind: z.enum(TAVERN_KINDS),
  name: z.string().trim().min(1).max(MAX_NAME),
  blurb: z.string().max(MAX_BLURB).optional(),
  // Normalised field by field on the server; anything else is dropped there.
  rules: z.record(z.string(), z.unknown()).optional(),
});

export async function listHouseGamesAction(
  campaignId: string
): Promise<Result<HouseGameRow[]>> {
  try {
    return { ok: true, data: await listHouseGames(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the house games.');
  }
}

export async function createHouseGameAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = houseGame.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.NO_NAME };
  try {
    return {
      ok: true,
      data: { id: await createHouseGame(campaignId, parsed.data) },
    };
  } catch (err) {
    return fail(err, 'Could not write that house game.');
  }
}

export async function updateHouseGameAction(
  id: string,
  input: unknown
): Promise<Result> {
  const parsed = houseGame.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.NO_NAME };
  try {
    await updateHouseGame(id, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save that house game.');
  }
}

export async function deleteHouseGameAction(id: string): Promise<Result> {
  try {
    await deleteHouseGame(id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that house game down.');
  }
}

/* --- playing -------------------------------------------------------------- */

const ids = z.array(z.string().min(1).max(64)).max(12);
const openSchema = z.object({
  houseGameId: z.string().max(64).nullish(),
  kind: z.enum(TAVERN_KINDS).optional(),
  name: z.string().max(MAX_NAME).optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  npcIds: ids,
  characterIds: ids,
  houseNpcId: z.string().max(64).nullish(),
});

export async function tavernSeatChoicesAction(
  campaignId: string
): Promise<Result<TavernSeatChoices>> {
  try {
    return { ok: true, data: await tavernSeatChoices(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read who could sit.');
  }
}

export async function openTavernGameAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: MESSAGES.BAD_SEAT };
  try {
    return {
      ok: true,
      data: { id: await openTavernGame(campaignId, parsed.data) },
    };
  } catch (err) {
    return fail(err, 'Could not open that tavern game.');
  }
}

export async function answerSeatAction(
  gameId: string,
  sit: boolean
): Promise<Result> {
  try {
    await answerSeat(gameId, sit === true);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not answer that.');
  }
}

export async function startRoundAction(
  gameId: string
): Promise<Result<{ started: boolean; line: string }>> {
  try {
    return { ok: true, data: await startRound(gameId) };
  } catch (err) {
    return fail(err, 'The cups would not shake.');
  }
}

const moveSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bid'),
    count: z.number().int().min(1).max(36),
    face: z.number().int().min(1).max(6),
    raiseCp: z.number().int().min(0).max(100_000).optional(),
  }),
  z.object({ kind: z.literal('call') }),
  z.object({ kind: z.literal('spot-on') }),
  z.object({ kind: z.literal('fold') }),
  z.object({
    kind: z.literal('bet'),
    raiseCp: z.number().int().min(0).max(100_000).optional(),
  }),
  z.object({ kind: z.literal('draw') }),
  z.object({ kind: z.literal('stand') }),
  z.object({
    kind: z.literal('roll'),
    hold: z.array(z.number().int().min(0).max(9)).max(10).optional(),
  }),
  z.object({ kind: z.literal('stop') }),
]);

export async function tavernMoveAction(
  gameId: string,
  move: unknown,
  asSeat?: string | null
): Promise<Result<{ roll: NotationRoll | null }>> {
  const parsed = moveSchema.safeParse(move);
  if (!parsed.success) return { ok: false, error: MESSAGES.BAD_MOVE };
  try {
    return {
      ok: true,
      data: await tavernMove(gameId, parsed.data, asSeat ?? null),
    };
  } catch (err) {
    return fail(err, 'That move did not land.');
  }
}

export async function readSeatAction(
  gameId: string,
  targetSeatId: string,
  asSeat?: string | null
): Promise<Result<{ roll: NotationRoll; line: string }>> {
  try {
    return {
      ok: true,
      data: await readSeat(gameId, String(targetSeatId), asSeat ?? null),
    };
  } catch (err) {
    return fail(err, 'The read did not land.');
  }
}

const cheatSchema = z.object({
  dieIndex: z.number().int().min(0).max(5).optional(),
  face: z.number().int().min(1).max(6).optional(),
});

export async function cheatAction(
  gameId: string,
  input: unknown,
  asSeat?: string | null
): Promise<Result<{ roll: NotationRoll; line: string; worked: boolean }>> {
  const parsed = cheatSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: MESSAGES.BAD_DIE };
  try {
    return { ok: true, data: await cheat(gameId, parsed.data, asSeat ?? null) };
  } catch (err) {
    return fail(err, 'Your hands were not quick enough to try.');
  }
}

export async function endTavernGameAction(gameId: string): Promise<Result> {
  try {
    await endTavernGame(gameId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not end that tavern game.');
  }
}

export async function listTavernGamesAction(
  campaignId: string
): Promise<Result<TavernGameRecord[]>> {
  try {
    return { ok: true, data: await listTavernGames(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the tavern games.');
  }
}
