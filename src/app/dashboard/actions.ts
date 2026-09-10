'use server';

import { listCampaigns } from '@/server/campaigns';
import { listCharacters, type CharacterRow } from '@/server/characters';
import { listHomebrew } from '@/server/homebrew';

export interface DashboardSummary {
  characters: number;
  /** Heroes still being built. Counted apart; they are not party members. */
  drafts: number;
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
  /**
   * The party — finished heroes only.
   *
   * The dashboard leads with this row (design rule 1: the object is the hero),
   * and a half-built character with no class and no species is not a hero
   * waiting on your word. Drafts are counted in `summary.drafts` and picked up
   * from `/characters`, where they have their own section.
   */
  characters: CharacterRow[];
}

const isReady = (c: CharacterRow) => c.status !== 'draft';

export async function getDashboardSummaryAction(): Promise<DashboardSummary> {
  const [characters, homebrew, campaigns] = await Promise.all([
    listCharacters(),
    listHomebrew(),
    listCampaigns(),
  ]);
  return {
    characters: characters.filter(isReady).length,
    drafts: characters.length - characters.filter(isReady).length,
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
  const ready = characters.filter(isReady);
  return {
    summary: {
      characters: ready.length,
      drafts: characters.length - ready.length,
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
    characters: ready,
  };
}
