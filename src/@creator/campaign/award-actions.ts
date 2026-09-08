'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  awardExperience,
  defaultRecipients,
  deleteAward,
  listAwards,
  type AwardRow,
} from '@/server/awards';

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
    NOTHING_TO_AWARD: 'Say how much before handing it out.',
    NO_RECIPIENTS: 'Nobody at this table could receive it.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const awardSchema = z.object({
  sessionId: z.string().min(1).nullable().optional(),
  kind: z.enum(['xp', 'milestone']),
  xp: z.number().int().min(0).max(1_000_000).optional(),
  levels: z.number().int().min(1).max(20).optional(),
  note: z.string().trim().max(400).optional(),
  characterIds: z.array(z.string().min(1)).max(20).optional(),
});

export async function listAwardsAction(
  campaignId: string
): Promise<AwardRow[]> {
  return listAwards(campaignId);
}

export async function defaultRecipientsAction(
  campaignId: string,
  sessionId: string | null
): Promise<{ characterId: string; name: string }[]> {
  return defaultRecipients(campaignId, sessionId);
}

export async function awardExperienceAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ granted: number; skipped: number }>> {
  const parsed = awardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const { granted, skipped } = await awardExperience(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { granted, skipped } };
  } catch (err) {
    return fail(err, 'Failed to hand it out.');
  }
}

export async function deleteAwardAction(
  campaignId: string,
  awardId: string
): Promise<Result> {
  try {
    await deleteAward(awardId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to strike the award.');
  }
}
