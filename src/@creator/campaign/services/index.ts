/**
 * Campaign service shim over server actions (SQLite via Drizzle).
 */
import {
  createCampaignAction,
  getCampaignAction,
  listCampaignsAction,
} from '../actions';

export const campaignService = {
  getCampaigns: () => listCampaignsAction(),
  getCampaign: (id: string) => getCampaignAction(id),
  createCampaign: (input: unknown) => createCampaignAction(input),
};

export type CampaignService = typeof campaignService;
