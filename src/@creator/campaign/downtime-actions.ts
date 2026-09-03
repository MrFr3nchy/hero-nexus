'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  DOWNTIME_KINDS,
  deleteDowntimePeriod,
  listDowntime,
  openDowntimePeriod,
  resolveDowntimeAction,
  setDowntimePeriodStatus,
  submitDowntimeAction,
  updateDowntimeAction,
  withdrawDowntimeAction,
  type DowntimePeriodRow,
} from '@/server/downtime';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That downtime item no longer exists.',
    FORBIDDEN: 'You do not have permission to do that.',
    PERIOD_CLOSED: 'This downtime window is closed.',
    BODY_REQUIRED: 'Describe what your character is doing.',
    RESPONSE_REQUIRED:
      'Add a response — a bare rejection is no use to a player.',
    NOT_YOUR_CHARACTER: 'That character is not yours.',
    NOT_YOUR_ACTION: 'That is not your downtime action.',
    ALREADY_RESOLVED: 'The DM has already responded to this one.',
  };
  // Unmapped errors reach the client as a generic sentence, which makes them
  // invisible in a bug report. Keep the real one in the server log.
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const periodSchema = z.object({
  label: z.string().trim().max(120),
  opensAt: z.string().max(40).nullish(),
  closesAt: z.string().max(40).nullish(),
});

const actionSchema = z.object({
  characterId: z.string().min(1).nullable(),
  kind: z.enum(DOWNTIME_KINDS),
  body: z.string().trim().min(1, 'Describe the action.').max(4000),
});

export async function listDowntimeAction(
  campaignId: string
): Promise<DowntimePeriodRow[]> {
  return listDowntime(campaignId);
}

export async function openDowntimeAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = periodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await openDowntimePeriod(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to open the window.');
  }
}

export async function setDowntimePeriodStatusAction(
  campaignId: string,
  periodId: string,
  status: 'open' | 'closed'
): Promise<Result> {
  try {
    await setDowntimePeriodStatus(periodId, status);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update the window.');
  }
}

export async function deleteDowntimePeriodAction(
  campaignId: string,
  periodId: string
): Promise<Result> {
  try {
    await deleteDowntimePeriod(periodId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete the window.');
  }
}

export async function submitDowntimeActionAction(
  campaignId: string,
  periodId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await submitDowntimeAction(periodId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to submit the action.');
  }
}

export async function updateDowntimeActionAction(
  campaignId: string,
  actionId: string,
  input: unknown
): Promise<Result> {
  const parsed = actionSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updateDowntimeAction(actionId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update the action.');
  }
}

export async function withdrawDowntimeActionAction(
  campaignId: string,
  actionId: string
): Promise<Result> {
  try {
    await withdrawDowntimeAction(actionId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to withdraw the action.');
  }
}

export async function resolveDowntimeActionAction(
  campaignId: string,
  actionId: string,
  status: 'resolved' | 'rejected',
  response: string
): Promise<Result> {
  try {
    await resolveDowntimeAction(actionId, status, response);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to record the response.');
  }
}
