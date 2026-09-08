'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { ContentRef } from '@/@shared/content';
import {
  addPlanLine,
  createPlan,
  deletePlan,
  listPlans,
  removePlanLine,
  runPlan,
  setPlanLineCount,
  updatePlan,
  type PlanRow,
} from '@/server/encounter-plans';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That no longer exists.',
    FORBIDDEN: 'You do not have permission to do that.',
    NOT_A_CREATURE: 'Only a creature can be put in a fight.',
    NO_SUCH_CREATURE: 'That creature is no longer in the bestiary.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const planSchema = z.object({
  name: z.string().trim().min(1, 'Name the fight.').max(160),
  notes: z.string().max(8000).optional(),
  sessionId: z.string().min(1).nullable().optional(),
});

const refSchema = z.object({
  source: z.enum(['srd', 'homebrew']),
  type: z.literal('creature'),
  key: z.string().min(1),
});

export async function listPlansAction(campaignId: string): Promise<PlanRow[]> {
  return listPlans(campaignId);
}

export async function createPlanAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await createPlan(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to start the plan.');
  }
}

export async function updatePlanAction(
  campaignId: string,
  planId: string,
  input: unknown
): Promise<Result> {
  const parsed = planSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updatePlan(planId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the plan.');
  }
}

export async function deletePlanAction(
  campaignId: string,
  planId: string
): Promise<Result> {
  try {
    await deletePlan(planId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to tear up the plan.');
  }
}

export async function addPlanLineAction(
  planId: string,
  ref: unknown,
  count: number
): Promise<Result> {
  const parsed = refSchema.safeParse(ref);
  if (!parsed.success) {
    return { ok: false, error: 'That is not a creature.' };
  }
  try {
    await addPlanLine(planId, parsed.data as ContentRef, count);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to add it to the fight.');
  }
}

export async function setPlanLineCountAction(
  lineId: string,
  count: number
): Promise<Result> {
  try {
    await setPlanLineCount(lineId, count);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change how many.');
  }
}

export async function removePlanLineAction(lineId: string): Promise<Result> {
  try {
    await removePlanLine(lineId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove it.');
  }
}

/**
 * Deal the plan out as a live fight. The plan survives it, so the same ambush
 * can be run again.
 */
export async function runPlanAction(
  campaignId: string,
  planId: string
): Promise<Result<{ encounterId: string; skipped: number }>> {
  try {
    const data = await runPlan(planId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Failed to call for initiative.');
  }
}
