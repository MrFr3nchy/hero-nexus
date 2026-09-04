import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignMembers,
  campaignQuestObjectives,
  campaignQuests,
  characters,
  partyLoot,
  partyTreasury,
} from '@/db/schema';
import {
  COIN_KEYS,
  EMPTY_TREASURY,
  type Treasury,
} from '@/@creator/campaign/lib/treasury';
import { requireCampaignRole, type CampaignRole } from './campaigns';

export type QuestStatus = 'rumour' | 'active' | 'done' | 'failed';
export type LootKind = 'item' | 'consumable' | 'treasure' | 'magic';

export {
  COIN_IN_COPPER,
  COIN_KEYS,
  splitTreasury,
  type CoinKey,
  type SplitResult,
  type Treasury,
} from '@/@creator/campaign/lib/treasury';

export interface ObjectiveRow {
  id: string;
  body: string;
  done: boolean;
  visibility: 'dm' | 'shared';
  sortOrder: number;
}

export interface QuestRow {
  id: string;
  title: string;
  summary: string;
  /** Null for a player — the DM's notes never travel. */
  dmNotes: string | null;
  giver: string;
  reward: string;
  status: QuestStatus;
  visibility: 'dm' | 'shared';
  sortOrder: number;
  objectives: ObjectiveRow[];
}

export interface LootRow {
  id: string;
  name: string;
  quantity: number;
  notes: string;
  kind: LootKind;
  holderCharacterId: string | null;
  holderName: string | null;
  identified: boolean;
}

export interface LedgerState {
  loot: LootRow[];
  treasury: Treasury;
  /** Party members who can hold something, for the "who has it" picker. */
  holders: { characterId: string; name: string }[];
  /**
   * How many players are at the table — the sensible default for a split,
   * since a haul is divided among the party and not with the DM (who has no
   * `campaign_members` row anyway).
   *
   * Deliberately not `holders.length`: a party of five who have not linked
   * their characters yet would otherwise default to splitting the purse one
   * way, which is never what anyone means.
   */
  partySize: number;
}

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

async function anyMember(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
}

/* --- quests ----------------------------------------------------------- */

/**
 * Every quest a viewer may see, with its objectives.
 *
 * A player receives shared quests only, without the DM's notes and without
 * DM-only objectives — filtered here rather than in the component, so a hook
 * the party has not heard yet never reaches their browser.
 */
export async function listQuests(campaignId: string): Promise<QuestRow[]> {
  const { role } = await anyMember(campaignId);
  const isStaff = isStaffRole(role);

  const rows = await db
    .select()
    .from(campaignQuests)
    .where(eq(campaignQuests.campaignId, campaignId))
    .orderBy(asc(campaignQuests.sortOrder), asc(campaignQuests.createdAt));

  const visible = isStaff ? rows : rows.filter(q => q.visibility === 'shared');
  if (visible.length === 0) return [];

  const objectives = await db
    .select()
    .from(campaignQuestObjectives)
    .where(
      inArray(
        campaignQuestObjectives.questId,
        visible.map(q => q.id)
      )
    )
    .orderBy(asc(campaignQuestObjectives.sortOrder));

  return visible.map(q => ({
    id: q.id,
    title: q.title,
    summary: q.summary,
    dmNotes: isStaff ? q.dmNotes : null,
    giver: q.giver,
    reward: q.reward,
    status: q.status,
    visibility: q.visibility,
    sortOrder: q.sortOrder,
    objectives: objectives
      .filter(o => o.questId === q.id && (isStaff || o.visibility === 'shared'))
      .map(o => ({
        id: o.id,
        body: o.body,
        done: o.done,
        visibility: o.visibility,
        sortOrder: o.sortOrder,
      })),
  }));
}

export interface QuestInput {
  title: string;
  summary?: string;
  dmNotes?: string;
  giver?: string;
  reward?: string;
  status?: QuestStatus;
  visibility?: 'dm' | 'shared';
}

async function staffForQuest(questId: string) {
  const quest = await db.query.campaignQuests.findFirst({
    where: eq(campaignQuests.id, questId),
  });
  if (!quest) throw new Error('NOT_FOUND');
  await staff(quest.campaignId);
  return quest;
}

export async function createQuest(
  campaignId: string,
  input: QuestInput
): Promise<string> {
  const { userId } = await staff(campaignId);
  const existing = await db
    .select({ sortOrder: campaignQuests.sortOrder })
    .from(campaignQuests)
    .where(eq(campaignQuests.campaignId, campaignId));
  const next = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

  const [row] = await db
    .insert(campaignQuests)
    .values({
      campaignId,
      title: input.title.trim(),
      summary: input.summary ?? '',
      dmNotes: input.dmNotes ?? '',
      giver: input.giver ?? '',
      reward: input.reward ?? '',
      status: input.status ?? 'active',
      visibility: input.visibility ?? 'dm',
      sortOrder: next,
      createdBy: userId,
    })
    .returning({ id: campaignQuests.id });
  return row.id;
}

export async function updateQuest(
  questId: string,
  patch: Partial<QuestInput>
): Promise<void> {
  await staffForQuest(questId);
  const set: Partial<typeof campaignQuests.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.summary !== undefined) set.summary = patch.summary;
  if (patch.dmNotes !== undefined) set.dmNotes = patch.dmNotes;
  if (patch.giver !== undefined) set.giver = patch.giver;
  if (patch.reward !== undefined) set.reward = patch.reward;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;

  await db
    .update(campaignQuests)
    .set(set)
    .where(eq(campaignQuests.id, questId));
}

export async function deleteQuest(questId: string): Promise<void> {
  await staffForQuest(questId);
  await db.delete(campaignQuests).where(eq(campaignQuests.id, questId));
}

