'use server';

import { z } from 'zod';

import {
  setEntryGroup,
  setLair,
  setLegendary,
  spendLegendaryAction,
  spendLegendaryResistance,
  spendRechargeFeature,
} from '@/server/monsters';
import { RuleRefusal } from '@/server/table-rules';
import { undoLast } from '@/server/undo';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | Refusal;

type Refusal = { ok: false; error: string; overridable?: boolean };

function fail(err: unknown, fallback: string): Refusal {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That combatant is no longer in the fight.',
    FORBIDDEN: 'Only the DM runs the other side.',
    NOT_LEGENDARY: 'That creature has nothing legendary about it.',
    NO_LEGENDARY_LEFT: 'No legendary actions left until its turn.',
    NO_RESISTANCE_LEFT: 'No Legendary Resistance left today.',
    NOT_A_RECHARGE: 'That ability does not recharge.',
    NOT_RECHARGED: 'Not recharged yet — the d6 at the start of its turn.',
  };
  if (!messages[code]) console.error('[monster-action]', fallback, err);
  return {
    ok: false,
    error: messages[code] ?? fallback,
    ...(err instanceof RuleRefusal && err.overridable
      ? { overridable: true }
      : {}),
  };
}

export async function setEntryGroupAction(
  entryIds: unknown,
  grouped: boolean
): Promise<Result> {
  const ids = z.array(z.string().min(1)).min(1).max(40).safeParse(entryIds);
  if (!ids.success) return { ok: false, error: 'Pick who acts together.' };
  try {
    await setEntryGroup(ids.data, grouped === true);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the group.');
  }
}

const counterSchema = z.object({
  max: z.number().int().min(0).max(9),
  used: z.number().int().min(0).max(9),
});

export async function setLegendaryAction(
  entryId: string,
  patch: unknown
): Promise<Result> {
  const p = z
    .object({
      actions: counterSchema.optional(),
      resistances: counterSchema.optional(),
      lair: z.boolean().optional(),
    })
    .nullable()
    .safeParse(patch);
  if (!p.success) return { ok: false, error: 'Those are not counters.' };
  try {
    await setLegendary(entryId, p.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not set the counters.');
  }
}

export async function spendLegendaryActionAction(
  entryId: string,
  cost: number,
  opts: { ruling?: boolean } = {}
): Promise<Result<{ left: number; ruling: boolean }>> {
  try {
    const data = await spendLegendaryAction(entryId, cost, {
      ruling: opts.ruling === true,
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not take the legendary action.');
  }
}

export async function spendLegendaryResistanceAction(
  entryId: string
): Promise<Result<{ left: number }>> {
  try {
    const left = await spendLegendaryResistance(entryId);
    return { ok: true, data: { left } };
  } catch (err) {
    return fail(err, 'Could not spend the resistance.');
  }
}

export async function setLairAction(
  entryId: string,
  lair: boolean
): Promise<Result> {
  try {
    await setLair(entryId, lair === true);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the lair.');
  }
}

export async function spendRechargeFeatureAction(
  entryId: string,
  name: unknown,
  opts: { ruling?: boolean } = {}
): Promise<Result<{ ruling: boolean }>> {
  const n = z.string().min(1).max(120).safeParse(name);
  if (!n.success) return { ok: false, error: 'Which ability?' };
  try {
    const data = await spendRechargeFeature(entryId, n.data, {
      ruling: opts.ruling === true,
    });
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Could not use that.');
  }
}

/** The DM takes the last thing back (11). */
export async function undoLastAction(
  campaignId: string
): Promise<Result<{ label: string | null }>> {
  try {
    const label = await undoLast(campaignId);
    return { ok: true, data: { label } };
  } catch (err) {
    return fail(err, 'Could not undo that.');
  }
}
