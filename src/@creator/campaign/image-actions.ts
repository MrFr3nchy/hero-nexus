'use server';

import {
  listCampaignImages,
  type CampaignImageRow,
} from '@/server/campaign-images';

/** The campaign's picture library. Any member may read; staff upload. */
export async function listCampaignImagesAction(
  campaignId: string
): Promise<CampaignImageRow[]> {
  try {
    return await listCampaignImages(campaignId);
  } catch {
    return [];
  }
}
