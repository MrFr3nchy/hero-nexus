'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  listMyApprovals,
  requestApproval,
  type ApprovalRow,
} from '@/server/approvals';
import {
  createHomebrew,
  deleteHomebrew,
  listHomebrew,
  listPublicHomebrew,
  updateHomebrew,
  type HomebrewRow,
  type HomebrewType,
} from '@/server/homebrew';

const homebrewInputSchema = z.object({
  type: z.enum(['class', 'spell', 'item']),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(4000).optional(),
  data: z.unknown().optional(),
  visibility: z.enum(['private', 'public']).optional(),
  rpgSystem: z.string().max(40).optional(),
});

export async function listHomebrewAction(
  type?: HomebrewType
): Promise<HomebrewRow[]> {
  return listHomebrew(type);
}

export async function listPublicHomebrewAction(
  type?: HomebrewType
): Promise<HomebrewRow[]> {
  return listPublicHomebrew(type);
}

export interface SaveHomebrewResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function saveHomebrewAction(
  input: unknown,
  id?: string
): Promise<SaveHomebrewResult> {
  const parsed = homebrewInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input.',
    };
  }
  try {
    if (id) {
      await updateHomebrew(id, parsed.data);
      revalidatePath('/creator');
      return { ok: true, id };
    }
    const newId = await createHomebrew(parsed.data);
    revalidatePath('/creator');
    return { ok: true, id: newId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save homebrew.',
    };
  }
}

export async function deleteHomebrewAction(id: string): Promise<void> {
  await deleteHomebrew(id);
  revalidatePath('/creator');
}

export async function listMyApprovalsAction(): Promise<ApprovalRow[]> {
  return listMyApprovals();
}

export async function submitHomebrewToCampaignAction(
  homebrewId: string,
  campaignId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requestApproval(homebrewId, campaignId);
    revalidatePath('/creator/homebrew');
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    const messages: Record<string, string> = {
      NOT_YOUR_HOMEBREW: 'That homebrew is not yours.',
      NOT_A_MEMBER: 'You are not a member of that campaign.',
      NOT_AUTHENTICATED: 'You are not signed in.',
    };
    return { ok: false, error: messages[code] ?? 'Failed to submit.' };
  }
}
