'use server';

import { z } from 'zod';

import type { StandingChange } from '@/@creator/campaign/lib/standing';
import type { CombatantChoice } from '@/server/content';
import {
  addNpcToEncounter,
  encounterChoices,
  listStanding,
  recordStanding,
  removeStandingChange,
  setAttitude,
  setStatBlock,
  showStandingChange,
  statChoices,
} from '@/server/npcs';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That is not at this campaign.',
    FORBIDDEN: 'That is for the DM.',
    NOT_AN_NPC: 'Only an NPC or a creature carries that.',
    NOT_A_FACTION: 'Only a faction has standing.',
    NOT_A_CREATURE: 'A stat block has to be a creature.',
    NOT_IN_PLAY:
      'That creature is not in play here. Add its homebrew to the campaign’s allowed content first.',
    NO_STAT_BLOCK: 'Give it a stat block first.',
    BAD_ATTITUDE: 'Friendly, indifferent or hostile.',
    BAD_DELTA: 'A step of one to three, up or down.',
    FACTION_HIDDEN:
      'The party has not been shown this faction. Show the party the faction first, or its standing would name it.',
    ALREADY_SHOWN: 'The party has been shown that one; it stays.',
  };
  if (!messages[code]) console.error('[npc-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

export async function setAttitudeAction(
  entryId: string,
  attitude: string | null
): Promise<Result> {
  const parsed = z
    .enum(['friendly', 'indifferent', 'hostile'])
    .nullable()
    .safeParse(attitude);
  if (!parsed.success) return { ok: false, error: 'That did not read.' };
  try {
    await setAttitude(entryId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not set the attitude.');
  }
}

const refSchema = z
  .object({
    source: z.enum(['srd', 'homebrew']),
    type: z.literal('creature'),
    key: z.string().min(1).max(200),
    name: z.string().max(200).optional(),
  })
  .nullable();

export async function setStatBlockAction(
  entryId: string,
  ref: unknown
): Promise<Result> {
  const parsed = refSchema.safeParse(ref);
  if (!parsed.success) return { ok: false, error: 'Pick a creature.' };
  try {
    await setStatBlock(
      entryId,
      parsed.data
        ? { source: parsed.data.source, type: 'creature', key: parsed.data.key }
        : null
    );
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not link that stat block.');
  }
}

export async function statChoicesAction(
  campaignId: string
): Promise<Result<CombatantChoice[]>> {
  try {
    return { ok: true, data: await statChoices(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the bestiary.');
  }
}

export async function encounterChoicesAction(
  campaignId: string
): Promise<Result<{ id: string; name: string }[]>> {
  try {
    return { ok: true, data: await encounterChoices(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the encounters.');
  }
}

export async function addNpcToEncounterAction(
  entryId: string,
  planId: string,
  count: number
): Promise<Result> {
  try {
    await addNpcToEncounter(entryId, String(planId), Number(count) || 1);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not add it to that encounter.');
  }
}

export async function listStandingAction(
  entryId: string
): Promise<Result<StandingChange[]>> {
  try {
    return { ok: true, data: await listStanding(entryId) };
  } catch (err) {
    return fail(err, 'Could not read the standing.');
  }
}

const recordSchema = z.object({
  delta: z.number().int(),
  reason: z.string().max(300),
  show: z.boolean(),
});

export async function recordStandingAction(
  entryId: string,
  input: unknown
): Promise<Result> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That did not read.' };
  try {
    await recordStanding(entryId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not record that.');
  }
}

/** Show the party one standing change. */
export async function showStandingChangeAction(
  changeId: string
): Promise<Result> {
  try {
    await showStandingChange(changeId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not show the party.');
  }
}

export async function removeStandingChangeAction(
  changeId: string
): Promise<Result> {
  try {
    await removeStandingChange(changeId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not strike that.');
  }
}