export async function addObjective(
  questId: string,
  body: string,
  visibility: 'dm' | 'shared' = 'shared'
): Promise<void> {
  await staffForQuest(questId);
  const existing = await db
    .select({ sortOrder: campaignQuestObjectives.sortOrder })
    .from(campaignQuestObjectives)
    .where(eq(campaignQuestObjectives.questId, questId));
  const next = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

  await db.insert(campaignQuestObjectives).values({
    questId,
    body: body.trim(),
    visibility,
    sortOrder: next,
  });
}

async function staffForObjective(objectiveId: string) {
  const objective = await db.query.campaignQuestObjectives.findFirst({
    where: eq(campaignQuestObjectives.id, objectiveId),
  });
  if (!objective) throw new Error('NOT_FOUND');
  await staffForQuest(objective.questId);
  return objective;
}

export async function setObjectiveDone(
  objectiveId: string,
  done: boolean
): Promise<void> {
  await staffForObjective(objectiveId);
  await db
    .update(campaignQuestObjectives)
    .set({ done })
    .where(eq(campaignQuestObjectives.id, objectiveId));
}

export async function setObjectiveVisibility(
  objectiveId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  await staffForObjective(objectiveId);
  await db
    .update(campaignQuestObjectives)
    .set({ visibility })
    .where(eq(campaignQuestObjectives.id, objectiveId));
}

export async function deleteObjective(objectiveId: string): Promise<void> {
  await staffForObjective(objectiveId);
  await db
    .delete(campaignQuestObjectives)
    .where(eq(campaignQuestObjectives.id, objectiveId));
}

/* --- the party ledger -------------------------------------------------- */

/**
 * The haul and the purse.
 *
 * Readable and writable by every member, not just staff — the party's own
 * inventory is the party's to keep, and a DM being the only one who can write
 * down the potion they just handed over is how the ledger goes stale.
 */
export async function getLedger(campaignId: string): Promise<LedgerState> {
  await anyMember(campaignId);

  const rows = await db
    .select({
      loot: partyLoot,
      holderName: characters.name,
    })
    .from(partyLoot)
    .leftJoin(characters, eq(characters.id, partyLoot.holderCharacterId))
    .where(eq(partyLoot.campaignId, campaignId))
    .orderBy(asc(partyLoot.createdAt));

  const purse = await db.query.partyTreasury.findFirst({
    where: eq(partyTreasury.campaignId, campaignId),
  });

  const holders = await db
    .select({ characterId: characters.id, name: characters.name })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  const members = await db
    .select({ userId: campaignMembers.userId })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  return {
    loot: rows.map(r => ({
      id: r.loot.id,
      name: r.loot.name,
      quantity: r.loot.quantity,
      notes: r.loot.notes,
      kind: r.loot.kind,
      holderCharacterId: r.loot.holderCharacterId,
      holderName: r.holderName,
      identified: r.loot.identified,
    })),
    treasury: purse
      ? { cp: purse.cp, sp: purse.sp, ep: purse.ep, gp: purse.gp, pp: purse.pp }
      : { ...EMPTY_TREASURY },
    holders,
    partySize: Math.max(1, members.length),
  };
}

export interface LootInput {
  name: string;
  quantity?: number;
  notes?: string;
  kind?: LootKind;
  holderCharacterId?: string | null;
  identified?: boolean;
}

export async function addLoot(
  campaignId: string,
  input: LootInput
): Promise<void> {
  const { userId } = await anyMember(campaignId);
  await db.insert(partyLoot).values({
    campaignId,
    name: input.name.trim(),
    quantity: Math.max(1, input.quantity ?? 1),
    notes: input.notes ?? '',
    kind: input.kind ?? 'item',
    holderCharacterId: input.holderCharacterId ?? null,
    identified: input.identified ?? true,
    createdBy: userId,
  });
}

async function memberForLoot(lootId: string) {
  const row = await db.query.partyLoot.findFirst({
    where: eq(partyLoot.id, lootId),
  });
  if (!row) throw new Error('NOT_FOUND');
  await anyMember(row.campaignId);
  return row;
}

export async function updateLoot(
  lootId: string,
  patch: Partial<LootInput>
): Promise<void> {
  await memberForLoot(lootId);
  const set: Partial<typeof partyLoot.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.quantity !== undefined) set.quantity = Math.max(1, patch.quantity);
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.holderCharacterId !== undefined) {
    set.holderCharacterId = patch.holderCharacterId;
  }
  if (patch.identified !== undefined) set.identified = patch.identified;

  await db.update(partyLoot).set(set).where(eq(partyLoot.id, lootId));
}

export async function deleteLoot(lootId: string): Promise<void> {
  await memberForLoot(lootId);
  await db.delete(partyLoot).where(eq(partyLoot.id, lootId));
}

/** Add or subtract coins. Deltas, not totals, so two people can bank at once. */
export async function adjustTreasury(
  campaignId: string,
  delta: Partial<Treasury>
): Promise<Treasury> {
  await anyMember(campaignId);

  const current =
    (await db.query.partyTreasury.findFirst({
      where: eq(partyTreasury.campaignId, campaignId),
    })) ?? null;

  const base: Treasury = current
    ? {
        cp: current.cp,
        sp: current.sp,
        ep: current.ep,
        gp: current.gp,
        pp: current.pp,
      }
    : { ...EMPTY_TREASURY };

  const next: Treasury = { ...base };
  for (const key of COIN_KEYS) {
    next[key] = Math.max(0, base[key] + (delta[key] ?? 0));
  }

  if (current) {
    await db
      .update(partyTreasury)
      .set({ ...next, updatedAt: new Date().toISOString() })
      .where(eq(partyTreasury.campaignId, campaignId));
  } else {
    await db.insert(partyTreasury).values({ campaignId, ...next });
  }
  return next;
}
