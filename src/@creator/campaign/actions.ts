'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  listApprovals,
  reviewApproval,
  type ApprovalRow,
} from '@/server/approvals';
import { ABILITY_METHODS } from '@/@creator/character/schema';
import {
  addEntry,
  addPartyToEncounter,
  advanceTurn,
  createEncounter,
  createNote,
  deleteEncounter,
  deleteHandout as deleteHandoutSrv,
  endEncounter,
  getLiveState,
  removeEntry,
  setHandoutVisibility,
  updateEntry,
  type EntryInput,
  type LiveState,
} from '@/server/session';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  acceptInvite,
  createCampaign,
  declineInvite,
  deleteCampaign,
  getCampaign,
  inviteUserByEmail,
  joinByCode,
  leaveCampaign,
  listBuilderCampaigns,
  listCampaigns,
  listInvites,
  listMembers,
  listMyInvites,
  removeMember,
  revokeInvite,
  setCampaignStatus,
  setMemberCharacter,
  setMemberRole,
  updateCampaign,
  type BuilderCampaignRow,
  type CampaignInviteRow,
  type CampaignMemberRow,
  type CampaignRow,
} from '@/server/campaigns';

const trimmedList = z.array(z.string().trim().min(1).max(80)).max(100);

const rulesSchema = z
  .object({
    abilityMethods: z.array(z.enum(ABILITY_METHODS)).optional(),
    allowMulticlass: z.boolean().optional(),
    maxStartingLevel: z.number().int().min(1).max(20).optional(),
    allowedSources: trimmedList.optional(),
    bannedSpecies: trimmedList.optional(),
    bannedClasses: trimmedList.optional(),
    requireBackstory: z.boolean().optional(),
  })
  .optional();

const settingsSchema = z
  .object({
    rpgSystem: z.string().max(40).optional(),
    maxPlayers: z.number().int().min(1).max(20).optional(),
    allowHomebrew: z.boolean().optional(),
    requireHomebrewApproval: z.boolean().optional(),
    allowPublicHomebrew: z.boolean().optional(),
    sessionNotes: z.string().max(8000).optional(),
    customRules: z.string().max(8000).optional(),
    rules: rulesSchema,
  })
  .optional();

const campaignInputSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(120),
  description: z.string().trim().max(4000).optional(),
  settings: settingsSchema,
});

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'Campaign not found.',
    FORBIDDEN: 'You do not have permission to do that.',
    INVALID_CODE: 'That join code is not valid.',
    CAMPAIGN_FULL: 'This campaign is full.',
    USER_NOT_FOUND: 'No account with that email address.',
    ALREADY_MEMBER: 'That person is already in the campaign.',
    CANNOT_REMOVE_GM: 'The DM cannot be removed.',
    NOT_YOUR_CHARACTER: 'That character is not yours.',
    NOT_A_MEMBER: 'You are not a member of this campaign.',
    INVITE_NOT_PENDING: 'That invite is no longer pending.',
  };
  // Unmapped errors reach the client as a generic sentence, which makes them
  // invisible in a bug report. Keep the real one in the server log.
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

/* --- read ------------------------------------------------------------- */

export async function listCampaignsAction(): Promise<CampaignRow[]> {
  return listCampaigns();
}
export async function getCampaignAction(
  id: string
): Promise<CampaignRow | null> {
  return getCampaign(id);
}
export async function listMembersAction(
  campaignId: string
): Promise<CampaignMemberRow[]> {
  return listMembers(campaignId);
}
export async function listInvitesAction(
  campaignId: string
): Promise<CampaignInviteRow[]> {
  return listInvites(campaignId);
}
export async function listMyInvitesAction(): Promise<CampaignInviteRow[]> {
  return listMyInvites();
}
export async function listBuilderCampaignsAction(): Promise<
  BuilderCampaignRow[]
> {
  return listBuilderCampaigns();
}

export async function listApprovalsAction(
  campaignId: string
): Promise<ApprovalRow[]> {
  return listApprovals(campaignId);
}

export async function reviewApprovalAction(
  campaignId: string,
  approvalId: string,
  status: 'approved' | 'denied',
  notes: string
): Promise<Result> {
  try {
    await reviewApproval(approvalId, status, notes);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    if (code === 'DENY_NEEDS_NOTE') {
      return { ok: false, error: 'Add a note explaining the decision.' };
    }
    return fail(err, 'Failed to record decision.');
  }
}

/* --- mutations ------------------------------------------------------- */

export async function createCampaignAction(
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }
  try {
    const id = await createCampaign(parsed.data);
    revalidatePath('/campaigns');
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to create campaign.');
  }
}

