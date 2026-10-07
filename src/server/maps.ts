import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, max } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignImages,
  campaignMembers,
  campaigns,
  campaignMapPins,
  campaignMaps,
  campaignQuests,
  campaignSessions,
  canonEntries,
  canonReveals,
  encounterPlans,
  mapJourney,
  playerJournals,
  users,
} from '@/db/schema';
import { format as formatWorldTime } from '@/@creator/campaign/lib/calendar';
import {
  cellAt,
  clamp01,
  isMarkKind,
  normalizeRevealed,
  type JourneyStop,
  type MarkKind,
} from '@/@creator/campaign/lib/party-map';
import { requireCampaignRole, type CampaignRole } from './campaigns';
import { announceJourney } from './discord';
import { bumpVersion, publish } from './live-hub';
import { readWorldClock } from './world-time';

/**
 * Canon maps — the party's map.
 *
 * A picture with **marks** on it (named points, each a kind of place), the
 * **journey** (the party's route, numbered stops the DM puts down), and
 * optional **fog of war** over the picture. Everything is stored as
 * fractions of the image, so it lands in the same place on every screen.
 *
 * Who may do what:
 *
 * - Staff do everything, and see everything.
 * - A player sees shared maps, and on them the marks the party may see: a
 *   shared mark, never one in fog (unless they put it there themselves).
 * - On a map the DM has opened, a player may put marks down, and edit or
 *   take up their own. Theirs are seen by everyone at once.
 * - Only staff move the journey: it is where the party actually went.
 *
 * Every write bumps the version: the session screen's spotlight reads
 * through `listMaps`.
 */

export interface MapLink {
  id: string;
  /** What it is called, as this viewer may read it. */
  title: string;
}

export interface MapPinRow {
  id: string;
  x: number;
  y: number;
  label: string;
  kind: MarkKind;
  /** What the party wrote about it. */
  note: string;
  /** Null for a player — what the DM knows about a place never travels. */
  dmNote: string | null;
  canonEntryId: string | null;
  /** The linked entry's title, when the viewer may see that entry at all. */
  canonTitle: string | null;
  /** The linked entry's kind: a `location` makes this the mark for a place. */
  canonKind: string | null;
  /** A map drawn of the place this mark is for, when the viewer may open it. */
  opensMapId: string | null;
  /**
   * A battle mark (0072): a planned fight happens here. `encounter` is staff
   * only; a player sees `battle` and the mark's own words, never the plan.
   */
  battle: boolean;
  encounter: (MapLink & { ran: string | null }) | null;
  quest: MapLink | null;
  session: MapLink | null;
  journal: MapLink | null;
  visibility: 'dm' | 'shared';
  /** Who put it down, by name. Null for the DM's own prep. */
  byName: string | null;
  /** The viewer put it there. */
  mine: boolean;
  /** The viewer may move, rename or remove it. */
  canEdit: boolean;
  /** Journey stops made at this mark, by number. */
  stops: number[];
}

export interface MapRow {
  id: string;
  imageId: string;
  title: string;
  /** The place this map shows (0072), when the viewer may see that place. */
  placeId: string | null;
  visibility: 'dm' | 'shared';
  /** Lit on every screen at the table right now. At most one per campaign. */
  spotlighted: boolean;
  sortOrder: number;
  /** Players may put marks on it. */
  marksOpen: boolean;
  /** Fog of war is on: only revealed cells of the picture show. */
  fogged: boolean;
  /** Revealed cells of the fog lattice (`lib/party-map.ts`). */
  revealed: number[];
  pins: MapPinRow[];
  journey: JourneyStop[];
}

