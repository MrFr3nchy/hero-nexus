import 'server-only';

import { desc, eq, inArray } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/db';
import { campaignMembers, campaigns } from '@/db/schema';

export interface CampaignSettings {
  rpgSystem: string;
  allowHomebrew: boolean;
  requireHomebrewApproval: boolean;
  allowPublicHomebrew: boolean;
  maxPlayers: number;
  sessionNotes: string;
  customRules: string;
}

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  rpgSystem: 'dnd5e2024',
  allowHomebrew: true,
  requireHomebrewApproval: true,
  allowPublicHomebrew: true,
  maxPlayers: 6,
  sessionNotes: '',
  customRules: '',
};

export interface CampaignRow {
  id: string;
  gmId: string;
  name: string;
  description: string;
  settings: CampaignSettings;
  status: 'active' | 'paused' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  isGM: boolean;
}

export interface CampaignInput {
  name: string;
  description?: string;
  settings?: Partial<CampaignSettings>;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error('NOT_AUTHENTICATED');
  return id;
}

function hydrate(
  row: typeof campaigns.$inferSelect,
  userId: string
): CampaignRow {
  return {
    id: row.id,
    gmId: row.gmId,
    name: row.name,
    description: row.description,
    settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...(row.settings as object) },
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isGM: row.gmId === userId,
  };
}

/** Campaigns the user runs as GM or belongs to as a member. */
export async function listCampaigns(): Promise<CampaignRow[]> {
  const userId = await requireUserId();

  const memberRows = await db
    .select({ campaignId: campaignMembers.campaignId })
    .from(campaignMembers)
    .where(eq(campaignMembers.userId, userId));
  const memberIds = memberRows.map(r => r.campaignId);

  const asGm = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.gmId, userId))
    .orderBy(desc(campaigns.updatedAt));

  const asMember = memberIds.length
    ? await db.select().from(campaigns).where(inArray(campaigns.id, memberIds))
    : [];

  const seen = new Set<string>();
  const all = [...asGm, ...asMember].filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return all.map(c => hydrate(c, userId));
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const userId = await requireUserId();
  const row = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, id),
  });
  if (!row) return null;
  if (row.gmId !== userId) {
    const member = await db.query.campaignMembers.findFirst({
      where: eq(campaignMembers.campaignId, id),
    });
    if (!member || member.userId !== userId) return null;
  }
  return hydrate(row, userId);
}

export async function createCampaign(input: CampaignInput): Promise<string> {
  const userId = await requireUserId();
  const [row] = await db
    .insert(campaigns)
    .values({
      gmId: userId,
      name: input.name,
      description: input.description ?? '',
      settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...(input.settings ?? {}) },
    })
    .returning({ id: campaigns.id });
  return row.id;
}

/* --- Phase 2 --------------------------------------------------------------- */

export async function listPendingApprovals(_campaignId: string): Promise<[]> {
  return [];
}

export async function listCampaignInvites(_campaignId: string): Promise<[]> {
  return [];
}
