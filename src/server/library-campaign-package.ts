import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { normaliseTags } from '@/@creator/library/lib/publication';

import { db } from '@/db';
import {
  adoptions,
  campaignHomebrew,
  campaignImages,
  campaignMapPins,
  campaignMaps,
  campaignNotes,
  campaignQuestObjectives,
  campaignQuests,
  campaigns,
  canonCollections,
  canonEntries,
  canonLinks,
  homebrew,
  publicationItems,
  publications,
} from '@/db/schema';
import {
  createCampaign,
  mergeCampaignSettings,
  requireCampaignRole,
} from './campaigns';
import { freezeHomebrew, creditFor, type PublicationInput } from './library';
import {
  attachCampaignImage,
  copyAssetToCampaign,
  listPublicationAssets,
} from './library-assets';
import { mintHomebrewItems } from './library-packages';
import { requireUserId } from './session-user';

/**
 * A campaign, packaged so somebody else can run it.
 *
 * This is the highest-risk object in the Wandering Library, because a campaign
 * row is surrounded by other people's data. The rule the whole module is built
 * around:
 *
 * **The package carries the prep. It never carries the table.**
 *
 * `CARRIED` below is an explicit allow-list, not a sweep of everything with this
 * `campaign_id`. That is deliberate and load-bearing: the next campaign-scoped
 * table somebody adds is opted **out** by default, and opting it in means
 * editing this list on purpose. A sweep would have shipped it silently.
 *
 * Carried: name, description, settings, canon (both bodies), collections and
 * links, quests and objectives, notes, maps and pins, the pictures those point
 * at, and every homebrew row the campaign's library holds.
 *
 * Never carried, and the reason: **members, invites and the join code** are
 * other accounts and a live door into a running table; **characters and their
 * sheets** belong to their players; **sessions, attendance, RSVPs, rolls,
 * journals, downtime, awards and grants, initiative encounters, progress clocks,
 * screen layouts, party loot and treasury** are the record of a table that was
 * played, not a thing to run; **character secrets and sheet notes** are private
 * to a player and their DM; **homebrew approvals** are decisions made about
 * people who are not coming with it.
 *
 * Both bodies of canon and quests *are* carried, secrets included. The adopter
 * becomes the DM, and prep with the secret half stripped is not prep.
 */

/** The allow-list, as a sentence a reviewer can check a diff against. */
export const CARRIED = [
  'campaigns.name',
  'campaigns.description',
  'campaigns.settings',
  'canon_collections',
  'canon_entries',
  'canon_links',
  'campaign_quests',
  'campaign_quest_objectives',
  'campaign_notes',
  'campaign_maps',
  'campaign_map_pins',
  'campaign_images (only those the above point at)',
  'homebrew (only what campaign_homebrew holds)',
] as const;

/**
 * Named so the exclusion is greppable from the tables themselves. Nothing reads
 * it; it exists so "is this shared?" has a written answer next to the code that
 * decides.
 */
export const NEVER_CARRIED = [
  'campaign_members',
  'campaign_invites',
  'campaigns.join_code',
  'characters',
  'character_secrets',
  'sheet_notes',
  'character_history',
  'campaign_sessions',
  'campaign_session_attendance',
  'campaign_rolls',
  'player_journals',
  'downtime_periods',
  'downtime_actions',
  'session_awards',
  'session_award_grants',
  'initiative_encounters',
  'initiative_entries',
  'campaign_clocks',
  'campaign_screen_layouts',
  'party_loot',
  'party_treasury',
  'campaign_handouts',
  'campaign_reveals',
  'campaign_reveal_targets',
  'canon_reveals',
  'homebrew_approvals',
  'encounter_plans',
  'encounter_plan_lines',
] as const;

/* --- the frozen shape ------------------------------------------------- */

interface PackagedCollection {
  key: string;
  title: string;
  blurb: string;
  icon: string;
  imageKey: string | null;
  sortOrder: number;
}

