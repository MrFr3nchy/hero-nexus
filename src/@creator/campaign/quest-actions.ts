'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  addLoot,
  addObjective,
  adjustTreasury,
  createQuest,
  deleteLoot,
  deleteObjective,
  deleteQuest,
  getLedger,
  listQuests,
  setObjectiveDone,
  setObjectiveVisibility,
  updateLoot,
  updateQuest,
  type LedgerState,
  type QuestRow,
  type Treasury,
} from '@/server/quests';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That no longer exists.',
    FORBIDDEN: 'You do not have permission to do that.',
  };
  // Unmapped errors reach the client as a generic sentence, which makes them
  // invisible in a bug report. Keep the real one in the server log.
  if (!messages[code]) console.error('[action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const questSchema = z.object({
  title: z.string().trim().min(1, 'Give the quest a name.').max(160),
  summary: z.string().max(4000).optional(),
  dmNotes: z.string().max(8000).optional(),
  giver: z.string().trim().max(160).optional(),
  reward: z.string().trim().max(400).optional(),
  status: z.enum(['rumour', 'active', 'done', 'failed']).optional(),
  visibility: z.enum(['dm', 'shared']).optional(),
});

const lootSchema = z.object({
  name: z.string().trim().min(1, 'Name the item.').max(160),
  quantity: z.number().int().min(1).max(9999).optional(),
  notes: z.string().max(2000).optional(),
  kind: z.enum(['item', 'consumable', 'treasure', 'magic']).optional(),
  holderCharacterId: z.string().min(1).nullable().optional(),
  identified: z.boolean().optional(),
});

const coinSchema = z.object({
  cp: z.number().int().min(-999999).max(999999).optional(),
  sp: z.number().int().min(-999999).max(999999).optional(),
  ep: z.number().int().min(-999999).max(999999).optional(),
  gp: z.number().int().min(-999999).max(999999).optional(),
  pp: z.number().int().min(-999999).max(999999).optional(),
});

/* --- read ------------------------------------------------------------- */

export async function listQuestsAction(
  campaignId: string
): Promise<QuestRow[]> {
  return listQuests(campaignId);
}

export async function getLedgerAction(
  campaignId: string
): Promise<LedgerState> {
  return getLedger(campaignId);
}

/* --- quests ----------------------------------------------------------- */

export async function createQuestAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = questSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    const id = await createQuest(campaignId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'Failed to add the quest.');
  }
}

export async function updateQuestAction(
  campaignId: string,
  questId: string,
  input: unknown
): Promise<Result> {
  const parsed = questSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updateQuest(questId, parsed.data);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save the quest.');
  }
}

export async function deleteQuestAction(
  campaignId: string,
  questId: string
): Promise<Result> {
  try {
    await deleteQuest(questId);
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove the quest.');
  }
}

export async function addObjectiveAction(
  questId: string,
  body: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  if (!body.trim()) return { ok: false, error: 'Write the objective first.' };
  try {
    await addObjective(questId, body.slice(0, 400), visibility);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to add the objective.');
  }
}

export async function setObjectiveDoneAction(
  objectiveId: string,
  done: boolean
): Promise<Result> {
  try {
    await setObjectiveDone(objectiveId, done);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to tick that off.');
  }
}

export async function setObjectiveVisibilityAction(
  objectiveId: string,
  visibility: 'dm' | 'shared'
): Promise<Result> {
  try {
    await setObjectiveVisibility(objectiveId, visibility);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change who sees that.');
  }
}

export async function deleteObjectiveAction(
  objectiveId: string
): Promise<Result> {
  try {
    await deleteObjective(objectiveId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove the objective.');
  }
}

/* --- the ledger -------------------------------------------------------- */

export async function addLootAction(
  campaignId: string,
  input: unknown
): Promise<Result> {
  const parsed = lootSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await addLoot(campaignId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to add that to the haul.');
  }
}

export async function updateLootAction(
  lootId: string,
  input: unknown
): Promise<Result> {
  const parsed = lootSchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    await updateLoot(lootId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update that item.');
  }
}

export async function deleteLootAction(lootId: string): Promise<Result> {
  try {
    await deleteLoot(lootId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove that item.');
  }
}

export async function adjustTreasuryAction(
  campaignId: string,
  delta: unknown
): Promise<Result<Treasury>> {
  const parsed = coinSchema.safeParse(delta);
  if (!parsed.success) {
    return { ok: false, error: 'That is not an amount of coin.' };
  }
  try {
    const data = await adjustTreasury(campaignId, parsed.data);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'Failed to change the purse.');
  }
}
