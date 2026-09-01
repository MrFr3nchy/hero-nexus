import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/db';
import {
  campaignInvites,
  campaignMembers,
  campaigns,
  characterHomebrew,
  characters,
  homebrewApprovals,
  users,
} from '@/db/schema';

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

export type CampaignRole = 'gm' | 'co-gm' | 'player';

export interface CampaignRow {
  id: string;
  gmId: string;
  name: string;
  description: string;
  settings: CampaignSettings;
  status: 'active' | 'paused' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  role: CampaignRole;
  isGM: boolean;
  /** Only present for gm / co-gm. */
  joinCode?: string | null;
  memberCount: number;
}

export interface CampaignMemberRow {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: CampaignRole;
  status: 'active' | 'inactive';
  joinedAt: string;
  characterId: string | null;
  characterName: string | null;
}

export interface CampaignInviteRow {
  id: string;
  campaignId: string;
  campaignName: string;
  invitedUserId: string;
  invitedEmail: string | null;
  invitedName: string | null;
  invitedByName: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
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

const JOIN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function makeJoinCode(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)];
  }
  return out;
}

async function memberCount(campaignId: string): Promise<number> {
  const rows = await db
    .select({ id: campaignMembers.id })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );
  return rows.length + 1; // + the GM, who is not a member row
}

async function roleInCampaign(
  campaignId: string,
  userId: string
): Promise<{
  role: CampaignRole;
  campaign: typeof campaigns.$inferSelect;
} | null> {
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) return null;
  if (campaign.gmId === userId) return { role: 'gm', campaign };
  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  if (!member) return null;
  return { role: member.role === 'co-gm' ? 'co-gm' : 'player', campaign };
}

/**
 * Resolve the caller's role in a campaign and assert it is allowed.
 * Shared authorization gate for all campaign features (B–E).
 */
export async function requireCampaignRole(
  campaignId: string,
  allowed: CampaignRole[]
): Promise<{
  userId: string;
  role: CampaignRole;
  campaign: typeof campaigns.$inferSelect;
}> {
  const userId = await requireUserId();
  const found = await roleInCampaign(campaignId, userId);
  if (!found) throw new Error('NOT_FOUND');
  if (!allowed.includes(found.role)) throw new Error('FORBIDDEN');
  return { userId, role: found.role, campaign: found.campaign };
}

function hydrate(
  row: typeof campaigns.$inferSelect,
  role: CampaignRole,
  count: number
): CampaignRow {
  const isStaff = role === 'gm' || role === 'co-gm';
  return {
    id: row.id,
    gmId: row.gmId,
    name: row.name,
    description: row.description,
    settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...(row.settings as object) },
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    role,
    isGM: role === 'gm',
    joinCode: isStaff ? row.joinCode : undefined,
    memberCount: count,
  };
}

/** Campaigns the user runs as GM or belongs to as a member. */
export async function listCampaigns(): Promise<CampaignRow[]> {
  const userId = await requireUserId();

  const memberRows = await db
    .select({
      campaignId: campaignMembers.campaignId,
      role: campaignMembers.role,
    })
    .from(campaignMembers)
    .where(eq(campaignMembers.userId, userId));
  const roleByCampaign = new Map<string, CampaignRole>(
    memberRows.map(r => [r.campaignId, r.role === 'co-gm' ? 'co-gm' : 'player'])
  );

  const asGm = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.gmId, userId))
    .orderBy(desc(campaigns.updatedAt));

  const memberIds = memberRows.map(r => r.campaignId);
  const asMember = memberIds.length
    ? await db.select().from(campaigns).where(inArray(campaigns.id, memberIds))
    : [];

  const seen = new Set<string>();
  const all = [...asGm, ...asMember].filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return Promise.all(
    all.map(async c =>
      hydrate(
        c,
        c.gmId === userId ? 'gm' : (roleByCampaign.get(c.id) ?? 'player'),
        await memberCount(c.id)
      )
    )
  );
}

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const userId = await requireUserId();
  const found = await roleInCampaign(id, userId);
  if (!found) return null;
  return hydrate(found.campaign, found.role, await memberCount(id));
}

export async function createCampaign(input: CampaignInput): Promise<string> {
  const userId = await requireUserId();

  let joinCode = makeJoinCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const clash = await db.query.campaigns.findFirst({
      where: eq(campaigns.joinCode, joinCode),
    });
    if (!clash) break;
    joinCode = makeJoinCode();
  }

  const [row] = await db
    .insert(campaigns)
    .values({
      gmId: userId,
      name: input.name,
      description: input.description ?? '',
      joinCode,
      settings: { ...DEFAULT_CAMPAIGN_SETTINGS, ...(input.settings ?? {}) },
    })
    .returning({ id: campaigns.id });
  return row.id;
}