function isStaffRole(role: CampaignRole): boolean {
  return role === 'gm' || role === 'co-gm';
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

async function mapFor(mapId: string) {
  const map = await db.query.campaignMaps.findFirst({
    where: eq(campaignMaps.id, mapId),
  });
  if (!map) throw new Error('NOT_FOUND');
  return map;
}

async function staffForMap(mapId: string) {
  const map = await mapFor(mapId);
  await staff(map.campaignId);
  return map;
}

/** A member at the map's table, and whether they are staff. */
async function memberForMap(mapId: string) {
  const map = await mapFor(mapId);
  const { userId, role } = await requireCampaignRole(map.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);
  // A map the party has not been shown does not exist for a player.
  if (!isStaff && map.visibility !== 'shared') throw new Error('NOT_FOUND');
  return { map, userId, isStaff };
}

function sessionLabel(number: number, title: string): string {
  return title ? `Session ${number} · ${title}` : `Session ${number}`;
}

/**
 * The maps a viewer may see, with the marks and stops they may see on them.
 *
 * Two filters, not one: a shared map can carry marks the party has not been
 * shown — the DM marks the cult's safehouse on the party's own map, and the
 * party finds out when they find out. Fog of war is a third: a mark in a cell
 * nobody has revealed is not sent to a player.
 */
export async function listMaps(campaignId: string): Promise<MapRow[]> {
  const { role, userId } = await requireCampaignRole(campaignId, [
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
  const mapIds = visible.map(m => m.id);

  const [pins, stops] = await Promise.all([
    db
      .select()
      .from(campaignMapPins)
      .where(inArray(campaignMapPins.mapId, mapIds)),
    db
      .select()
      .from(mapJourney)
      .where(inArray(mapJourney.mapId, mapIds))
      .orderBy(asc(mapJourney.seq)),
  ]);
  // Where the party is headed is the DM's until shown.
  const stopsSeen = stops.filter(s => isStaff || s.visibility === 'shared');

  const revealedOf = new Map(
    visible.map(m => [m.id, new Set(normalizeRevealed(m.revealed))])
  );
  const seen = pins.filter(p => {
    if (isStaff) return true;
    if (p.visibility !== 'shared') return false;
    const map = visible.find(m => m.id === p.mapId)!;
    if (!map.fogged || p.createdBy === userId) return true;
    return revealedOf.get(map.id)!.has(cellAt(p.x, p.y));
  });

  const ids = <K extends keyof (typeof pins)[number]>(k: K) =>
    [
      ...new Set(
        seen.map(p => p[k]).filter((v): v is string & typeof v => !!v)
      ),
    ] as string[];

  // Everything a mark can point at, read once, and only what this viewer
  // may see: a mark on the party's map must not hand over the name of a
  // DM-only quest or somebody's private journal page.
  // Canon is read whole rather than by the marks' ids: a map's own place
  // decides whether a player may know what the map is of, too.
  const [canonRows, revealRows, questRows, sessionRows, journalRows, planRows] =
    await Promise.all([
      db
        .select({
          id: canonEntries.id,
          title: canonEntries.title,
          kind: canonEntries.kind,
          visibility: canonEntries.visibility,
        })
        .from(canonEntries)
        .where(eq(canonEntries.campaignId, campaignId)),
      !isStaff
        ? db
            .select({ entryId: canonReveals.entryId })
            .from(canonReveals)
            .innerJoin(canonEntries, eq(canonEntries.id, canonReveals.entryId))
            .where(
              and(
                eq(canonEntries.campaignId, campaignId),
                eq(canonReveals.userId, userId)
              )
            )
        : [],
      ids('questId').length
        ? db
            .select()
            .from(campaignQuests)
            .where(inArray(campaignQuests.id, ids('questId')))
        : [],
      db
        .select()
        .from(campaignSessions)
        .where(eq(campaignSessions.campaignId, campaignId)),
      ids('journalId').length
        ? db
            .select()
            .from(playerJournals)
            .where(inArray(playerJournals.id, ids('journalId')))
        : [],
      isStaff && ids('encounterPlanId').length
        ? db
            .select({
              id: encounterPlans.id,
              name: encounterPlans.name,
              ranSessionId: encounterPlans.ranSessionId,
              ranAt: encounterPlans.ranAt,
            })
            .from(encounterPlans)
            .where(inArray(encounterPlans.id, ids('encounterPlanId')))
        : [],
    ]);
  const toldMe = new Set(revealRows.map(r => r.entryId));
  const canonSeen = canonRows.filter(
    r => isStaff || r.visibility === 'shared' || toldMe.has(r.id)
  );
  const canonTitle = new Map(canonSeen.map(r => [r.id, r.title]));
  const canonKind = new Map(canonSeen.map(r => [r.id, r.kind]));
  // A mark for a place opens the map drawn of it, if this viewer may open it.
  const mapOfPlace = new Map<string, string>();
  for (const m of visible) {
    if (m.placeId && canonTitle.has(m.placeId) && !mapOfPlace.has(m.placeId)) {
      mapOfPlace.set(m.placeId, m.id);
    }
  }
  const questTitle = new Map(
    questRows
      .filter(q => isStaff || q.visibility === 'shared')
      .map(q => [q.id, q.title])
  );
  const sessionById = new Map(
    sessionRows.map(s => [s.id, sessionLabel(s.number, s.title)])
  );
  const planById = new Map(
    planRows.map(p => [
      p.id,
      {
        id: p.id,
        title: p.name || 'An encounter',
        ran: p.ranAt
          ? p.ranSessionId && sessionById.has(p.ranSessionId)
            ? `Fought in ${sessionById.get(p.ranSessionId)}`
            : 'Fought'
          : null,
      },
    ])
  );
  const journalTitle = new Map(
    journalRows
      .filter(
        j =>
          j.userId === userId ||
          j.visibility === 'party' ||
          (isStaff && j.visibility === 'dm')
      )
      .map(j => [j.id, j.title || 'A journal page'])
  );

  const authorIds = [
    ...new Set(seen.map(p => p.createdBy).filter((v): v is string => !!v)),
  ];
  const nameById = new Map<string, string>();
  if (authorIds.length) {
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, authorIds));
    for (const r of rows) nameById.set(r.id, r.name ?? 'A player');
  }
  // The DM's own prep is unsigned; a player's mark says whose it is.
  const [campaignRow, coDms] = await Promise.all([
    db.query.campaigns.findFirst({
      columns: { gmId: true },
      where: eq(campaigns.id, campaignId),
    }),
    db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.campaignId, campaignId),
          eq(campaignMembers.role, 'co-gm')
        )
      ),
  ]);
  const staffIds = new Set([
    ...(campaignRow ? [campaignRow.gmId] : []),
    ...coDms.map(m => m.userId),
  ]);

  const clock = await readWorldClock(campaignId);
  const link = (id: string | null, titles: Map<string, string>) =>
    id && titles.has(id) ? { id, title: titles.get(id)! } : null;

  return visible.map(map => {
    const journey: JourneyStop[] = stopsSeen
      .filter(s => s.mapId === map.id)
      .map(s => {
        return {
          id: s.id,
          seq: s.seq,
          planned: s.planned,
          visibility: s.visibility,
          x: s.x,
          y: s.y,
          label: s.label,
          pinId: s.pinId,
          sessionId: s.sessionId,
          sessionLabel: s.sessionId
            ? (sessionById.get(s.sessionId) ?? null)
            : null,
          // Written out with the table's own calendar, as it reads now.
          worldDate:
            s.worldDate && typeof s.worldDate === 'object'
              ? formatWorldTime(
                  clock.calendar,
                  s.worldDate as Parameters<typeof formatWorldTime>[1],
                  'short'
                )
              : null,
          createdAt: s.createdAt,
        };
      });
    return {
      id: map.id,
      imageId: map.imageId,
      title: map.title,
      placeId: map.placeId && canonTitle.has(map.placeId) ? map.placeId : null,
      visibility: map.visibility,
      spotlighted: map.spotlighted,
      sortOrder: map.sortOrder,
      marksOpen: map.marksOpen,
      fogged: map.fogged,
      revealed: [...revealedOf.get(map.id)!],
      journey,
      pins: seen
        .filter(p => p.mapId === map.id)
        .map(p => {
          const mine = p.createdBy === userId;
          const byPlayer = p.createdBy && !staffIds.has(p.createdBy);
          return {
            id: p.id,
            x: p.x,
            y: p.y,
            label: p.label,
            kind: isMarkKind(p.kind) ? p.kind : 'place',
            note: p.note,
            dmNote: isStaff ? p.dmNote : null,
            canonEntryId: canonTitle.has(p.canonEntryId ?? '')
              ? p.canonEntryId
              : null,
            canonTitle: p.canonEntryId
              ? (canonTitle.get(p.canonEntryId) ?? null)
              : null,
            canonKind: p.canonEntryId
              ? (canonKind.get(p.canonEntryId) ?? null)
              : null,
            opensMapId:
              p.canonEntryId && mapOfPlace.get(p.canonEntryId) !== map.id
                ? (mapOfPlace.get(p.canonEntryId) ?? null)
                : null,
            battle: Boolean(p.encounterPlanId),
            encounter: p.encounterPlanId
              ? (planById.get(p.encounterPlanId) ?? null)
              : null,
            quest: link(p.questId, questTitle),
            session: link(p.sessionId, sessionById),
            journal: link(p.journalId, journalTitle),
            visibility: p.visibility,
            byName: byPlayer ? (nameById.get(p.createdBy!) ?? null) : null,
            mine,
            canEdit: isStaff || mine,
            stops: journey
              .filter(s => s.pinId === p.id && !s.planned)
              .map(s => s.seq),
          } satisfies MapPinRow;
        }),
    };
  });
}