interface PackagedEntry {
  key: string;
  kind: string;
  title: string;
  dmBody: string;
  partyBody: string;
  collectionKey: string | null;
  imageKey: string | null;
  fields: unknown;
  visibility: string;
}

interface PackagedQuest {
  key: string;
  title: string;
  summary: string;
  dmNotes: string;
  giver: string;
  reward: string;
  status: string;
  visibility: string;
  sortOrder: number;
  objectives: {
    body: string;
    done: boolean;
    visibility: string;
    sortOrder: number;
  }[];
}

interface PackagedNote {
  title: string;
  body: string;
  tags: string;
  pinned: boolean;
  visibility: string;
}

interface PackagedMap {
  key: string;
  title: string;
  visibility: string;
  sortOrder: number;
  imageKey: string | null;
  pins: {
    x: number;
    y: number;
    label: string;
    dmNote: string;
    canonEntryKey: string | null;
    visibility: string;
  }[];
}

export interface CampaignPackagePayload {
  name: string;
  description: string;
  settings: unknown;
  collections: PackagedCollection[];
  entries: PackagedEntry[];
  links: { fromKey: string; toKey: string }[];
  quests: PackagedQuest[];
  notes: PackagedNote[];
  maps: PackagedMap[];
}

/* --- building --------------------------------------------------------- */

/**
 * Freeze a campaign into a package.
 *
 * Ids inside the package are the source campaign's row ids, used purely as
 * local keys — they name a piece within this package and mean nothing outside
 * it, which is what lets a pin still point at the right canon entry after every
 * row is minted afresh on somebody else's account.
 */
export async function buildCampaignPackage(campaignId: string): Promise<{
  payload: CampaignPackagePayload;
  imageKeys: string[];
  homebrewIds: string[];
}> {
  const [collections, entries, links, quests, notes, maps, library, row] =
    await Promise.all([
      db
        .select()
        .from(canonCollections)
        .where(eq(canonCollections.campaignId, campaignId)),
      db
        .select()
        .from(canonEntries)
        .where(eq(canonEntries.campaignId, campaignId)),
      db.select().from(canonLinks).where(eq(canonLinks.campaignId, campaignId)),
      db
        .select()
        .from(campaignQuests)
        .where(eq(campaignQuests.campaignId, campaignId)),
      db
        .select()
        .from(campaignNotes)
        .where(eq(campaignNotes.campaignId, campaignId)),
      db
        .select()
        .from(campaignMaps)
        .where(eq(campaignMaps.campaignId, campaignId)),
      db
        .select({ homebrewId: campaignHomebrew.homebrewId })
        .from(campaignHomebrew)
        .where(eq(campaignHomebrew.campaignId, campaignId)),
      db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) }),
    ]);
  if (!row) throw new Error('NOT_FOUND');

  const objectives =
    quests.length > 0
      ? await db
          .select()
          .from(campaignQuestObjectives)
          .where(
            inArray(
              campaignQuestObjectives.questId,
              quests.map(q => q.id)
            )
          )
      : [];

  const pins =
    maps.length > 0
      ? await db
          .select()
          .from(campaignMapPins)
          .where(
            inArray(
              campaignMapPins.mapId,
              maps.map(m => m.id)
            )
          )
      : [];

  const settings = mergeCampaignSettings(row.settings);

  const payload: CampaignPackagePayload = {
    name: row.name,
    description: row.description,
    // The banner is an image id from the source campaign and would dangle. It
    // is re-pointed on adoption if the picture travelled; until then, null.
    settings: { ...settings, bannerImageId: null },
    collections: collections.map(c => ({
      key: c.id,
      title: c.title,
      blurb: c.blurb,
      icon: c.icon,
      imageKey: c.imageId,
      sortOrder: c.sortOrder,
    })),
    entries: entries.map(e => ({
      key: e.id,
      kind: e.kind,
      title: e.title,
      // Both bodies. The adopter becomes the DM, and prep with the secret half
      // stripped out is not prep.
      dmBody: e.dmBody,
      partyBody: e.partyBody,
      collectionKey: e.collectionId,
      imageKey: e.imageId,
      fields: e.fields,
      visibility: e.visibility,
    })),
    links: links.map(l => ({ fromKey: l.fromEntryId, toKey: l.toEntryId })),
    quests: quests.map(q => ({
      key: q.id,
      title: q.title,
      summary: q.summary,
      dmNotes: q.dmNotes,
      giver: q.giver,
      reward: q.reward,
      status: q.status,
      visibility: q.visibility,
      sortOrder: q.sortOrder,
      objectives: objectives
        .filter(o => o.questId === q.id)
        .map(o => ({
          body: o.body,
          done: o.done,
          visibility: o.visibility,
          sortOrder: o.sortOrder,
        })),
    })),
    // `sessionId` is dropped rather than remapped: sittings do not travel, so a
    // note filed under one arrives as a standing note.
    notes: notes.map(n => ({
      title: n.title,
      body: n.body,
      tags: n.tags,
      pinned: n.pinned,
      visibility: n.visibility,
    })),
    maps: maps.map(m => ({
      key: m.id,
      title: m.title,
      visibility: m.visibility,
      sortOrder: m.sortOrder,
      imageKey: m.imageId,
      pins: pins
        .filter(p => p.mapId === m.id)
        .map(p => ({
          x: p.x,
          y: p.y,
          label: p.label,
          dmNote: p.dmNote,
          canonEntryKey: p.canonEntryId,
          visibility: p.visibility,
        })),
    })),
  };

  const imageKeys = [
    ...new Set(
      [
        ...collections.map(c => c.imageId),
        ...entries.map(e => e.imageId),
        ...maps.map(m => m.imageId),
        settings.bannerImageId,
      ].filter((id): id is string => Boolean(id))
    ),
  ];

  return {
    payload,
    imageKeys,
    homebrewIds: [...new Set(library.map(l => l.homebrewId))],
  };
}