export async function updateCampaign(
  id: string,
  input: CampaignInput
): Promise<void> {
  const { campaign } = await requireCampaignRole(id, ['gm', 'co-gm']);
  await db
    .update(campaigns)
    .set({
      name: input.name,
      description: input.description ?? '',
      settings: {
        ...DEFAULT_CAMPAIGN_SETTINGS,
        ...(campaign.settings as object),
        ...(input.settings ?? {}),
      },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaigns.id, id));
}

export async function setCampaignStatus(
  id: string,
  status: CampaignRow['status']
): Promise<void> {
  await requireCampaignRole(id, ['gm']);
  await db
    .update(campaigns)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(campaigns.id, id));
}

export async function deleteCampaign(id: string): Promise<void> {
  await requireCampaignRole(id, ['gm']);
  await db.delete(campaigns).where(eq(campaigns.id, id));
}

/* --- Members ------------------------------------------------------------- */

export async function listMembers(
  campaignId: string
): Promise<CampaignMemberRow[]> {
  const { campaign } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);

  const gm = await db.query.users.findFirst({
    where: eq(users.id, campaign.gmId),
  });

  const rows = await db
    .select({
      userId: campaignMembers.userId,
      role: campaignMembers.role,
      status: campaignMembers.status,
      joinedAt: campaignMembers.joinedAt,
      characterId: campaignMembers.characterId,
      name: users.name,
      email: users.email,
      image: users.image,
      characterName: characters.name,
    })
    .from(campaignMembers)
    .innerJoin(users, eq(users.id, campaignMembers.userId))
    .leftJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(eq(campaignMembers.campaignId, campaignId))
    .orderBy(campaignMembers.joinedAt);

  const gmRow: CampaignMemberRow = {
    userId: campaign.gmId,
    name: gm?.name ?? null,
    email: gm?.email ?? null,
    image: gm?.image ?? null,
    role: 'gm',
    status: 'active',
    joinedAt: campaign.createdAt,
    characterId: null,
    characterName: null,
  };

  return [
    gmRow,
    ...rows.map(r => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      image: r.image,
      role: (r.role === 'co-gm' ? 'co-gm' : 'player') as CampaignRole,
      status: r.status,
      joinedAt: r.joinedAt,
      characterId: r.characterId,
      characterName: r.characterName,
    })),
  ];
}

export async function joinByCode(code: string): Promise<string> {
  const userId = await requireUserId();
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.joinCode, code.trim().toLowerCase()),
  });
  if (!campaign) throw new Error('INVALID_CODE');

  if (campaign.gmId === userId) return campaign.id;

  const existing = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaign.id),
      eq(campaignMembers.userId, userId)
    ),
  });
  if (existing) return campaign.id;

  const settings = {
    ...DEFAULT_CAMPAIGN_SETTINGS,
    ...(campaign.settings as object),
  };
  if ((await memberCount(campaign.id)) >= settings.maxPlayers + 1) {
    throw new Error('CAMPAIGN_FULL');
  }

  await db
    .insert(campaignMembers)
    .values({ campaignId: campaign.id, userId, role: 'player' });
  return campaign.id;
}

export async function leaveCampaign(campaignId: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      )
    );
}

export async function removeMember(
  campaignId: string,
  targetUserId: string
): Promise<void> {
  const { campaign } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  if (targetUserId === campaign.gmId) throw new Error('CANNOT_REMOVE_GM');
  await db
    .delete(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, targetUserId)
      )
    );
}

export async function setMemberRole(
  campaignId: string,
  targetUserId: string,
  role: 'player' | 'co-gm'
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm']);
  await db
    .update(campaignMembers)
    .set({ role })
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, targetUserId)
      )
    );
}

/** The calling member links one of their own characters to this campaign. */
export async function setMemberCharacter(
  campaignId: string,
  characterId: string | null
): Promise<void> {
  const userId = await requireUserId();

  if (characterId) {
    const character = await db.query.characters.findFirst({
      where: eq(characters.id, characterId),
    });
    if (!character || character.ownerId !== userId) {
      throw new Error('NOT_YOUR_CHARACTER');
    }
  }

  const result = await db
    .update(campaignMembers)
    .set({ characterId })
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.userId, userId)
      )
    )
    .returning({ id: campaignMembers.id });
  if (result.length === 0) throw new Error('NOT_A_MEMBER');

  if (characterId) {
    await submitCharacterHomebrewForApproval(campaignId, characterId, userId);
  }
}

/**
 * When a character with homebrew content joins a campaign, queue each of its
 * custom entries for the DM to approve or reject. Idempotent.
 */