export async function updateCampaignAction(
  id: string,
  input: unknown
): Promise<Result> {
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }
  try {
    await updateCampaign(id, parsed.data);
    revalidatePath(`/campaigns/${id}`);
    revalidatePath(`/campaigns/${id}/manage`);
    revalidatePath('/campaigns');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update campaign.');
  }
}

export async function setCampaignStatusAction(
  id: string,
  status: CampaignRow['status']
): Promise<Result> {
  try {
    await setCampaignStatus(id, status);
    revalidatePath(`/campaigns/${id}`);
    revalidatePath('/campaigns');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update campaign.');
  }
}

export async function deleteCampaignAction(id: string): Promise<Result> {
  try {
    await deleteCampaign(id);
    revalidatePath('/campaigns');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete campaign.');
  }
}

export async function joinCampaignAction(
  code: string
): Promise<Result<{ id: string }>> {
  try {
    const id = await joinByCode(code);
    revalidatePath('/campaigns');
    revalidatePath(`/campaigns/${id}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to join campaign.');
  }
}

export async function leaveCampaignAction(id: string): Promise<Result> {
  try {
    await leaveCampaign(id);
    revalidatePath('/campaigns');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to leave campaign.');
  }
}

export async function removeMemberAction(
  campaignId: string,
  userId: string
): Promise<Result> {
  try {
    await removeMember(campaignId, userId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove member.');
  }
}

export async function setMemberRoleAction(
  campaignId: string,
  userId: string,
  role: 'player' | 'co-gm'
): Promise<Result> {
  try {
    await setMemberRole(campaignId, userId, role);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change role.');
  }
}

export async function setMemberCharacterAction(
  campaignId: string,
  characterId: string | null
): Promise<Result<{ warnings: string[] }>> {
  try {
    const violations = await setMemberCharacter(campaignId, characterId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { warnings: violations.map(v => v.message) } };
  } catch (err) {
    return fail(err, 'Failed to link character.');
  }
}

export async function inviteUserAction(
  campaignId: string,
  email: string
): Promise<Result> {
  const parsed = z.string().email().safeParse(email.trim());
  if (!parsed.success)
    return { ok: false, error: 'Enter a valid email address.' };
  try {
    await inviteUserByEmail(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to send invite.');
  }
}

export async function acceptInviteAction(
  inviteId: string
): Promise<Result<{ id: string }>> {
  try {
    const id = await acceptInvite(inviteId);
    revalidatePath('/campaigns');
    revalidatePath(`/campaigns/${id}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to accept invite.');
  }
}

export async function declineInviteAction(inviteId: string): Promise<Result> {
  try {
    await declineInvite(inviteId);
    revalidatePath('/campaigns');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to decline invite.');
  }
}

export async function revokeInviteAction(
  campaignId: string,
  inviteId: string
): Promise<Result> {
  try {
    await revokeInvite(inviteId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to revoke invite.');
  }
}

/* --- live session -------------------------------------------------- */

export async function getLiveStateAction(
  campaignId: string
): Promise<LiveState> {
  return getLiveState(campaignId);
}

async function sessionAction(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Session update failed.');
  }
}

export async function createEncounterAction(
  campaignId: string,
  name: string
): Promise<Result> {
  return sessionAction(() => createEncounter(campaignId, name));
}
export async function endEncounterAction(id: string): Promise<Result> {
  return sessionAction(() => endEncounter(id));
}
export async function deleteEncounterAction(id: string): Promise<Result> {
  return sessionAction(() => deleteEncounter(id));
}
export async function advanceTurnAction(
  id: string,
  direction: 1 | -1
): Promise<Result> {
  return sessionAction(() => advanceTurn(id, direction));
}
export async function addEntryAction(
  encounterId: string,
  input: EntryInput
): Promise<Result> {
  return sessionAction(() => addEntry(encounterId, input));
}
export async function addPartyAction(encounterId: string): Promise<Result> {
  return sessionAction(() => addPartyToEncounter(encounterId));
}
export async function updateEntryAction(
  entryId: string,
  patch: Partial<EntryInput>
): Promise<Result> {
  return sessionAction(() => updateEntry(entryId, patch));
}
export async function removeEntryAction(entryId: string): Promise<Result> {
  return sessionAction(() => removeEntry(entryId));
}
export async function createNoteAction(
  campaignId: string,
  title: string,
  body: string
): Promise<Result> {
  return sessionAction(() => createNote(campaignId, title, body));
}
export async function setHandoutVisibilityAction(
  handoutId: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  return sessionAction(() => setHandoutVisibility(handoutId, visibility));
}
export async function deleteHandoutAction(handoutId: string): Promise<Result> {
  try {
    const filePath = await deleteHandoutSrv(handoutId);
    if (filePath) {
      await unlink(join(process.cwd(), 'data', 'uploads', filePath)).catch(
        () => {}
      );
    }
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete handout.');
  }
}
