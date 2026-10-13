import 'server-only';

import { asc, eq } from 'drizzle-orm';

import {
  MAX_BLURB,
  MAX_NAME,
  isTavernKind,
  normalizeRules,
  rulesLines,
  type HouseGameRow,
  type TavernKind,
} from '@/@creator/campaign/lib/tavern';
import { db } from '@/db';
import { tavernHouseGames } from '@/db/schema';
import { requireCampaignRole } from '../campaigns';

/**
 * House games: a DM's own named rules for liar's dice or Crowns.
 *
 * Anyone at the campaign may read them — they are what is played here, and a
 * player deciding whether to sit down deserves to know the rules — and only
 * staff write them. A house game is prep: it travels in a campaign package,
 * and editing one never reaches a tavern game already open, which copied its
 * rules in.
 */

export function toHouseGameRow(
  r: typeof tavernHouseGames.$inferSelect
): HouseGameRow {
  const kind = r.kind as TavernKind;
  const rules = normalizeRules(kind, r.rules);
  return {
    id: r.id,
    kind,
    name: r.name,
    blurb: r.blurb,
    rules,
    lines: rulesLines(kind, rules),
  };
}

export interface HouseGameInput {
  kind: TavernKind;
  name: string;
  blurb?: string;
  rules?: unknown;
}

function clean(input: HouseGameInput) {
  if (!isTavernKind(input.kind)) throw new Error('BAD_KIND');
  const name = (input.name ?? '').trim().slice(0, MAX_NAME);
  if (!name) throw new Error('NO_NAME');
  return {
    kind: input.kind,
    name,
    blurb: (input.blurb ?? '').trim().slice(0, MAX_BLURB),
    rules: normalizeRules(input.kind, input.rules),
  };
}

export async function listHouseGames(
  campaignId: string
): Promise<HouseGameRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const rows = await db
    .select()
    .from(tavernHouseGames)
    .where(eq(tavernHouseGames.campaignId, campaignId))
    .orderBy(asc(tavernHouseGames.name));
  return rows.map(toHouseGameRow);
}

export async function createHouseGame(
  campaignId: string,
  input: HouseGameInput
): Promise<string> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const [row] = await db
    .insert(tavernHouseGames)
    .values({ campaignId, ...clean(input) })
    .returning({ id: tavernHouseGames.id });
  return row.id;
}

async function staffFor(id: string) {
  const row = await db.query.tavernHouseGames.findFirst({
    where: eq(tavernHouseGames.id, id),
  });
  if (!row) throw new Error('NOT_FOUND');
  await requireCampaignRole(row.campaignId, ['gm', 'co-gm']);
  return row;
}

export async function updateHouseGame(
  id: string,
  input: HouseGameInput
): Promise<void> {
  await staffFor(id);
  await db
    .update(tavernHouseGames)
    .set({ ...clean(input), updatedAt: new Date().toISOString() })
    .where(eq(tavernHouseGames.id, id));
}

export async function deleteHouseGame(id: string): Promise<void> {
  await staffFor(id);
  await db.delete(tavernHouseGames).where(eq(tavernHouseGames.id, id));
}

/** One house game, for opening a tavern game from it. Staff only. */
export async function findHouseGame(
  campaignId: string,
  id: string
): Promise<HouseGameRow | null> {
  const row = await db.query.tavernHouseGames.findFirst({
    where: eq(tavernHouseGames.id, id),
  });
  if (!row || row.campaignId !== campaignId) return null;
  return toHouseGameRow(row);
}
