'use server';

import { z } from 'zod';

import { ABILITY_KEYS, SKILL_KEYS } from '@/@creator/character/schema';
import {
  answerCheck,
  cancelCheck,
  dismissCheck,
  listChecks,
  requestCheck,
  type CheckRow,
} from '@/server/checks';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That request no longer exists.',
    FORBIDDEN: 'Only the DM and co-DMs ask for rolls.',
    NOBODY_TO_ASK: 'Nobody at this table would receive that.',
    NOT_ASKED: 'That was not asked of you.',
    CHECK_CLOSED: 'That request is already settled.',
    ALREADY_ANSWERED: 'You have already answered that one.',
  };
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/**
 * What a check may be asked for.
 *
 * The skill and ability vocabularies are read out of the character schema
 * rather than typed again, so a skill the sheet does not have cannot be asked
 * for and a skill added later needs no change here.
 */
const checkSchema = z
  .object({
    kind: z.enum(['check', 'save', 'free']),
    skill: z.enum(SKILL_KEYS).nullable().optional(),
    ability: z.enum(ABILITY_KEYS).nullable().optional(),
    prompt: z.string().trim().max(200).optional(),
    dc: z.number().int().min(1).max(40).nullable().optional(),
    dcVisibility: z.enum(['hidden', 'shown']).optional(),
    targetUserIds: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine(
    v => v.kind !== 'save' || !!v.ability,
    'A saving throw needs an ability.'
  )
  .refine(
    v => v.kind !== 'check' || !!v.skill || !!v.ability,
    'Say what the check is against.'
  )
  .refine(
    v => v.kind !== 'free' || !!v.prompt?.trim(),
    'Say what you are asking for.'
  );

export async function listChecksAction(
  campaignId: string
): Promise<CheckRow[]> {
  try {
    return await listChecks(campaignId);
  } catch {
    return [];
  }
}

export async function requestCheckAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid request.',
    };
  }
  try {
    const id = await requestCheck(campaignId, parsed.data);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Could not ask for that.');
  }
}

export async function answerCheckAction(
  checkId: string,
  mode: 'straight' | 'advantage' | 'disadvantage'
): Promise<Result> {
  try {
    await answerCheck(checkId, mode);
    return { ok: true };
  } catch (err) {
    return fail(err, 'The dice did not land.');
  }
}

export async function dismissCheckAction(checkId: string): Promise<Result> {
  try {
    await dismissCheck(checkId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not set that aside.');
  }
}

export async function cancelCheckAction(checkId: string): Promise<Result> {
  try {
    await cancelCheck(checkId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not withdraw it.');
  }
}
