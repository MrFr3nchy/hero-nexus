'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  createCampaign,
  getCampaign,
  listCampaigns,
  type CampaignRow,
} from '@/server/campaigns';

const campaignInputSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(120),
  description: z.string().trim().max(4000).optional(),
  settings: z
    .object({
      rpgSystem: z.string().max(40).optional(),
      maxPlayers: z.number().int().min(1).max(20).optional(),
      allowHomebrew: z.boolean().optional(),
      requireHomebrewApproval: z.boolean().optional(),
      allowPublicHomebrew: z.boolean().optional(),
      sessionNotes: z.string().max(8000).optional(),
      customRules: z.string().max(8000).optional(),
    })
    .optional(),
});

export async function listCampaignsAction(): Promise<CampaignRow[]> {
  return listCampaigns();
}

export async function getCampaignAction(
  id: string
): Promise<CampaignRow | null> {
  return getCampaign(id);
}

export interface CreateCampaignResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function createCampaignAction(
  input: unknown
): Promise<CreateCampaignResult> {
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
    return { ok: true, id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to create campaign.',
    };
  }
}
