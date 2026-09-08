'use server';

import { searchCampaign, type SearchHit } from '@/server/search';

/**
 * Search a campaign. Returns only what the viewer could already have read —
 * the server module is built on the same role-filtered readers the tabs use.
 */
export async function searchCampaignAction(
  campaignId: string,
  query: string
): Promise<SearchHit[]> {
  try {
    return await searchCampaign(campaignId, query);
  } catch {
    return [];
  }
}
