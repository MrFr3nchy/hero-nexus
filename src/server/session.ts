import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignHandouts,
  campaignMembers,
  characters,
  initiativeEncounters,
  initiativeEntries,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';

export interface EncounterRow {
  id: string;
  name: string;
  isActive: boolean;
  round: number;
  turnIndex: number;
}

export interface EntryRow {
  id: string;
  label: string;
  characterId: string | null;
  initiative: number;
  hpCurrent: number | null;
  hpMax: number | null;
  conditions: string;
  sort: number;
}

export interface HandoutRow {
  id: string;
  kind: 'image' | 'note';
  title: string;
  body: string | null;
  filePath: string | null;
  mime: string | null;
  visibility: 'dm' | 'shared';
  createdAt: string;
}

export interface LiveState {
  role: CampaignRole;
  encounter: EncounterRow | null;
  entries: EntryRow[];
  handouts: HandoutRow[];
}

function orderEntries(rows: EntryRow[]): EntryRow[] {
  return [...rows].sort(
    (a, b) => b.initiative - a.initiative || a.sort - b.sort
  );
}

/** Single call the live-view poller hits. Role-filtered. */
export async function getLiveState(campaignId: string): Promise<LiveState> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  const encounter =
    (await db.query.initiativeEncounters.findFirst({
      where: and(
        eq(initiativeEncounters.campaignId, campaignId),
        eq(initiativeEncounters.isActive, true)
      ),
    })) ??
    (await db.query.initiativeEncounters.findFirst({
      where: eq(initiativeEncounters.campaignId, campaignId),
      orderBy: [desc(initiativeEncounters.createdAt)],
    })) ??
    null;

  const entries = encounter
    ? orderEntries(
        (await db
          .select()
          .from(initiativeEntries)
          .where(eq(initiativeEntries.encounterId, encounter.id))) as EntryRow[]
      )
    : [];

  const handoutRows = (await db
    .select()
    .from(campaignHandouts)
    .where(eq(campaignHandouts.campaignId, campaignId))
    .orderBy(desc(campaignHandouts.createdAt))) as HandoutRow[];

  const handouts = isStaff
    ? handoutRows
    : handoutRows.filter(h => h.visibility === 'shared');

  return {
    role,
    encounter: encounter
      ? {
          id: encounter.id,
          name: encounter.name,
          isActive: encounter.isActive,
          round: encounter.round,
          turnIndex: encounter.turnIndex,
        }
      : null,
    entries,
    handouts,
  };
}

/* --- encounter (staff) ------------------------------------------------- */

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

export async function createEncounter(
  campaignId: string,
  name: string
): Promise<string> {
  await staff(campaignId);
  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.campaignId, campaignId));
  const [row] = await db
    .insert(initiativeEncounters)
    .values({ campaignId, name: name.trim() || 'Encounter', isActive: true })
    .returning({ id: initiativeEncounters.id });
  return row.id;
}

async function encounterCampaign(encounterId: string): Promise<string> {
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  return enc.campaignId;
}

export async function endEncounter(encounterId: string): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.id, encounterId));
}

export async function deleteEncounter(encounterId: string): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  await db
    .delete(initiativeEncounters)
    .where(eq(initiativeEncounters.id, encounterId));
}

export async function advanceTurn(
  encounterId: string,
  direction: 1 | -1
): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  const count = (
    await db
      .select({ id: initiativeEntries.id })
      .from(initiativeEntries)
      .where(eq(initiativeEntries.encounterId, encounterId))
  ).length;
  if (count === 0) return;

  let turn = enc.turnIndex + direction;
  let round = enc.round;
  if (turn >= count) {
    turn = 0;
    round += 1;
  } else if (turn < 0) {
    turn = count - 1;
    round = Math.max(1, round - 1);
  }
  await db
    .update(initiativeEncounters)
    .set({ turnIndex: turn, round })
    .where(eq(initiativeEncounters.id, encounterId));
}

/* --- entries (staff) ------------------------------------------------- */

export interface EntryInput {
  label: string;
  characterId?: string | null;
  initiative?: number;
  hpCurrent?: number | null;
  hpMax?: number | null;
  conditions?: string;
}

