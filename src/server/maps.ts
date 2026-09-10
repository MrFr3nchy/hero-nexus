import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignImages,
  campaignMapPins,
  campaignMaps,
  canonEntries,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';

export interface MapPinRow {
  id: string;
  x: number;
  y: number;
  label: string;
  /** Null for a player — what the DM knows about a place never travels. */
  dmNote: string | null;
  canonEntryId: string | null;
  /** The linked entry's title, when the viewer may see that entry at all. */
  canonTitle: string | null;
  visibility: 'dm' | 'shared';
}

export interface MapRow {
  id: string;
  imageId: string;
  title: string;
  visibility: 'dm' | 'shared';
  /** Lit on every screen at the table right now. At most one per campaign. */
  spotlighted: boolean;
  sortOrder: number;
  pins: MapPinRow[];
}

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

async function staffForMap(mapId: string) {
  const map = await db.query.campaignMaps.findFirst({
    where: eq(campaignMaps.id, mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  await staff(map.campaignId);
  return map;
}

async function staffForPin(pinId: string) {
  const pin = await db.query.campaignMapPins.findFirst({
    where: eq(campaignMapPins.id, pinId),
  });
  if (!pin) throw new Error('NOT_FOUND');
  const map = await staffForMap(pin.mapId);
  return { pin, map };
}

/**
 * The maps a viewer may see, with the pins they may see on them.
 *
 * Two filters, not one: a shared map can carry pins the party has not been
 * shown. That is the normal case — the DM marks the cult's safehouse on the
 * party's own map, and the party finds out when they find out.
 */
export async function listMaps(campaignId: string): Promise<MapRow[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);

  const maps = await db
    .select()
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, campaignId))
    .orderBy(asc(campaignMaps.sortOrder), asc(campaignMaps.createdAt));

  const visible = maps.filter(m => isStaff || m.visibility === 'shared');
  if (visible.length === 0) return [];

  const pins = await db
    .select()
    .from(campaignMapPins)
    .where(
      inArray(
        campaignMapPins.mapId,
        visible.map(m => m.id)
      )
    );

  // Titles for linked entries, and only for entries this viewer may read: a
  // pin pointing at a DM-only canon entry must not hand over its name.
  const linkedIds = [
    ...new Set(
      pins.map(p => p.canonEntryId).filter((id): id is string => !!id)
    ),
  ];
  const titleById = new Map<string, string>();
  if (linkedIds.length > 0) {
    const rows = await db
      .select()
      .from(canonEntries)
      .where(
        and(
          eq(canonEntries.campaignId, campaignId),
          inArray(canonEntries.id, linkedIds)
        )
      );
    for (const row of rows) {
      if (isStaff || row.visibility === 'shared') {
        titleById.set(row.id, row.title);
      }
    }
  }

  return visible.map(map => ({
    id: map.id,
    imageId: map.imageId,
    title: map.title,
    visibility: map.visibility,
    spotlighted: map.spotlighted,
    sortOrder: map.sortOrder,
    pins: pins
      .filter(p => p.mapId === map.id)
      .filter(p => isStaff || p.visibility === 'shared')
      .map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        label: p.label,
        dmNote: isStaff ? p.dmNote : null,
        canonEntryId: p.canonEntryId,
        canonTitle: p.canonEntryId
          ? (titleById.get(p.canonEntryId) ?? null)
          : null,
        visibility: p.visibility,
      })),
  }));
}

export interface MapInput {
  imageId: string;
  title?: string;
  visibility?: 'dm' | 'shared';
}

export async function createMap(
  campaignId: string,
  input: MapInput
): Promise<string> {
  const { userId } = await staff(campaignId);

  // The picture must belong to this campaign. Images are served through a
  // role-checked route, and a map pointing at another table's upload would be
  // a way to ask that route for it.
  const image = await db.query.campaignImages.findFirst({
    where: and(
      eq(campaignImages.id, input.imageId),
      eq(campaignImages.campaignId, campaignId)
    ),
  });
  if (!image) throw new Error('NOT_FOUND');

  const existing = await db
    .select({ sortOrder: campaignMaps.sortOrder })
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, campaignId));
  const next = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

  const [row] = await db
    .insert(campaignMaps)
    .values({
      campaignId,
      imageId: input.imageId,
      title: (input.title ?? '').trim(),
      visibility: input.visibility ?? 'dm',
      sortOrder: next,
      createdBy: userId,
    })
    .returning({ id: campaignMaps.id });
  return row.id;
}

