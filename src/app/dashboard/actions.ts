'use server';

import { listCampaigns } from '@/server/campaigns';
import { listCharacters } from '@/server/characters';
import { listHomebrew } from '@/server/homebrew';

export interface DashboardSummary {
  characters: number;
  homebrew: number;
  campaigns: number;
  asDm: number;
}

export async function getDashboardSummaryAction(): Promise<DashboardSummary> {
  const [characters, homebrew, campaigns] = await Promise.all([
    listCharacters(),
    listHomebrew(),
    listCampaigns(),
  ]);
  return {
    characters: characters.length,
    homebrew: homebrew.length,
    campaigns: campaigns.length,
    asDm: campaigns.filter(c => c.isGM).length,
  };
}