export async function addEntry(
  encounterId: string,
  input: EntryInput
): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  const existing = await db
    .select({ sort: initiativeEntries.sort })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const nextSort = existing.reduce((max, r) => Math.max(max, r.sort), 0) + 1;

  await db.insert(initiativeEntries).values({
    encounterId,
    label: input.label.trim() || 'Combatant',
    characterId: input.characterId ?? null,
    initiative: input.initiative ?? 0,
    hpCurrent: input.hpCurrent ?? null,
    hpMax: input.hpMax ?? null,
    conditions: input.conditions ?? '',
    sort: nextSort,
  });
}

async function entryCampaign(entryId: string): Promise<string> {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  return encounterCampaign(entry.encounterId);
}

export async function updateEntry(
  entryId: string,
  patch: Partial<Omit<EntryInput, 'label'>> & { label?: string }
): Promise<void> {
  await staff(await entryCampaign(entryId));
  await db
    .update(initiativeEntries)
    .set(patch)
    .where(eq(initiativeEntries.id, entryId));
}

export async function removeEntry(entryId: string): Promise<void> {
  await staff(await entryCampaign(entryId));
  await db.delete(initiativeEntries).where(eq(initiativeEntries.id, entryId));
}

/** Add all members' linked characters to an encounter (skips ones already in). */
export async function addPartyToEncounter(encounterId: string): Promise<void> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);

  const linked = await db
    .select({
      characterId: campaignMembers.characterId,
      name: characters.name,
      sheet: characters.sheet,
    })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(eq(campaignMembers.campaignId, campaignId));

  const already = new Set(
    (
      await db
        .select({ characterId: initiativeEntries.characterId })
        .from(initiativeEntries)
        .where(eq(initiativeEntries.encounterId, encounterId))
    ).map(r => r.characterId)
  );

  for (const row of linked) {
    if (!row.characterId || already.has(row.characterId)) continue;
    const sheet = row.sheet as {
      combat?: { hitPointsMax?: number; hitPointsCurrent?: number };
    };
    await addEntry(encounterId, {
      label: row.name || 'Character',
      characterId: row.characterId,
      hpMax: sheet?.combat?.hitPointsMax ?? null,
      hpCurrent:
        sheet?.combat?.hitPointsCurrent ?? sheet?.combat?.hitPointsMax ?? null,
    });
  }
}

/* --- handouts ------------------------------------------------------- */

export async function createNote(
  campaignId: string,
  title: string,
  body: string
): Promise<void> {
  const { userId } = await staff(campaignId);
  await db.insert(campaignHandouts).values({
    campaignId,
    kind: 'note',
    title: title.trim(),
    body,
    createdBy: userId,
  });
}

/** Called by the upload route handler after the file is written. */
export async function createImageHandout(
  campaignId: string,
  userId: string,
  filePath: string,
  mime: string,
  title: string
): Promise<void> {
  await db.insert(campaignHandouts).values({
    campaignId,
    kind: 'image',
    title: title.trim(),
    filePath,
    mime,
    createdBy: userId,
  });
}

async function handoutRow(handoutId: string) {
  const row = await db.query.campaignHandouts.findFirst({
    where: eq(campaignHandouts.id, handoutId),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row;
}

export async function setHandoutVisibility(
  handoutId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  const row = await handoutRow(handoutId);
  await staff(row.campaignId);
  await db
    .update(campaignHandouts)
    .set({ visibility })
    .where(eq(campaignHandouts.id, handoutId));
}

export async function deleteHandout(handoutId: string): Promise<string | null> {
  const row = await handoutRow(handoutId);
  await staff(row.campaignId);
  await db.delete(campaignHandouts).where(eq(campaignHandouts.id, handoutId));
  return row.filePath ?? null;
}

/** Used by the file-serving route to authorize a GET. */
export async function canViewHandout(
  handoutId: string
): Promise<
  { ok: true; row: Awaited<ReturnType<typeof handoutRow>> } | { ok: false }
> {
  const row = await handoutRow(handoutId);
  try {
    const { role } = await requireCampaignRole(row.campaignId, [
      'gm',
      'co-gm',
      'player',
    ]);
    const isStaff = role === 'gm' || role === 'co-gm';
    if (!isStaff && row.visibility !== 'shared') return { ok: false };
    return { ok: true, row };
  } catch {
    return { ok: false };
  }
}
