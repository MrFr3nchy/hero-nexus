'use server';

import { z } from 'zod';

import {
  breakRest,
  callRest,
  confirmRest,
  confirmRestAnswer,
  restSpendHitDice,
  type RestRow,
} from '@/server/rests';
import {
  grantInspiration,
  passInspiration,
  rerollWithInspiration,
  revokeInspiration,
} from '@/server/inspiration';
import type { NotationRoll } from '@/@shared/lib/dice';
import {
  advanceTime,
  markProvisioned,
  setWorldTime,
  startWorldClock,
  stopWorldClock,
  type WorldClock,
} from '@/server/world-time';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'They are not seated at this table.',
    FORBIDDEN: 'That is not yours to change.',
    NO_REST: 'No rest is being taken right now.',
    NOT_A_SHORT_REST: 'Hit dice are spent on a short rest.',
    NO_HIT_DICE: 'There are no hit dice left to spend.',
    BAD_FACES: 'Those faces do not fit the dice.',
    NOT_AT_TABLE: 'They are not seated at this table.',
    ALREADY_INSPIRED: 'Already inspired — pass it on?',
    NOT_INSPIRED: 'Nobody is holding Heroic Inspiration there.',
    SAME_HERO: 'Pass it to somebody else.',
    NOT_A_D20: 'Heroic Inspiration rerolls a d20.',
    ALREADY_REROLLED: 'That roll was already the reroll.',
  };
  if (!messages[code]) console.error('[time-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/* --- the clock ------------------------------------------------------------ */

const minutesSchema = z
  .number()
  .int()
  .min(-60 * 24 * 400)
  .max(60 * 24 * 400);

/** The DM's clock control. */
export async function advanceTimeAction(
  campaignId: string,
  minutes: unknown,
  why: unknown
): Promise<Result<WorldClock>> {
  const m = minutesSchema.safeParse(minutes);
  if (!m.success) return { ok: false, error: 'That is not a span of time.' };
  const label = typeof why === 'string' ? why.trim().slice(0, 80) : '';
  try {
    const data = await advanceTime(campaignId, m.data, label || 'The DM');
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not move the clock.');
  }
}

const timeSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1),
  day: z.number().int().min(1),
  minute: z.number().int().min(0),
});

/** Set the clock outright. Setting is not advancing: no day passes. */
export async function setWorldTimeAction(
  campaignId: string,
  time: unknown
): Promise<Result<WorldClock>> {
  const t = timeSchema.safeParse(time);
  if (!t.success) return { ok: false, error: 'That is not a moment.' };
  try {
    const data = await setWorldTime(campaignId, t.data);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not set the clock.');
  }
}

export async function startWorldClockAction(
  campaignId: string
): Promise<Result<WorldClock>> {
  try {
    const data = await startWorldClock(campaignId);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not start the clock.');
  }
}

export async function stopWorldClockAction(
  campaignId: string
): Promise<Result> {
  try {
    await stopWorldClock(campaignId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not stop the clock.');
  }
}

/** The DM says a hero ate, drank or slept; the count starts again. */
export async function markProvisionedAction(
  campaignId: string,
  characterId: string,
  what: { food?: boolean; water?: boolean; slept?: boolean }
): Promise<Result> {
  try {
    await markProvisioned(campaignId, characterId, {
      food: what.food === true,
      water: what.water === true,
      slept: what.slept === true,
    });
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not mark that.');
  }
}

/* --- rests ---------------------------------------------------------------- */

const facesSchema = z.array(z.number().int().min(1).max(20)).max(40);

export async function callRestAction(
  campaignId: string,
  kind: unknown
): Promise<Result<RestRow>> {
  const k = z.enum(['short', 'long']).safeParse(kind);
  if (!k.success) return { ok: false, error: 'Short or long.' };
  try {
    const data = await callRest(campaignId, k.data);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not call the rest.');
  }
}

export async function restSpendHitDiceAction(
  campaignId: string,
  characterId: string,
  count: number,
  faces?: unknown
): Promise<Result<RestRow>> {
  const claimed = facesSchema.safeParse(faces);
  try {
    const data = await restSpendHitDice(
      campaignId,
      characterId,
      count,
      claimed.success ? claimed.data : undefined
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not spend the hit dice.');
  }
}

export async function confirmRestAnswerAction(
  campaignId: string,
  characterId: string,
  confirmed: boolean
): Promise<Result<RestRow>> {
  try {
    const data = await confirmRestAnswer(
      campaignId,
      characterId,
      confirmed === true
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not answer the rest.');
  }
}

export async function confirmRestAction(campaignId: string): Promise<Result> {
  try {
    await confirmRest(campaignId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not finish the rest.');
  }
}

export async function breakRestAction(campaignId: string): Promise<Result> {
  try {
    await breakRest(campaignId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not break the rest.');
  }
}

/* --- Heroic Inspiration --------------------------------------------------- */

export async function grantInspirationAction(
  campaignId: string,
  characterId: string
): Promise<Result> {
  try {
    await grantInspiration(campaignId, characterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not hand that over.');
  }
}

export async function revokeInspirationAction(
  campaignId: string,
  characterId: string
): Promise<Result> {
  try {
    await revokeInspiration(campaignId, characterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that back.');
  }
}

export async function passInspirationAction(
  campaignId: string,
  fromCharacterId: string,
  toCharacterId: string
): Promise<Result> {
  try {
    await passInspiration(campaignId, fromCharacterId, toCharacterId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not pass it on.');
  }
}

export async function rerollWithInspirationAction(
  campaignId: string,
  rollId: string
): Promise<Result<NotationRoll>> {
  try {
    const data = await rerollWithInspiration(campaignId, rollId);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not reroll that.');
  }
}