/**
 * Put a campaign on the shelf.
 *
 * Staff only, and re-publishing rebuilds the package from scratch — a table that
 * has since deleted a quest must not keep shipping it.
 */
export async function publishCampaign(
  campaignId: string,
  input: PublicationInput
): Promise<string> {
  const userId = await requireUserId();
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const { payload, imageKeys, homebrewIds } =
    await buildCampaignPackage(campaignId);

  const patch = {
    title: input.title.trim() || payload.name,
    summary: input.summary?.trim() ?? '',
    tags: normaliseTags(input.tags),
    visibility: input.visibility ?? ('public' as const),
    payload,
    updatedAt: new Date().toISOString(),
  };

  const existing = await db.query.publications.findFirst({
    columns: { id: true, ownerId: true, version: true },
    where: eq(publications.campaignId, campaignId),
  });

  let publicationId: string;
  if (existing) {
    if (existing.ownerId !== userId) throw new Error('NOT_YOUR_PUBLICATION');
    await db
      .update(publications)
      .set({ ...patch, status: 'listed', version: existing.version + 1 })
      .where(eq(publications.id, existing.id));
    publicationId = existing.id;
    await db
      .delete(publicationItems)
      .where(eq(publicationItems.publicationId, publicationId));
  } else {
    const [created] = await db
      .insert(publications)
      .values({
        ownerId: userId,
        kind: 'campaign',
        campaignId,
        credit: await creditFor(userId),
        ...patch,
      })
      .returning({ id: publications.id });
    publicationId = created.id;
  }

  const content =
    homebrewIds.length > 0
      ? await db
          .select()
          .from(homebrew)
          .where(inArray(homebrew.id, homebrewIds))
      : [];

  if (content.length > 0) {
    await db.insert(publicationItems).values(
      content.map((item, index) => ({
        publicationId,
        kind: 'homebrew' as const,
        contentType: item.type,
        name: item.name,
        localKey: item.id,
        sortOrder: index,
        payload: freezeHomebrew({
          type: item.type,
          name: item.name,
          description: item.description,
          data: item.data,
        }),
      }))
    );
  }

  // Pictures are copied onto the listing, keyed by the campaign image id the
  // package refers to them by. Re-publishing adds only what is missing rather
  // than re-copying every map: bytes are the expensive part here.
  const already = new Set(
    (await listPublicationAssets(publicationId)).map(a => a.itemLocalKey)
  );
  for (const imageId of imageKeys) {
    if (already.has(imageId)) continue;
    const owned = await db.query.campaignImages.findFirst({
      columns: { id: true },
      where: and(
        eq(campaignImages.id, imageId),
        eq(campaignImages.campaignId, campaignId)
      ),
    });
    if (!owned) continue;
    await attachCampaignImage(publicationId, imageId, {
      itemLocalKey: imageId,
    });
  }

  return publicationId;
}

