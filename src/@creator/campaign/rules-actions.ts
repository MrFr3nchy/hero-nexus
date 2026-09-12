'use server';

import { z } from 'zod';

import { sanitizeTableRulesPatch } from '@/@creator/campaign/lib/table-rules';
import { setEncounterRuleOverrides, setTableMode } from '@/server/table-rules';

type Result = { ok: true } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That fight is over, or never was.',
    FORBIDDEN: 'Only the DM and co-DMs change the rules.',
  };
  if (!messages[code]) console.error('[rules-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/** The ribbon's one tap: advise or enforce, for the whole campaign. */
export async function setTableModeAction(
  campaignId: string,
  mode: unknown
): Promise<Result> {
  const parsed = z.enum(['advise', 'enforce']).safeParse(mode);
  if (!parsed.success) return { ok: false, error: 'Advise or enforce.' };
  try {
    await setTableMode(campaignId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the rules.');
  }
}

/**
 * This fight's departures from the campaign's rules — the whole set, which
 * replaces what was there. `null` clears them all. Sanitised against the
 * registry, not re-described here.
 */
export async function setFightRulesAction(
  encounterId: string,
  overrides: unknown
): Promise<Result> {
  try {
    await setEncounterRuleOverrides(
      encounterId,
      overrides === null ? null : sanitizeTableRulesPatch(overrides)
    );
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change the rules for this fight.');
  }
}