export async function setMapVisibility(
  mapId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  const map = await staffForMap(mapId);
  await db
    .update(campaignMaps)
    .set({
      visibility,
      // Taking a map back from the party takes the spotlight with it. A lit
      // map the party may not see would be a promise the filter then breaks.
      spotlighted: visibility === 'shared' ? map.spotlighted : false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaignMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/**
 * Put a map in front of everybody, or take it down.
 *
 * The other half of what a table uses a map for, and the half that needed no
 * battle grid: pins are already fractions of the image, so one spotlight lands
 * in the same place on the DM's monitor and a player's phone. `MapPanel`'s
 * standing "deliberately not a battle grid" decision is untouched — there are
 * still no tokens, no fog and no lattice.
 *
 * Lighting one shares it, and darkens whatever was lit before.
 */
export async function spotlightMap(mapId: string, lit: boolean): Promise<void> {
  const map = await staffForMap(mapId);

  await db
    .update(campaignMaps)
    .set({ spotlighted: false })
    .where(eq(campaignMaps.campaignId, map.campaignId));

  if (lit) {
    await db
      .update(campaignMaps)
      .set({
        spotlighted: true,
        visibility: 'shared',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(campaignMaps.id, mapId));
  }

  bumpVersion(map.campaignId);
  publish(map.campaignId, {
    kind: 'map',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: null,
    title: map.title || 'A map',
    state: lit ? 'lit' : 'dark',
  });
}

export async function deleteMap(mapId: string): Promise<void> {
  await staffForMap(mapId);
  await db.delete(campaignMaps).where(eq(campaignMaps.id, mapId));
}

export interface PinInput {
  x: number;
  y: number;
  label?: string;
  dmNote?: string;
  canonEntryId?: string | null;
  visibility?: 'dm' | 'shared';
}

/** Fractions of the image. Anything outside is a pin nobody can ever see. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/** A pin may only point at an entry in the same campaign. */
async function checkCanon(
  campaignId: string,
  entryId: string | null | undefined
): Promise<string | null> {
  if (!entryId) return null;
  const row = await db.query.canonEntries.findFirst({
    where: and(
      eq(canonEntries.id, entryId),
      eq(canonEntries.campaignId, campaignId)
    ),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row.id;
}

export async function addPin(mapId: string, input: PinInput): Promise<string> {
  const map = await staffForMap(mapId);
  const [row] = await db
    .insert(campaignMapPins)
    .values({
      mapId,
      x: clamp01(input.x),
      y: clamp01(input.y),
      label: (input.label ?? '').trim(),
      dmNote: input.dmNote ?? '',
      canonEntryId: await checkCanon(map.campaignId, input.canonEntryId),
      visibility: input.visibility ?? 'dm',
    })
    .returning({ id: campaignMapPins.id });
  return row.id;
}

export async function updatePin(
  pinId: string,
  patch: Partial<PinInput>
): Promise<void> {
  const { map } = await staffForPin(pinId);
  const set: Partial<typeof campaignMapPins.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.x !== undefined) set.x = clamp01(patch.x);
  if (patch.y !== undefined) set.y = clamp01(patch.y);
  if (patch.label !== undefined) set.label = patch.label.trim();
  if (patch.dmNote !== undefined) set.dmNote = patch.dmNote;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.canonEntryId !== undefined) {
    set.canonEntryId = await checkCanon(map.campaignId, patch.canonEntryId);
  }

  await db
    .update(campaignMapPins)
    .set(set)
    .where(eq(campaignMapPins.id, pinId));
}

export async function deletePin(pinId: string): Promise<void> {
  await staffForPin(pinId);
  await db.delete(campaignMapPins).where(eq(campaignMapPins.id, pinId));
}