/* --- adopting --------------------------------------------------------- */

/**
 * Run somebody else's campaign.
 *
 * Mints a table the adopter is the DM of, with every internal id remapped: a
 * pin still opens the right canon entry, an entry still sits on the right shelf,
 * a link still joins the same two entries. Nothing about the source table's
 * *people* comes with it — no members, no invites, no join code, no characters.
 */
export async function adoptCampaign(publicationId: string): Promise<string> {
  const userId = await requireUserId();

  const listing = await db.query.publications.findFirst({
    where: eq(publications.id, publicationId),
  });
  if (!listing) throw new Error('NOT_FOUND');
  if (listing.kind !== 'campaign') throw new Error('WRONG_KIND');
  if (listing.ownerId === userId) throw new Error('OWN_PUBLICATION');
  if (listing.status !== 'listed') throw new Error('WITHDRAWN');

  const payload = listing.payload as CampaignPackagePayload | null;
  if (!payload?.name) throw new Error('CONTENT_GONE');

  const settings = mergeCampaignSettings(payload.settings);
  const campaignId = await createCampaign({
    name: payload.name,
    description: payload.description,
    settings: { ...settings, bannerImageId: null },
  });

  // Pictures first: everything that follows may point at one. `imageMap` is
  // keyed by the source campaign's image id, which is how the package refers to
  // them.
  const imageMap = new Map<string, string>();
  for (const asset of await listPublicationAssets(publicationId)) {
    if (!asset.itemLocalKey) continue;
    try {
      imageMap.set(
        asset.itemLocalKey,
        await copyAssetToCampaign(asset.id, campaignId)
      );
    } catch {
      // A picture that will not copy costs its picture, never the campaign.
    }
  }
  const image = (key: string | null): string | null =>
    key ? (imageMap.get(key) ?? null) : null;

  const collectionMap = new Map<string, string>();
  for (const collection of payload.collections ?? []) {
    const [created] = await db
      .insert(canonCollections)
      .values({
        campaignId,
        title: collection.title,
        blurb: collection.blurb,
        icon: collection.icon,
        imageId: image(collection.imageKey),
        sortOrder: collection.sortOrder,
      })
      .returning({ id: canonCollections.id });
    collectionMap.set(collection.key, created.id);
  }

  const entryMap = new Map<string, string>();
  for (const entry of payload.entries ?? []) {
    const [created] = await db
      .insert(canonEntries)
      .values({
        campaignId,
        kind: entry.kind as typeof canonEntries.$inferInsert.kind,
        title: entry.title,
        dmBody: entry.dmBody,
        partyBody: entry.partyBody,
        collectionId: entry.collectionKey
          ? (collectionMap.get(entry.collectionKey) ?? null)
          : null,
        imageId: image(entry.imageKey),
        fields: entry.fields ?? {},
        visibility: entry.visibility === 'shared' ? 'shared' : 'dm',
        createdBy: userId,
      })
      .returning({ id: canonEntries.id });
    entryMap.set(entry.key, created.id);
  }

  for (const link of payload.links ?? []) {
    const from = entryMap.get(link.fromKey);
    const to = entryMap.get(link.toKey);
    if (!from || !to) continue;
    await db
      .insert(canonLinks)
      .values({ campaignId, fromEntryId: from, toEntryId: to })
      .onConflictDoNothing();
  }

  for (const quest of payload.quests ?? []) {
    const [created] = await db
      .insert(campaignQuests)
      .values({
        campaignId,
        title: quest.title,
        summary: quest.summary,
        dmNotes: quest.dmNotes,
        giver: quest.giver,
        reward: quest.reward,
        status: quest.status as typeof campaignQuests.$inferInsert.status,
        visibility: quest.visibility === 'shared' ? 'shared' : 'dm',
        sortOrder: quest.sortOrder,
        createdBy: userId,
      })
      .returning({ id: campaignQuests.id });
    if (quest.objectives.length > 0) {
      await db.insert(campaignQuestObjectives).values(
        quest.objectives.map(o => ({
          questId: created.id,
          body: o.body,
          done: o.done,
          visibility: (o.visibility === 'dm' ? 'dm' : 'shared') as
            | 'dm'
            | 'shared',
          sortOrder: o.sortOrder,
        }))
      );
    }
  }

  if ((payload.notes ?? []).length > 0) {
    await db.insert(campaignNotes).values(
      payload.notes.map(note => ({
        campaignId,
        title: note.title,
        body: note.body,
        tags: note.tags,
        pinned: note.pinned,
        // Sittings do not travel, so prep filed under one arrives standing.
        sessionId: null,
        visibility: (note.visibility === 'shared' ? 'shared' : 'dm') as
          | 'dm'
          | 'shared',
        createdBy: userId,
      }))
    );
  }

  for (const map of payload.maps ?? []) {
    const imageId = image(map.imageKey);
    // A map is its picture; one that did not travel is not a map, and an empty
    // frame with pins floating on it would be worse than its absence.
    if (!imageId) continue;
    const [created] = await db
      .insert(campaignMaps)
      .values({
        campaignId,
        imageId,
        title: map.title,
        visibility: map.visibility === 'shared' ? 'shared' : 'dm',
        sortOrder: map.sortOrder,
        createdBy: userId,
      })
      .returning({ id: campaignMaps.id });
    if (map.pins.length > 0) {
      await db.insert(campaignMapPins).values(
        map.pins.map(pin => ({
          mapId: created.id,
          x: pin.x,
          y: pin.y,
          label: pin.label,
          dmNote: pin.dmNote,
          canonEntryId: pin.canonEntryKey
            ? (entryMap.get(pin.canonEntryKey) ?? null)
            : null,
          visibility: (pin.visibility === 'shared' ? 'shared' : 'dm') as
            | 'dm'
            | 'shared',
        }))
      );
    }
  }

  // The library last: the homebrew rows are minted into the adopter's forge and
  // then put in play at the new table, so a sheet built for it can use them.
  const items = await db
    .select()
    .from(publicationItems)
    .where(
      and(
        eq(publicationItems.publicationId, publicationId),
        eq(publicationItems.kind, 'homebrew')
      )
    );
  const minted = await mintHomebrewItems(userId, publicationId, items);
  if (minted.size > 0) {
    await db
      .insert(campaignHomebrew)
      .values(
        [...minted.values()].map(homebrewId => ({
          campaignId,
          homebrewId,
          addedBy: userId,
          source: 'gm-authored' as const,
          note: 'Came with the campaign.',
        }))
      )
      .onConflictDoNothing();
  }

  await db
    .insert(adoptions)
    .values({
      userId,
      publicationId,
      mode: 'forked',
      campaignId,
      version: listing.version,
    })
    .onConflictDoUpdate({
      target: [adoptions.userId, adoptions.publicationId],
      set: { mode: 'forked', campaignId, version: listing.version },
    });

  return campaignId;
}