export interface MapInput {
  imageId: string;
  title?: string;
  visibility?: 'dm' | 'shared';
  /** The place it shows: a `location` entry at this table. */
  placeId?: string | null;
}

/** A place a map may show: a `location` entry at this table, or nothing. */
async function checkMapPlace(
  campaignId: string,
  placeId: string | null | undefined
): Promise<string | null> {
  if (!placeId) return null;
  const row = await db.query.canonEntries.findFirst({
    columns: { id: true, kind: true },
    where: and(
      eq(canonEntries.id, placeId),
      eq(canonEntries.campaignId, campaignId)
    ),
  });
  if (!row) throw new Error('NOT_FOUND');
  if (row.kind !== 'location') throw new Error('NOT_A_PLACE');
  return row.id;
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
  const next = existing.reduce((m, r) => Math.max(m, r.sortOrder), 0) + 1;

  const [row] = await db
    .insert(campaignMaps)
    .values({
      campaignId,
      imageId: input.imageId,
      title: (input.title ?? '').trim(),
      visibility: input.visibility ?? 'dm',
      placeId: await checkMapPlace(campaignId, input.placeId),
      sortOrder: next,
      createdBy: userId,
    })
    .returning({ id: campaignMaps.id });
  bumpVersion(campaignId);
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

/** Say which place a map shows, or that it shows no place in particular. */
export async function setMapPlace(
  mapId: string,
  placeId: string | null
): Promise<void> {
  const map = await staffForMap(mapId);
  await db
    .update(campaignMaps)
    .set({
      placeId: await checkMapPlace(map.campaignId, placeId),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaignMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/** Retitle a map. */
export async function renameMap(mapId: string, title: string): Promise<void> {
  const map = await staffForMap(mapId);
  await db
    .update(campaignMaps)
    .set({
      title: title.trim().slice(0, 120),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(campaignMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/** Let players put marks on it, or stop them. Their marks stay either way. */
export async function setMarksOpen(
  mapId: string,
  open: boolean
): Promise<void> {
  const map = await staffForMap(mapId);
  await db
    .update(campaignMaps)
    .set({ marksOpen: open, updatedAt: new Date().toISOString() })
    .where(eq(campaignMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/** Fog of war on or off. What was revealed stays revealed. */
export async function setMapFog(mapId: string, fogged: boolean): Promise<void> {
  const map = await staffForMap(mapId);
  await db
    .update(campaignMaps)
    .set({ fogged, updatedAt: new Date().toISOString() })
    .where(eq(campaignMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/** Reveal cells of the fog lattice, or cover them again. */
export async function revealMapCells(
  mapId: string,
  cells: number[],
  reveal: boolean
): Promise<void> {
  const map = await staffForMap(mapId);
  const current = new Set(normalizeRevealed(map.revealed));
  for (const c of normalizeRevealed(cells)) {
    if (reveal) current.add(c);
    else current.delete(c);
  }
  await db
    .update(campaignMaps)
    .set({ revealed: [...current].sort((a, b) => a - b) })
    .where(eq(campaignMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/**
 * Put a map in front of everybody, or take it down.
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
  const map = await staffForMap(mapId);
  await db.delete(campaignMaps).where(eq(campaignMaps.id, mapId));
  bumpVersion(map.campaignId);
}

/* --- marks ------------------------------------------------------------------- */

export interface PinInput {
  x: number;
  y: number;
  label?: string;
  kind?: MarkKind;
  note?: string;
  dmNote?: string;
  canonEntryId?: string | null;
  questId?: string | null;
  sessionId?: string | null;
  journalId?: string | null;
  /** A battle mark: staff only. */
  encounterPlanId?: string | null;
  visibility?: 'dm' | 'shared';
}

/**
 * The links a mark may carry, checked against what the viewer may see: a
 * player can tie their mark to a quest, entry or journal page they can read,
 * and to any session — never to something they could not open. Undefined
 * leaves a link as it is; null clears it.
 */
async function checkLinks(
  campaignId: string,
  viewer: { userId: string; isStaff: boolean },
  input: Pick<
    PinInput,
    'canonEntryId' | 'questId' | 'sessionId' | 'journalId' | 'encounterPlanId'
  >
): Promise<Partial<typeof campaignMapPins.$inferInsert>> {
  const out: Partial<typeof campaignMapPins.$inferInsert> = {};
  // A plan is prep: only staff tie a mark to one, and a player's edit never
  // touches the link.
  if (input.encounterPlanId !== undefined && viewer.isStaff) {
    out.encounterPlanId = null;
    if (input.encounterPlanId) {
      const row = await db.query.encounterPlans.findFirst({
        columns: { id: true },
        where: and(
          eq(encounterPlans.id, input.encounterPlanId),
          eq(encounterPlans.campaignId, campaignId)
        ),
      });
      if (!row) throw new Error('NOT_FOUND');
      out.encounterPlanId = row.id;
    }
  }
  if (input.canonEntryId !== undefined) {
    out.canonEntryId = null;
    if (input.canonEntryId) {
      const row = await db.query.canonEntries.findFirst({
        where: and(
          eq(canonEntries.id, input.canonEntryId),
          eq(canonEntries.campaignId, campaignId)
        ),
      });
      if (!row) throw new Error('NOT_FOUND');
      if (!viewer.isStaff && row.visibility !== 'shared') {
        const told = await db.query.canonReveals.findFirst({
          where: and(
            eq(canonReveals.entryId, row.id),
            eq(canonReveals.userId, viewer.userId)
          ),
        });
        if (!told) throw new Error('NOT_FOUND');
      }
      out.canonEntryId = row.id;
    }
  }
  if (input.questId !== undefined) {
    out.questId = null;
    if (input.questId) {
      const row = await db.query.campaignQuests.findFirst({
        where: and(
          eq(campaignQuests.id, input.questId),
          eq(campaignQuests.campaignId, campaignId)
        ),
      });
      if (!row || (!viewer.isStaff && row.visibility !== 'shared')) {
        throw new Error('NOT_FOUND');
      }
      out.questId = row.id;
    }
  }
  if (input.sessionId !== undefined) {
    out.sessionId = null;
    if (input.sessionId) {
      const row = await db.query.campaignSessions.findFirst({
        where: and(
          eq(campaignSessions.id, input.sessionId),
          eq(campaignSessions.campaignId, campaignId)
        ),
      });
      if (!row) throw new Error('NOT_FOUND');
      out.sessionId = row.id;
    }
  }
  if (input.journalId !== undefined) {
    out.journalId = null;
    if (input.journalId) {
      const row = await db.query.playerJournals.findFirst({
        where: and(
          eq(playerJournals.id, input.journalId),
          eq(playerJournals.campaignId, campaignId)
        ),
      });
      const readable =
        row &&
        (row.userId === viewer.userId ||
          row.visibility === 'party' ||
          (viewer.isStaff && row.visibility === 'dm'));
      if (!readable) throw new Error('NOT_FOUND');
      out.journalId = row.id;
    }
  }
  return out;
}

/**
 * Put a mark down. Staff anywhere, as they like. A player only on a shared
 * map the DM has opened, not in fog, and the mark is the party's at once.
 */
export async function addPin(mapId: string, input: PinInput): Promise<string> {
  const { map, userId, isStaff } = await memberForMap(mapId);
  const x = clamp01(input.x);
  const y = clamp01(input.y);
  if (!isStaff) {
    if (!map.marksOpen) throw new Error('MARKS_CLOSED');
    if (map.fogged && !normalizeRevealed(map.revealed).includes(cellAt(x, y))) {
      throw new Error('IN_FOG');
    }
  }
  const links = await checkLinks(map.campaignId, { userId, isStaff }, input);
  const [row] = await db
    .insert(campaignMapPins)
    .values({
      mapId,
      x,
      y,
      label: (input.label ?? '').trim().slice(0, 120),
      kind: isMarkKind(input.kind) ? input.kind : 'place',
      note: (input.note ?? '').slice(0, 2000),
      dmNote: isStaff ? (input.dmNote ?? '') : '',
      visibility: isStaff ? (input.visibility ?? 'dm') : 'shared',
      createdBy: userId,
      ...links,
    })
    .returning({ id: campaignMapPins.id });
  bumpVersion(map.campaignId);
  return row.id;
}

async function editableMark(pinId: string) {
  const pin = await db.query.campaignMapPins.findFirst({
    where: eq(campaignMapPins.id, pinId),
  });
  if (!pin) throw new Error('NOT_FOUND');
  const ctx = await memberForMap(pin.mapId);
  // Staff edit any mark; a player only their own, and only on an open map.
  if (!ctx.isStaff) {
    if (pin.createdBy !== ctx.userId) throw new Error('FORBIDDEN');
    if (!ctx.map.marksOpen) throw new Error('MARKS_CLOSED');
  }
  return { pin, ...ctx };
}

export async function updatePin(
  pinId: string,
  patch: Partial<PinInput>
): Promise<void> {
  const { map, userId, isStaff } = await editableMark(pinId);
  const set: Partial<typeof campaignMapPins.$inferInsert> = {
    updatedAt: new Date().toISOString(),
    ...(await checkLinks(map.campaignId, { userId, isStaff }, patch)),
  };
  if (patch.x !== undefined) set.x = clamp01(patch.x);
  if (patch.y !== undefined) set.y = clamp01(patch.y);
  if (patch.label !== undefined) set.label = patch.label.trim().slice(0, 120);
  if (patch.kind !== undefined && isMarkKind(patch.kind)) set.kind = patch.kind;
  if (patch.note !== undefined) set.note = patch.note.slice(0, 2000);
  if (isStaff) {
    if (patch.dmNote !== undefined) set.dmNote = patch.dmNote;
    if (patch.visibility !== undefined) set.visibility = patch.visibility;
  }
  await db
    .update(campaignMapPins)
    .set(set)
    .where(eq(campaignMapPins.id, pinId));
  bumpVersion(map.campaignId);
}

export async function deletePin(pinId: string): Promise<void> {
  const { map } = await editableMark(pinId);
  await db.delete(campaignMapPins).where(eq(campaignMapPins.id, pinId));
  bumpVersion(map.campaignId);
}

/**
 * Make it real: a player's guess — a rumour mark — becomes a place.
 *
 * Staff only, in one transaction: a `location` entry is written from the
 * mark's label and the party's note, placed in the place the map shows; the
 * mark is pointed at it and becomes a mark for a place. `created_by` is left
 * alone, so the mark still says whose guess it was.
 */
export async function promoteRumour(pinId: string): Promise<string> {
  const pin = await db.query.campaignMapPins.findFirst({
    where: eq(campaignMapPins.id, pinId),
  });
  if (!pin) throw new Error('NOT_FOUND');
  const map = await staffForMap(pin.mapId);
  const { userId } = await staff(map.campaignId);
  if (pin.kind !== 'rumour') throw new Error('NOT_A_RUMOUR');

  const entryId = randomUUID();
  const now = new Date().toISOString();
  db.transaction(tx => {
    tx.insert(canonEntries)
      .values({
        id: entryId,
        campaignId: map.campaignId,
        kind: 'location',
        title: pin.label.trim() || 'A place somebody guessed at',
        partyBody: pin.note,
        dmBody: '',
        // The party guessed it, so the party knows of it.
        visibility: pin.visibility === 'shared' ? 'shared' : 'dm',
        placeId: map.placeId ?? null,
        createdBy: userId,
      })
      .run();
    tx.update(campaignMapPins)
      .set({ canonEntryId: entryId, kind: 'place', updatedAt: now })
      .where(eq(campaignMapPins.id, pinId))
      .run();
  });
  bumpVersion(map.campaignId);
  return entryId;
}

/* --- the journey -------------------------------------------------------------- */

/**
 * The party is here: the next stop on the journey, stamped with the session
 * that is sitting (if one is) and the world's date (if the table is
 * counting). Staff only — the journey is where the party actually went. A
 * stop made on a mark takes the mark's place and name.
 */
export async function addJourneyStop(
  mapId: string,
  input: {
    x: number;
    y: number;
    label?: string;
    pinId?: string | null;
    /** Where the party is headed, not where it is: unnumbered, the DM's. */
    planned?: boolean;
  }
): Promise<string> {
  const map = await staffForMap(mapId);
  const { userId } = await staff(map.campaignId);

  let x = clamp01(input.x);
  let y = clamp01(input.y);
  let label = (input.label ?? '').trim().slice(0, 120);
  let pinId: string | null = null;
  if (input.pinId) {
    const pin = await db.query.campaignMapPins.findFirst({
      where: and(
        eq(campaignMapPins.id, input.pinId),
        eq(campaignMapPins.mapId, mapId)
      ),
    });
    if (!pin) throw new Error('NOT_FOUND');
    pinId = pin.id;
    x = pin.x;
    y = pin.y;
    label = label || pin.label;
  }

  if (input.planned) {
    const [row] = await db
      .insert(mapJourney)
      .values({
        campaignId: map.campaignId,
        mapId,
        seq: 0,
        planned: true,
        visibility: 'dm',
        x,
        y,
        label,
        pinId,
        createdBy: userId,
      })
      .returning({ id: mapJourney.id });
    bumpVersion(map.campaignId);
    return row.id;
  }

  const [{ top }] = await db
    .select({ top: max(mapJourney.seq) })
    .from(mapJourney)
    .where(and(eq(mapJourney.mapId, mapId), eq(mapJourney.planned, false)));
  const live = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, map.campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });
  const clock = await readWorldClock(map.campaignId);
  const seq = (top ?? 0) + 1;

  const [row] = await db
    .insert(mapJourney)
    .values({
      campaignId: map.campaignId,
      mapId,
      seq,
      x,
      y,
      label,
      pinId,
      sessionId: live?.id ?? null,
      worldDate: clock.time,
      createdBy: userId,
    })
    .returning({ id: mapJourney.id });
  bumpVersion(map.campaignId);

  // The channel hears where the party got to, when the party can see the map.
  if (map.visibility === 'shared') {
    announceJourney(map.campaignId, {
      mapTitle: map.title || 'the map',
      label: label || null,
      seq,
      worldDate: clock.time
        ? formatWorldTime(clock.calendar, clock.time, 'short')
        : null,
    });
  }
  return row.id;
}

/**
 * The party got there: a planned stop becomes the next one on the journey,
 * numbered and stamped exactly as "The party is here" would stamp it, and
 * the party can see it.
 */
export async function arriveAtStop(stopId: string): Promise<void> {
  const stop = await db.query.mapJourney.findFirst({
    where: eq(mapJourney.id, stopId),
  });
  if (!stop) throw new Error('NOT_FOUND');
  const map = await staffForMap(stop.mapId);
  if (!stop.planned) return;

  const [{ top }] = await db
    .select({ top: max(mapJourney.seq) })
    .from(mapJourney)
    .where(
      and(eq(mapJourney.mapId, stop.mapId), eq(mapJourney.planned, false))
    );
  const live = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, map.campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });
  const clock = await readWorldClock(map.campaignId);
  const seq = (top ?? 0) + 1;
  await db
    .update(mapJourney)
    .set({
      planned: false,
      visibility: 'shared',
      seq,
      sessionId: live?.id ?? null,
      worldDate: clock.time,
      // Put down now: "here" is the stop reached last, not planned first.
      createdAt: new Date().toISOString(),
    })
    .where(eq(mapJourney.id, stopId));
  bumpVersion(map.campaignId);

  if (map.visibility === 'shared') {
    announceJourney(map.campaignId, {
      mapTitle: map.title || 'the map',
      label: stop.label || null,
      seq,
      worldDate: clock.time
        ? formatWorldTime(clock.calendar, clock.time, 'short')
        : null,
    });
  }
}

/** Show the party where it is headed, or keep it back again. */
export async function setStopVisibility(
  stopId: string,
  visibility: 'dm' | 'shared'
): Promise<void> {
  const stop = await db.query.mapJourney.findFirst({
    where: eq(mapJourney.id, stopId),
  });
  if (!stop) throw new Error('NOT_FOUND');
  const map = await staffForMap(stop.mapId);
  // Where the party has been is not a secret to be kept back.
  if (!stop.planned) return;
  await db
    .update(mapJourney)
    .set({ visibility })
    .where(eq(mapJourney.id, stopId));
  bumpVersion(map.campaignId);
}

/** Name a stop — one dropped on the map mid-session arrives without one. */
export async function renameJourneyStop(
  stopId: string,
  label: string
): Promise<void> {
  const stop = await db.query.mapJourney.findFirst({
    where: eq(mapJourney.id, stopId),
  });
  if (!stop) throw new Error('NOT_FOUND');
  const map = await staffForMap(stop.mapId);
  await db
    .update(mapJourney)
    .set({ label: label.trim().slice(0, 120) })
    .where(eq(mapJourney.id, stopId));
  bumpVersion(map.campaignId);
}

/** Take a stop off the journey; the ones after it close up. */
export async function removeJourneyStop(stopId: string): Promise<void> {
  const stop = await db.query.mapJourney.findFirst({
    where: eq(mapJourney.id, stopId),
  });
  if (!stop) throw new Error('NOT_FOUND');
  const map = await staffForMap(stop.mapId);
  await db.delete(mapJourney).where(eq(mapJourney.id, stopId));
  // Planned stops have no number to close up.
  const rest = await db
    .select({ id: mapJourney.id })
    .from(mapJourney)
    .where(and(eq(mapJourney.mapId, stop.mapId), eq(mapJourney.planned, false)))
    .orderBy(asc(mapJourney.seq));
  for (const [i, r] of rest.entries()) {
    await db
      .update(mapJourney)
      .set({ seq: i + 1 })
      .where(eq(mapJourney.id, r.id));
  }
  bumpVersion(map.campaignId);
}

/* --- the other way round ------------------------------------------------------ */

export interface RecordOnMap {
  mapId: string;
  mapTitle: string;
  pinId: string | null;
  /** The mark's name, or the stop's. */
  label: string;
  questId: string | null;
  sessionId: string | null;
  journalId: string | null;
  /** Set for a journey stop. */
  stop: number | null;
}

/**
 * Where on the maps each quest, session and journal page is — for the chips
 * on those cards. Read through `listMaps`, so it is filtered exactly as the
 * maps are.
 */
export async function recordsOnMaps(
  campaignId: string
): Promise<RecordOnMap[]> {
  const maps = await listMaps(campaignId);
  const out: RecordOnMap[] = [];
  for (const map of maps) {
    for (const p of map.pins) {
      if (!p.quest && !p.session && !p.journal) continue;
      out.push({
        mapId: map.id,
        mapTitle: map.title || 'Map',
        pinId: p.id,
        label: p.label || 'A mark',
        questId: p.quest?.id ?? null,
        sessionId: p.session?.id ?? null,
        journalId: p.journal?.id ?? null,
        stop: null,
      });
    }
    for (const s of map.journey) {
      if (!s.sessionId || s.planned) continue;
      out.push({
        mapId: map.id,
        mapTitle: map.title || 'Map',
        pinId: s.pinId,
        label: s.label || `Stop ${s.seq}`,
        questId: null,
        sessionId: s.sessionId,
        journalId: null,
        stop: s.seq,
      });
    }
  }
  return out;
}

/**
 * The record-to-map links for a campaign page, and whether this viewer can
 * put a new mark down anywhere ("Put it on the map" shows only if so).
 */
export async function mapLinks(
  campaignId: string
): Promise<{ records: RecordOnMap[]; canPlace: boolean }> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const maps = await listMaps(campaignId);
  return {
    records: await recordsOnMaps(campaignId),
    canPlace: isStaffRole(role)
      ? maps.length > 0
      : maps.some(m => m.marksOpen && m.visibility === 'shared'),
  };
}
