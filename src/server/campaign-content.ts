import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { fromHomebrew, type ContentEntry } from '@/@shared/content';

import { db } from '@/db';
import { campaignHomebrew, homebrew, users } from '@/db/schema';
import { requireCampaignRole } from './campaigns';

/**
 * The content library: what homebrew is in play at a table.
 *
 * This is the consumer `homebrew_approvals` never had. Approving a submission
 * used to flip a status and change nothing — the item was no more usable
 * after a yes than before it, and a denied item kept working. Everything that
 * needs to ask "may this character use that here?" asks this module.
 *
 * Shaped after `./canon`: staff write, every member reads, and the filtering
 * happens on the server. Unlike canon there is no DM-only half — a library
 * whose contents are secret is not a library, and a player who cannot see the
 * homebrew at their own table cannot build a character with it.
 */

export type ContentSource = 'gm-authored' | 'approved-submission';

export interface LibraryEntry {
  id: string;
  campaignId: string;
  /** The content itself, ready to render. */
  entry: ContentEntry;
  source: ContentSource;
  note: string;
  addedByName: string | null;
  createdAt: string;
}

const libraryColumns = {
  id: campaignHomebrew.id,
  campaignId: campaignHomebrew.campaignId,
  source: campaignHomebrew.source,
  note: campaignHomebrew.note,
  createdAt: campaignHomebrew.createdAt,
  addedByName: users.name,
  homebrewId: homebrew.id,
  homebrewOwnerId: homebrew.ownerId,
  homebrewType: homebrew.type,
  homebrewName: homebrew.name,
  homebrewDescription: homebrew.description,
  homebrewData: homebrew.data,
};

type LibraryQueryRow = {
  id: string;
  campaignId: string;
  source: ContentSource;
  note: string;
  createdAt: string;
  addedByName: string | null;
  homebrewId: string;
  homebrewOwnerId: string;
  homebrewType: string;
  homebrewName: string;
  homebrewDescription: string;
  homebrewData: unknown;
};

/** Rows whose homebrew no longer adapts are dropped, not rendered blank. */
function hydrate(rows: LibraryQueryRow[]): LibraryEntry[] {
  return rows.flatMap(row => {
    const entry = fromHomebrew({
      id: row.homebrewId,
      ownerId: row.homebrewOwnerId,
      type: row.homebrewType,
      name: row.homebrewName,
      description: row.homebrewDescription,
      data: row.homebrewData,
    });
    if (!entry) return [];
    return [
      {
        id: row.id,
        campaignId: row.campaignId,
        entry,
        source: row.source,
        note: row.note,
        addedByName: row.addedByName,
        createdAt: row.createdAt,
      },
    ];
  });
}

/**
 * Everything in play at a table, newest first.
 *
 * Every member reads this, staff and player alike — see the note above about
 * why there is no hidden half.
 */
export async function listCampaignContent(
  campaignId: string
): Promise<LibraryEntry[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  const rows = (await db
    .select(libraryColumns)
    .from(campaignHomebrew)
    .innerJoin(homebrew, eq(homebrew.id, campaignHomebrew.homebrewId))
    .leftJoin(users, eq(users.id, campaignHomebrew.addedBy))
    .where(eq(campaignHomebrew.campaignId, campaignId))
    .orderBy(desc(campaignHomebrew.createdAt))) as LibraryQueryRow[];
  return hydrate(rows);
}

/**
 * Put a piece of content on a table.
 *
 * Idempotent: adding what is already there updates the note rather than
 * failing, so an approval landing twice — or a DM re-adding their own item —
 * is not an error anybody has to think about.
 */
export async function addCampaignContent(
  campaignId: string,
  homebrewId: string,
  options: { source?: ContentSource; note?: string; actorUserId?: string } = {}
): Promise<void> {
  const actorUserId =
    options.actorUserId ??
    (await requireCampaignRole(campaignId, ['gm', 'co-gm'])).userId;

  const item = await db.query.homebrew.findFirst({
    where: eq(homebrew.id, homebrewId),
  });
  if (!item) throw new Error('NOT_FOUND');

  const existing = await db.query.campaignHomebrew.findFirst({
    where: and(
      eq(campaignHomebrew.campaignId, campaignId),
      eq(campaignHomebrew.homebrewId, homebrewId)
    ),
  });

  if (existing) {
    if (options.note !== undefined) {
      await db
        .update(campaignHomebrew)
        .set({ note: options.note })
        .where(eq(campaignHomebrew.id, existing.id));
    }
    return;
  }

  await db.insert(campaignHomebrew).values({
    campaignId,
    homebrewId,
    addedBy: actorUserId,
    source: options.source ?? 'gm-authored',
    note: options.note ?? '',
  });
}

/**
 * Take content out of play.
 *
 * The approval row is deliberately left standing: "the DM removed it" and
 * "the DM never approved it" are different facts, and collapsing them would
 * tell a player the wrong story about their own submission.
 */
export async function removeCampaignContent(
  campaignId: string,
  libraryId: string
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await db
    .delete(campaignHomebrew)
    .where(
      and(
        eq(campaignHomebrew.id, libraryId),
        eq(campaignHomebrew.campaignId, campaignId)
      )
    );
}

/**
 * Take one piece of content off a table by its homebrew id.
 *
 * The un-approval path: a DM who denies something previously approved expects
 * it to stop being usable, not to sit in the library with a "denied" note
 * somewhere else. Takes no role check — the only caller is `reviewApproval`,
 * which has already established staff.
 */
export async function removeCampaignContentByHomebrew(
  campaignId: string,
  homebrewId: string
): Promise<void> {
  await db
    .delete(campaignHomebrew)
    .where(
      and(
        eq(campaignHomebrew.campaignId, campaignId),
        eq(campaignHomebrew.homebrewId, homebrewId)
      )
    );
}

export async function setCampaignContentNote(
  campaignId: string,
  libraryId: string,
  note: string
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await db
    .update(campaignHomebrew)
    .set({ note: note.trim().slice(0, 2000) })
    .where(
      and(
        eq(campaignHomebrew.id, libraryId),
        eq(campaignHomebrew.campaignId, campaignId)
      )
    );
}

/**
 * The homebrew ids in play at a campaign.
 *
 * The cheap question — no join, no adaptation — for the rules check that asks
 * whether a sheet's content is allowed at the tables it is linked to. Takes no
 * role: callers are already inside an authorised path, and a set of opaque ids
 * is not something to gate a character save on a second permission lookup for.
 */
export async function listCampaignContentIds(
  campaignId: string
): Promise<Set<string>> {
  const rows = await db
    .select({ homebrewId: campaignHomebrew.homebrewId })
    .from(campaignHomebrew)
    .where(eq(campaignHomebrew.campaignId, campaignId));
  return new Set(rows.map(r => r.homebrewId));
}

/** The same question for several campaigns at once, keyed by campaign id. */
export async function listContentIdsForCampaigns(
  campaignIds: string[]
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (campaignIds.length === 0) return out;
  const rows = await db
    .select({
      campaignId: campaignHomebrew.campaignId,
      homebrewId: campaignHomebrew.homebrewId,
    })
    .from(campaignHomebrew)
    .where(inArray(campaignHomebrew.campaignId, campaignIds));
  for (const row of rows) {
    const set = out.get(row.campaignId) ?? new Set<string>();
    set.add(row.homebrewId);
    out.set(row.campaignId, set);
  }
  return out;
}
