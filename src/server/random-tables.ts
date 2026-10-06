import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { campaignRolls, randomTables, users } from '@/db/schema';
import { critToneOf, rollNotation } from '@/@shared/lib/dice';
import {
  MAX_TITLE,
  dieFor,
  entryForFace,
  normalizeEntries,
  rollLabel,
  type RandomTableEntry,
  type RandomTableRow,
} from '@/@creator/campaign/lib/random-tables';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';

/**
 * Random tables: a DM's prep, rolled at the table.
 *
 * Staff only, reading and writing — a random table is the DM's notes on what
 * could happen, and the party learning there is a 1-in-20 dragon is a spoiler.
 * A roll lands in Dice like any other, behind the screen unless the DM chooses
 * to show the party.
 */

function toRow(r: typeof randomTables.$inferSelect): RandomTableRow {
  return {
    id: r.id,
    title: r.title,
    entries: normalizeEntries(r.entries),
    updatedAt: r.updatedAt,
  };
}

export async function listRandomTables(
  campaignId: string
): Promise<RandomTableRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const rows = await db
    .select()
    .from(randomTables)
    .where(eq(randomTables.campaignId, campaignId))
    .orderBy(asc(sql`lower(${randomTables.title})`));
  return rows.map(toRow);
}

export async function createRandomTable(
  campaignId: string,
  input: { title: string; entries?: RandomTableEntry[] }
): Promise<string> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const title = input.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error('NO_TITLE');
  const [row] = await db
    .insert(randomTables)
    .values({
      campaignId,
      title,
      entries: normalizeEntries(input.entries ?? []),
    })
    .returning({ id: randomTables.id });
  return row.id;
}

async function staffForTable(id: string) {
  const row = await db.query.randomTables.findFirst({
    where: eq(randomTables.id, id),
  });
  if (!row) throw new Error('NOT_FOUND');
  const ctx = await requireCampaignRole(row.campaignId, ['gm', 'co-gm']);
  return { row, ...ctx };
}

export async function updateRandomTable(
  id: string,
  patch: { title?: string; entries?: RandomTableEntry[] }
): Promise<void> {
  await staffForTable(id);
  const set: Partial<typeof randomTables.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, MAX_TITLE);
    if (!title) throw new Error('NO_TITLE');
    set.title = title;
  }
  if (patch.entries !== undefined)
    set.entries = normalizeEntries(patch.entries);
  await db.update(randomTables).set(set).where(eq(randomTables.id, id));
}

export async function deleteRandomTable(id: string): Promise<void> {
  await staffForTable(id);
  await db.delete(randomTables).where(eq(randomTables.id, id));
}

/** A random table by its title, for the capture box's `roll <title>`. */
export async function findRandomTable(
  campaignId: string,
  title: string
): Promise<RandomTableRow | null> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const row = await db.query.randomTables.findFirst({
    where: and(
      eq(randomTables.campaignId, campaignId),
      sql`lower(${randomTables.title}) = ${title.trim().toLowerCase()}`
    ),
  });
  return row ? toRow(row) : null;
}

export interface RandomTableResult {
  title: string;
  /** The whole entry, untruncated — the log keeps 80 characters of it. */
  entry: string;
  notation: string;
  face: number;
  shown: boolean;
}

/**
 * Roll on a random table. The server rolls the die (it is the dice authority
 * when online), the face picks the entry, and the result is filed in Dice —
 * `visibility: 'dm'` unless `show` — and announced to the same audience.
 */
export async function rollRandomTable(
  id: string,
  show = false
): Promise<RandomTableResult> {
  const { row, userId } = await staffForTable(id);
  const entries = normalizeEntries(row.entries);
  const notation = dieFor(entries);
  if (!notation) throw new Error('EMPTY_TABLE');
  const roll = rollNotation(notation);
  if (!roll) throw new Error('EMPTY_TABLE');
  const hit = entryForFace(entries, roll.total);
  if (!hit) throw new Error('EMPTY_TABLE');

  const user = await db.query.users.findFirst({
    columns: { name: true },
    where: eq(users.id, userId),
  });
  const actorName = user?.name || 'The DM';
  const label = rollLabel(row.title, hit.entry.text);

  await db.insert(campaignRolls).values({
    campaignId: row.campaignId,
    actorUserId: userId,
    actorName,
    label,
    notation: roll.notation.slice(0, 60),
    dice: roll.dice,
    dropped: roll.dropped,
    modifier: roll.modifier,
    total: roll.total,
    visibility: show ? 'table' : 'dm',
  });
  bumpVersion(row.campaignId);

  publish(
    row.campaignId,
    {
      kind: 'roll',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName,
      // The announcement is not stored, so it carries the whole entry.
      label: `${row.title}: ${hit.entry.text}`.slice(0, 400),
      notation: roll.notation,
      total: roll.total,
      tone: critToneOf(roll.notation, roll.dice, roll.dropped) ?? 'plain',
      secret: !show,
    },
    show ? 'everyone' : 'staff'
  );

  return {
    title: row.title,
    entry: hit.entry.text,
    notation: roll.notation,
    face: roll.total,
    shown: show,
  };
}