async function submitCharacterHomebrewForApproval(
  campaignId: string,
  characterId: string,
  userId: string
): Promise<void> {
  const links = await db
    .select({ homebrewId: characterHomebrew.homebrewId })
    .from(characterHomebrew)
    .where(eq(characterHomebrew.characterId, characterId));
  if (links.length === 0) return;

  const existing = await db
    .select({ homebrewId: homebrewApprovals.homebrewId })
    .from(homebrewApprovals)
    .where(eq(homebrewApprovals.campaignId, campaignId));
  const already = new Set(existing.map(r => r.homebrewId));

  const fresh = links.filter(l => !already.has(l.homebrewId));
  if (fresh.length === 0) return;

  await db.insert(homebrewApprovals).values(
    fresh.map(l => ({
      campaignId,
      homebrewId: l.homebrewId,
      requestedByUserId: userId,
    }))
  );
}

/* --- Invites ----------------------------------------------------------- */

export async function inviteUserByEmail(
  campaignId: string,
  email: string
): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const invited = await db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });
  if (!invited) throw new Error('USER_NOT_FOUND');

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (campaign?.gmId === invited.id) throw new Error('ALREADY_MEMBER');

  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, invited.id)
    ),
  });
  if (member) throw new Error('ALREADY_MEMBER');

  const pending = await db.query.campaignInvites.findFirst({
    where: and(
      eq(campaignInvites.campaignId, campaignId),
      eq(campaignInvites.invitedUserId, invited.id),
      eq(campaignInvites.status, 'pending')
    ),
  });
  if (pending) return;

  await db.insert(campaignInvites).values({
    campaignId,
    invitedUserId: invited.id,
    invitedByUserId: userId,
  });
}

export async function listInvites(
  campaignId: string
): Promise<CampaignInviteRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const rows = await db
    .select({
      id: campaignInvites.id,
      campaignId: campaignInvites.campaignId,
      campaignName: campaigns.name,
      invitedUserId: campaignInvites.invitedUserId,
      invitedEmail: users.email,
      invitedName: users.name,
      status: campaignInvites.status,
      createdAt: campaignInvites.createdAt,
    })
    .from(campaignInvites)
    .innerJoin(campaigns, eq(campaigns.id, campaignInvites.campaignId))
    .innerJoin(users, eq(users.id, campaignInvites.invitedUserId))
    .where(
      and(
        eq(campaignInvites.campaignId, campaignId),
        eq(campaignInvites.status, 'pending')
      )
    )
    .orderBy(desc(campaignInvites.createdAt));
  return rows.map(r => ({ ...r, invitedByName: null }));
}

export async function listMyInvites(): Promise<CampaignInviteRow[]> {
  const userId = await requireUserId();

  const rows = await db
    .select({
      id: campaignInvites.id,
      campaignId: campaignInvites.campaignId,
      campaignName: campaigns.name,
      invitedUserId: campaignInvites.invitedUserId,
      status: campaignInvites.status,
      createdAt: campaignInvites.createdAt,
      invitedByName: users.name,
    })
    .from(campaignInvites)
    .innerJoin(campaigns, eq(campaigns.id, campaignInvites.campaignId))
    .innerJoin(users, eq(users.id, campaignInvites.invitedByUserId))
    .where(
      and(
        eq(campaignInvites.invitedUserId, userId),
        eq(campaignInvites.status, 'pending')
      )
    )
    .orderBy(desc(campaignInvites.createdAt));

  return rows.map(r => ({
    ...r,
    invitedEmail: null,
    invitedName: null,
  }));
}

export async function acceptInvite(inviteId: string): Promise<string> {
  const userId = await requireUserId();
  const invite = await db.query.campaignInvites.findFirst({
    where: eq(campaignInvites.id, inviteId),
  });
  if (!invite || invite.invitedUserId !== userId) throw new Error('NOT_FOUND');
  if (invite.status !== 'pending') throw new Error('INVITE_NOT_PENDING');

  const existing = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, invite.campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });
  if (!existing) {
    await db.insert(campaignMembers).values({
      campaignId: invite.campaignId,
      userId,
      role: 'player',
    });
  }
  await db
    .update(campaignInvites)
    .set({ status: 'accepted' })
    .where(eq(campaignInvites.id, inviteId));
  return invite.campaignId;
}

export async function declineInvite(inviteId: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .update(campaignInvites)
    .set({ status: 'declined' })
    .where(
      and(
        eq(campaignInvites.id, inviteId),
        eq(campaignInvites.invitedUserId, userId)
      )
    );
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const invite = await db.query.campaignInvites.findFirst({
    where: eq(campaignInvites.id, inviteId),
  });
  if (!invite) return;
  await requireCampaignRole(invite.campaignId, ['gm', 'co-gm']);
  await db.delete(campaignInvites).where(eq(campaignInvites.id, inviteId));
}

/* --- Phase 2 placeholders -------------------------------------------------- */

export async function listPendingApprovals(_campaignId: string): Promise<[]> {
  return [];
}
