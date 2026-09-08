'use server';

import { revalidatePath } from 'next/cache';

import {
  addCampaignContent,
  listCampaignContent,
  removeCampaignContent,
  setCampaignContentNote,
  type LibraryEntry,
} from '@/server/campaign-content';
import { listCombatantChoices, type CombatantChoice } from '@/server/content';
import { listHomebrew, type HomebrewRow } from '@/server/homebrew';

/**
 * The `'use server'` boundary for a campaign's content library.
 *
 * Its own file rather than more lines in `./actions.ts`, matching how
 * `./canon-actions.ts` sits beside it: one action per server function, each
 * revalidating the campaign page.
 */

type Result = { ok: true } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    NOT_FOUND: 'That content no longer exists.',
    FORBIDDEN: 'Only the DM and co-DMs manage the content library.',
  };
  if (!messages[code]) console.error('[content-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/* --- read ------------------------------------------------------------- */

export async function listCampaignContentAction(
  campaignId: string
): Promise<LibraryEntry[]> {
  return listCampaignContent(campaignId);
}

/** The caller's own homebrew, for the "add to this table" picker. */
export async function listMyHomebrewAction(): Promise<HomebrewRow[]> {
  return listHomebrew();
}

/* --- mutations -------------------------------------------------------- */

export async function addCampaignContentAction(
  campaignId: string,
  homebrewId: string,
  note = ''
): Promise<Result> {
  try {
    await addCampaignContent(campaignId, homebrewId, {
      source: 'gm-authored',
      note,
    });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to add that to the table.');
  }
}

export async function removeCampaignContentAction(
  campaignId: string,
  libraryId: string
): Promise<Result> {
  try {
    await removeCampaignContent(campaignId, libraryId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove that from the table.');
  }
}

export async function setCampaignContentNoteAction(
  campaignId: string,
  libraryId: string,
  note: string
): Promise<Result> {
  try {
    await setCampaignContentNote(campaignId, libraryId, note);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the note.');
  }
}

/**
 * The monsters this table can put in a fight: the SRD bestiary, the DM's own
 * homebrew, and whatever is in the campaign's library.
 */
export async function listCombatantChoicesAction(
  campaignId: string
): Promise<CombatantChoice[]> {
  return listCombatantChoices(campaignId);
}
