/**
 * Campaign service shim over server actions (SQLite via Drizzle).
 * Phase 1: list + create campaigns. Approvals / invites / marketplace are Phase 2.
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

  // Phase 2 — present so callers compile; return empty / no-op for now.
  getPendingApprovals: async (_campaignId: string): Promise<[]> => [],
  getPublicHomebrew: async (): Promise<[]> => [],
  getCampaignNotes: async (_campaignId: string): Promise<[]> => [],
  getCampaignImages: async (_campaignId: string): Promise<[]> => [],
};

export type CampaignService = typeof campaignService;
