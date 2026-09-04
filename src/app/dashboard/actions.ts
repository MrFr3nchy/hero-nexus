'use server';

import { listCampaigns } from '@/server/campaigns';
import { listCharacters, type CharacterRow } from '@/server/characters';
import { listHomebrew } from '@/server/homebrew';

export interface DashboardSummary {
  characters: number;
  homebrew: number;
  campaigns: number;
  asDm: number;
}

export interface DashboardRail {
  recentlyForged: { id: string; name: string; type: string }[];
  tablesYouRun: { id: string; name: string; memberCount: number }[];
}

export interface DashboardData {
  summary: DashboardSummary;
  rail: DashboardRail;
  characters: CharacterRow[];
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

/** Everything the dashboard renders, in one round trip. */
export async function getDashboardDataAction(): Promise<DashboardData> {
  const [characters, homebrew, campaigns] = await Promise.all([
    listCharacters(),
    listHomebrew(),
    listCampaigns(),
  ]);
  const gm = campaigns.filter(c => c.isGM);
  return {
    summary: {
      characters: characters.length,
      homebrew: homebrew.length,
      campaigns: campaigns.length,
      asDm: gm.length,
    },
    rail: {
      recentlyForged: homebrew
        .slice(0, 4)
        .map(h => ({ id: h.id, name: h.name, type: h.type })),
      tablesYouRun: gm
        .slice(0, 4)
        .map(c => ({ id: c.id, name: c.name, memberCount: c.memberCount })),
    },
    characters,
  };
}
