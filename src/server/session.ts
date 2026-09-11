import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { serializeConditions } from '@/@creator/campaign/lib/conditions';
import { abilityModifier } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  parseContentData,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import {
  critToneOf,
  rollDie,
  rollNotation,
  type NotationRoll,
} from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignHandoutTargets,
  campaignHandouts,
  campaignMembers,
  campaignRolls,
  campaignSessions,
  campaignTimers,
  campaigns,
  characters,
  initiativeEncounters,
  initiativeEntries,
  users,
} from '@/db/schema';
import { requireCampaignRole, type CampaignRole } from './campaigns';
import { portraitsFor } from './character-portraits';
import { getBattleMapState, type BattleMapState } from './battlemap';
import type { TableKind } from '@/@creator/campaign/lib/screen';
import { listChecks, type CheckRow } from './checks';
import { listMaps, type MapRow } from './maps';
import { listPartyPlayState, type PlayState } from './play';
import { bumpVersion, publish, watchersOf, type Watcher } from './live-hub';
import { resolveContentRefs } from './content';
import { listWhispers, type WhisperRow } from './whispers';

/** How much of the roll log the live view carries. */
const ROLL_LOG_LIMIT = 40;

/**
 * How many copies of one monster may be dealt into a fight at once.
 *
 * Shared with the encounter planner so a line saying 30 kobolds does not
 * quietly become 20 when it is dealt out.
 */
export const MAX_CREATURE_COPIES = 50;

export interface EncounterRow {
  id: string;
  name: string;
  isActive: boolean;
  round: number;
  turnIndex: number;
}

export type EntrySide = 'party' | 'foe' | 'other';

export interface EntryRow {
  id: string;
  label: string;
  characterId: string | null;
  initiative: number;
  hpCurrent: number | null;
  hpMax: number | null;
  hpTemp: number;
  armorClass: number | null;
  conditions: string;
  conditionKeys: string;
  concentrating: boolean;
  side: EntrySide;
  sort: number;
  /** Where the block is. Staff only; null for a player and for a hand-typed foe. */
  creatureRef: ContentRef | null;
}

export interface RollRow {
  id: string;
  actorName: string;
  characterId: string | null;
  label: string;
  notation: string;
  dice: number[];
  dropped: number[];
  modifier: number;
  total: number;
  visibility: 'table' | 'dm';
  createdAt: string;
}

export interface HandoutRow {
  id: string;
  kind: 'image' | 'note';
  title: string;
  body: string | null;
  filePath: string | null;
  mime: string | null;
  visibility: 'dm' | 'shared' | 'selected';
  createdAt: string;
  /** Who a `selected` handout went to. Names, for the DM's list. */
  targetNames: string[];
}

/** A countdown the table can watch. `endsAt` is an instant; the browser ticks. */
export interface TimerRow {
  id: string;
  label: string;
  endsAt: string;
  startedAt: string;
  visibility: 'dm' | 'shared';
  stoppedAt: string | null;
}

/** The evening being played, when there is one. */
export interface SittingRow {
  id: string;
  number: number;
  title: string;
  startedAt: string | null;
}

export interface LiveState {
  role: CampaignRole;
  /**
   * Which of the three tables the campaign is at. **Derived**: no sitting is
   * the desk; a sitting with no fight running is the table; a sitting with a
   * fight running is the sand table. The DM already has the two verbs that
   * change it, and a stored mode would only ever disagree with them.
   */
  table: TableKind;
  /** The sitting in progress, or null. This is what makes a room a room. */
  sitting: SittingRow | null;
  /**
   * Who has the table open right now.
   *
   * Derived from held connections, never stored: presence is true only while a
   * socket is open, and a row asserting it outlives the truth and needs a
   * reaper that will one day miss somebody who closed their laptop.
   */
  watchers: Watcher[];
  encounter: EncounterRow | null;
  entries: EntryRow[];
  handouts: HandoutRow[];
  rolls: RollRow[];
  /** Running countdowns. Staff see their own hidden ones; players do not. */
  timers: TimerRow[];
  /**
   * What the DM has asked for, role-filtered — a hidden DC never appears.
   *
   * On `LiveState` rather than behind a poller of its own, for the reason
   * `DmScreen` already gives about panels: one answer, one request.
   */
  checks: CheckRow[];
  /**
   * Every seated character's at-the-table numbers.
   *
   * Here rather than behind a read of its own, which is what it had: the party
   * panel loaded once on mount and reloaded only on its own actions, so a
   * player spending a hit die reached the DM's screen whenever the DM happened
   * to remount the panel. One answer, one request — `DmScreen` makes the same
   * argument about pollers.
   */
  party: PlayState[];
  /**
   * The map the DM has put in front of everybody, with the pins this viewer
   * may see on it. Null when nothing is lit.
   */
  spotlight: MapRow | null;
  /**
   * The battlefield on the table, fogged for a player. Null when none is
   * active or a player may not see it. Read here rather than behind a poller
   * of its own, so there is one filter for everything a player sees of a
   * fight — the sand-table handoff's own recommendation.
   */
  battlemap: BattleMapState;
  /**
   * Portrait URLs by character id, for every seated character in the fight.
   * The sand table's token art — `character_portraits` was always this. Each
   * is role-checked by `portraitsFor`, so a viewer only gets the ones they may
   * look at, which at their own table is all of them.
   */
  portraits: Record<string, string>;
  /**
   * The whispering this viewer may read — what they said, what was said to
   * them, and for staff everything. Filtered in `whispers.ts`, which is the
   * one place that decides.
   */
  whispers: WhisperRow[];
  /** The viewer's own linked character, so the tracker can say "your turn". */
  viewerCharacterId: string | null;
}

/**
 * Which table a campaign is at, from the two facts that decide it.
 *
 * Derived, never stored — `docs/handoff/the-three-tables/README.md`,
 * decision 1. No role check: the answer is not a secret, and the callers
 * (`getLiveState`, the campaign page, the sitting bar) have each already
 * established the reader belongs here.
 */
export async function tableAt(campaignId: string): Promise<TableKind> {
  const [sitting, fight] = await Promise.all([
    db.query.campaignSessions.findFirst({
      columns: { id: true },
      where: and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.status, 'live')
      ),
    }),
    db.query.initiativeEncounters.findFirst({
      columns: { id: true },
      where: and(
        eq(initiativeEncounters.campaignId, campaignId),
        eq(initiativeEncounters.isActive, true)
      ),
    }),
  ]);
  return !sitting ? 'desk' : fight ? 'battle' : 'table';
}

function orderEntries(rows: EntryRow[]): EntryRow[] {
  return [...rows].sort(
    (a, b) => b.initiative - a.initiative || a.sort - b.sort
  );
}

/**
 * Single call the live-view poller hits. Role-filtered.
 *
 * A player is given foe HP as a word ("Bloodied") by the component, but the
 * numbers still travel — so the exact HP of anything that is not the party's
 * is stripped here instead. The same for DM-only rolls: a roll made behind the
 * screen never reaches a player's browser.
 */
export async function getLiveState(campaignId: string): Promise<LiveState> {
  const { role, userId } = await requireCampaignRole(campaignId, [
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

  const rawEntries = encounter
    ? orderEntries(
        (await db
          .select()
          .from(initiativeEntries)
          .where(eq(initiativeEntries.encounterId, encounter.id))) as EntryRow[]
      )
    : [];

  const entries = isStaff
    ? rawEntries
    : rawEntries.map(e =>
        e.side === 'party'
          ? { ...e, creatureRef: null }
          : {
              ...e,
              hpCurrent: null,
              hpMax: null,
              hpTemp: 0,
              armorClass: null,
              // The block is the DM's. A player knows what an aboleth is from
              // its name; they do not get a key into the bestiary from it.
              creatureRef: null,
            }
      );

  const handoutRows = await db
    .select()
    .from(campaignHandouts)
    .where(eq(campaignHandouts.campaignId, campaignId))
    .orderBy(desc(campaignHandouts.createdAt));

  const handoutTargets =
    handoutRows.length > 0
      ? await db
          .select({
            handoutId: campaignHandoutTargets.handoutId,
            userId: campaignHandoutTargets.userId,
            name: users.name,
            email: users.email,
          })
          .from(campaignHandoutTargets)
          .leftJoin(users, eq(users.id, campaignHandoutTargets.userId))
          .where(
            inArray(
              campaignHandoutTargets.handoutId,
              handoutRows.map(h => h.id)
            )
          )
      : [];

  const handouts: HandoutRow[] = handoutRows
    /*
     * Three states now, and the filter is the point of the third. Staff see
     * everything; a player sees what was shared with the table, plus anything
     * addressed to them by name — and nothing addressed to somebody else, which
     * is what makes a clue for one character a clue for one character.
     */
    .filter(h => {
      if (isStaff) return true;
      if (h.visibility === 'shared') return true;
      if (h.visibility !== 'selected') return false;
      return handoutTargets.some(
        t => t.handoutId === h.id && t.userId === userId
      );
    })
    .map(h => ({
      id: h.id,
      kind: h.kind,
      title: h.title,
      body: h.body,
      filePath: h.filePath,
      mime: h.mime,
      visibility: h.visibility,
      createdAt: h.createdAt,
      // Only staff are told who else was shown a thing. A player learning that
      // the rogue also got the note is a leak the DM did not make.
      targetNames: isStaff
        ? handoutTargets
            .filter(t => t.handoutId === h.id)
            .map(t => t.name?.trim() || t.email?.split('@')[0] || 'Somebody')
        : [],
    }));

  const rollRows = await db
    .select()
    .from(campaignRolls)
    .where(eq(campaignRolls.campaignId, campaignId))
    .orderBy(desc(campaignRolls.createdAt))
    .limit(ROLL_LOG_LIMIT);

  const rolls: RollRow[] = rollRows
    .filter(r => isStaff || r.visibility === 'table')
    .map(r => ({
      id: r.id,
      actorName: r.actorName,
      characterId: r.characterId,
      label: r.label,
      notation: r.notation,
      dice: (r.dice as number[]) ?? [],
      dropped: (r.dropped as number[]) ?? [],
      modifier: r.modifier,
      total: r.total,
      visibility: r.visibility,
      createdAt: r.createdAt,
    }));

  /*
   * Countdowns. A stopped one is dropped for everybody — the row is kept as a
   * record that it ran, not to be drawn — and a hidden one is staff-only, the
   * same rule handouts follow above.
   */
  const timerRows = await db
    .select()
    .from(campaignTimers)
    .where(eq(campaignTimers.campaignId, campaignId))
    .orderBy(campaignTimers.endsAt);

  const timers: TimerRow[] = timerRows
    .filter(t => !t.stoppedAt)
    .filter(t => isStaff || t.visibility === 'shared')
    .map(t => ({
      id: t.id,
      label: t.label,
      endsAt: t.endsAt,
      startedAt: t.startedAt,
      visibility: t.visibility,
      stoppedAt: t.stoppedAt,
    }));

  // Both are their own modules and already role-filtered there — these are
  // reads, not second places that decide what a player may see.
  const [checks, party, maps, battlemap, portraitRows, whispers] =
    await Promise.all([
      listChecks(campaignId),
      listPartyPlayState(campaignId),
      listMaps(campaignId),
      getBattleMapState(campaignId, { userId, role }),
      portraitsFor(
        rawEntries
          .map(e => e.characterId)
          .filter((id): id is string => id !== null)
      ),
      listWhispers(campaignId),
    ]);
  const portraits: Record<string, string> = {};
  for (const [id, row] of portraitRows) portraits[id] = row.url;
  // `listMaps` already dropped anything this viewer may not see, and lighting
  // a map shares it — so a spotlight found here is one they are allowed.
  const spotlight = maps.find(m => m.spotlighted) ?? null;

  const sittingRow = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });

  const membership = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.userId, userId)
    ),
  });

  const table: TableKind = !sittingRow
    ? 'desk'
    : encounter?.isActive
      ? 'battle'
      : 'table';

  return {
    role,
    table,
    sitting: sittingRow
      ? {
          id: sittingRow.id,
          number: sittingRow.number,
          title: sittingRow.title,
          startedAt: sittingRow.startedAt,
        }
      : null,
    watchers: watchersOf(campaignId),
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
    rolls,
    timers,
    checks,
    party,
    spotlight,
    battlemap,
    portraits,
    whispers,
    viewerCharacterId: membership?.characterId ?? null,
  };
}

/* --- the hourglass ----------------------------------------------------- */

/**
 * Start a countdown. Staff only.
 *
 * `seconds` becomes an instant here rather than being stored as a duration, so
 * every viewer counts down to the same moment and a slow response cannot make
 * the clock wrong.
 */
export async function startTimer(
  campaignId: string,
  input: { label: string; seconds: number; visibility?: 'dm' | 'shared' }
): Promise<void> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const seconds = Math.max(
    1,
    Math.min(24 * 60 * 60, Math.trunc(input.seconds))
  );
  const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
  await db.insert(campaignTimers).values({
    campaignId,
    label: input.label.trim().slice(0, 120),
    endsAt,
    visibility: input.visibility ?? 'shared',
    createdBy: userId,
  });
  bumpVersion(campaignId);

  const visibility = input.visibility ?? 'shared';
  publish(
    campaignId,
    {
      kind: 'timer',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      label: input.label.trim().slice(0, 120),
      endsAt,
      secret: visibility === 'dm',
    },
    visibility === 'dm' ? 'staff' : 'everyone'
  );
}

/**
 * Call one off. The row stays with `stoppedAt` set: a countdown that was
 * stopped is a thing that happened, and deleting it would say it never ran.
 */
export async function stopTimer(
  campaignId: string,
  timerId: string
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await db
    .update(campaignTimers)
    .set({ stoppedAt: new Date().toISOString() })
    .where(
      and(
        eq(campaignTimers.id, timerId),
        eq(campaignTimers.campaignId, campaignId)
      )
    );
  bumpVersion(campaignId);
}

/* --- encounter (staff) ------------------------------------------------- */

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

export async function createEncounter(
  campaignId: string,
  name: string
): Promise<string> {
  const { userId } = await staff(campaignId);
  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.campaignId, campaignId));
  const [row] = await db
    .insert(initiativeEncounters)
    .values({ campaignId, name: name.trim() || 'Encounter', isActive: true })
    .returning({ id: initiativeEncounters.id });
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'encounter',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    encounterName: name.trim() || 'Encounter',
    state: 'started',
  });
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
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.id, encounterId));
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'encounter',
    id: randomUUID(),
    at: new Date().toISOString(),
    encounterName: enc?.name ?? 'The fight',
    state: 'ended',
  });
}

export async function deleteEncounter(encounterId: string): Promise<void> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);
  await db
    .delete(initiativeEncounters)
    .where(eq(initiativeEncounters.id, encounterId));
  bumpVersion(campaignId);
}

export async function advanceTurn(
  encounterId: string,
  direction: 1 | -1
): Promise<void> {
  const campaignId = await encounterCampaign(encounterId);
  const { userId } = await staff(campaignId);
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  /*
   * Ordered the way the tracker draws it, not the way the table returns it.
   * `turnIndex` is an index into the *displayed* order, so naming whose turn
   * it is off an unordered read announces the wrong person — and the person
   * whose turn it actually is would be the one not told.
   */
  const ordered = orderEntries(
    (await db
      .select()
      .from(initiativeEntries)
      .where(eq(initiativeEntries.encounterId, encounterId))) as EntryRow[]
  );
  const count = ordered.length;
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
  bumpVersion(campaignId);

  const up = ordered[turn];
  publish(campaignId, {
    kind: 'turn',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    encounterName: enc.name,
    round,
    label: up?.label ?? 'Somebody',
    characterId: up?.characterId ?? null,
  });
}

/* --- entries (staff) ------------------------------------------------- */

export interface EntryInput {
  label: string;
  characterId?: string | null;
  initiative?: number;
  hpCurrent?: number | null;
  hpMax?: number | null;
  hpTemp?: number;
  armorClass?: number | null;
  conditions?: string;
  conditionKeys?: string;
  concentrating?: boolean;
  side?: EntrySide;
  creatureRef?: ContentRef | null;
}

/**
 * "Goblin" three times running is three rows a DM cannot tell apart mid-fight.
 * The second one added becomes "Goblin 2" and the first is renamed "Goblin 1",
 * so the numbering is complete rather than starting at the second.
 */
async function numberDuplicates(
  encounterId: string,
  label: string
): Promise<string> {
  const base = label.trim();
  const stripped = base.replace(/\s+\d+$/, '');
  const siblings = await db
    .select({ id: initiativeEntries.id, label: initiativeEntries.label })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));

  const matcher = new RegExp(
    `^${stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\d+)?$`,
    'i'
  );
  const matches = siblings.filter(r => matcher.test(r.label));
  if (matches.length === 0) return base;

  const bare = matches.find(
    r => r.label.toLowerCase() === stripped.toLowerCase()
  );
  if (bare) {
    await db
      .update(initiativeEntries)
      .set({ label: `${stripped} 1` })
      .where(eq(initiativeEntries.id, bare.id));
  }

  const highest = matches.reduce((max, r) => {
    const n = /(\d+)$/.exec(r.label);
    return Math.max(max, n ? Number(n[1]) : 1);
  }, 1);
  return `${stripped} ${highest + 1}`;
}

export async function addEntry(
  encounterId: string,
  input: EntryInput
): Promise<void> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);
  const existing = await db
    .select({ sort: initiativeEntries.sort })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const nextSort = existing.reduce((max, r) => Math.max(max, r.sort), 0) + 1;

  const label = await numberDuplicates(
    encounterId,
    input.label.trim() || 'Combatant'
  );

  await db.insert(initiativeEntries).values({
    encounterId,
    label,
    characterId: input.characterId ?? null,
    initiative: input.initiative ?? 0,
    hpCurrent: input.hpCurrent ?? null,
    hpMax: input.hpMax ?? null,
    hpTemp: input.hpTemp ?? 0,
    armorClass: input.armorClass ?? null,
    conditions: input.conditions ?? '',
    conditionKeys: input.conditionKeys
      ? serializeConditions(input.conditionKeys.split(','))
      : '',
    concentrating: input.concentrating ?? false,
    side: input.side ?? (input.characterId ? 'party' : 'foe'),
    sort: nextSort,
    creatureRef: input.creatureRef ?? null,
  });
  // Coalesced in the hub, so the loops in `addPartyToEncounter` and
  // `addCreaturesToEncounter` cost one nudge between them rather than five.
  bumpVersion(campaignId);
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
  const campaignId = await entryCampaign(entryId);
  await staff(campaignId);
  const set = { ...patch };
  if (set.conditionKeys !== undefined) {
    set.conditionKeys = serializeConditions(set.conditionKeys.split(','));
  }
  await db
    .update(initiativeEntries)
    .set(set)
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
}

/**
 * Damage and healing rather than "type the new HP".
 *
 * Temporary hit points absorb damage first and are never restored by healing,
 * and healing stops at the maximum — the three rules a DM would otherwise be
 * applying in their head while five people wait.
 */
export async function applyHp(entryId: string, delta: number): Promise<void> {
  const campaignId = await entryCampaign(entryId);
  await staff(campaignId);
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  if (entry.hpCurrent == null) return;

  if (delta < 0) {
    const damage = -delta;
    const fromTemp = Math.min(entry.hpTemp, damage);
    const rest = damage - fromTemp;
    await db
      .update(initiativeEntries)
      .set({
        hpTemp: entry.hpTemp - fromTemp,
        hpCurrent: Math.max(0, entry.hpCurrent - rest),
      })
      .where(eq(initiativeEntries.id, entryId));
    bumpVersion(campaignId);
    return;
  }

  const ceiling = entry.hpMax ?? entry.hpCurrent + delta;
  await db
    .update(initiativeEntries)
    .set({ hpCurrent: Math.min(ceiling, entry.hpCurrent + delta) })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
}

export async function removeEntry(entryId: string): Promise<void> {
  const campaignId = await entryCampaign(entryId);
  await staff(campaignId);
  await db.delete(initiativeEntries).where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
}

/**
 * Add every member's linked character, rolling each one's initiative from
 * their own Dexterity and reading AC and HP off the sheet.
 *
 * Rolled here rather than asked for: the numbers are already on the sheets,
 * and a DM typing five initiatives is five chances to mistype one. Anyone
 * already in the fight is skipped so pressing it twice is harmless.
 */
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
    const sheet = row.sheet as CharacterSheet;
    const dexMod = abilityModifier(sheet?.abilities?.dexterity?.score ?? 10);

    await addEntry(encounterId, {
      label: row.name || 'Character',
      characterId: row.characterId,
      side: 'party',
      initiative: rollDie(20) + dexMod,
      armorClass: sheet?.combat?.armorClass ?? null,
      hpMax: sheet?.combat?.hitPointsMax ?? null,
      hpCurrent:
        sheet?.combat?.hitPointsCurrent ?? sheet?.combat?.hitPointsMax ?? null,
      hpTemp: sheet?.combat?.hitPointsTemp ?? 0,
    });
  }
}

/**
 * Roll initiative for everything in the fight that has no number yet and sort
 * the order. Foes get a flat d20 — a DM adding "Goblin" mid-fight has not told
 * the app the goblin's Dexterity, and a made-up modifier is worse than none.
 */

/**
 * Put a monster in the fight, with the numbers it already has.
 *
 * A DM adding three goblins was retyping AC 15 and 7 hit points three times
 * from a stat block the app was already holding. The creature is resolved
 * through `resolveContentRefs`, so a homebrew monster in the campaign's
 * library drops in exactly like an SRD one.
 *
 * Initiative is rolled here rather than in the browser, for the same reason
 * the shared roll log is: a number the client produced is a claim about a
 * roll, not a record of one. Each copy rolls separately — three goblins that
 * share one initiative are one goblin with three health bars.
 */
export async function addCreaturesToEncounter(
  encounterId: string,
  ref: ContentRef,
  copies: number
): Promise<void> {
  await staff(await encounterCampaign(encounterId));
  if (ref.type !== 'creature') throw new Error('NOT_A_CREATURE');

  const resolved = await resolveContentRefs([ref]);
  const entry = [...resolved.values()][0];
  // Its own code, not NOT_FOUND: the campaign and the encounter are both fine,
  // and telling the DM "campaign not found" when a monster is missing sends
  // them looking in the wrong place.
  if (!entry) throw new Error('NO_SUCH_CREATURE');

  const d = parseContentData('creature', entry.data) as CreatureData;
  const count = Math.max(
    1,
    Math.min(MAX_CREATURE_COPIES, Math.trunc(copies) || 1)
  );

  for (let i = 0; i < count; i++) {
    await addEntry(encounterId, {
      label: entry.name,
      initiative: rollDie(20) + d.initiative_bonus,
      hpCurrent: d.hit_points,
      hpMax: d.hit_points,
      armorClass: d.armor_class,
      side: 'foe',
      creatureRef: ref,
    });
  }
}

export async function rollInitiative(encounterId: string): Promise<void> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);
  const rows = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));

  for (const row of rows) {
    if (row.initiative !== 0) continue;
    await db
      .update(initiativeEntries)
      .set({ initiative: rollDie(20) })
      .where(eq(initiativeEntries.id, row.id));
  }

  // Back to the top of the order: the numbers just changed under it.
  await db
    .update(initiativeEncounters)
    .set({ turnIndex: 0 })
    .where(eq(initiativeEncounters.id, encounterId));
  bumpVersion(campaignId);
}

/* --- the shared roll log --------------------------------------------- */

export interface RollInput {
  notation: string;
  label?: string;
  characterId?: string | null;
  visibility?: 'table' | 'dm';
}

/**
 * Roll dice for the table. Any member may roll; only staff may roll privately,
 * because a player hiding a roll from the DM is not a feature.
 *
 * The dice are rolled here rather than in the browser, so the log records what
 * the dice did instead of what a client said they did.
 */
export async function rollForCampaign(
  campaignId: string,
  input: RollInput
): Promise<NotationRoll> {
  const { role, userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';

  const result = rollNotation(input.notation);
  if (!result) throw new Error('BAD_NOTATION');

  let actorName = '';
  let characterId = input.characterId ?? null;

  if (characterId) {
    const character = await db.query.characters.findFirst({
      where: eq(characters.id, characterId),
    });
    // A character someone else owns is not yours to roll as.
    if (!character || character.ownerId !== userId) {
      if (!isStaff) throw new Error('NOT_YOUR_CHARACTER');
      characterId = character ? characterId : null;
    }
    actorName = character?.name ?? '';
  }

  if (!actorName) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    actorName = user?.name || (isStaff ? 'The DM' : 'A player');
  }

  await db.insert(campaignRolls).values({
    campaignId,
    actorUserId: userId,
    characterId,
    actorName,
    label: (input.label ?? '').trim().slice(0, 80),
    notation: result.notation.slice(0, 60),
    dice: result.dice,
    dropped: result.dropped,
    modifier: result.modifier,
    total: result.total,
    visibility: isStaff ? (input.visibility ?? 'table') : 'table',
  });

  bumpVersion(campaignId);

  /*
   * The announcement. A roll behind the screen publishes to staff and to
   * nobody else — the audience is the whole of the secrecy decision, so it
   * sits beside the `visibility` that decided it rather than three files away.
   */
  const secret = isStaff && (input.visibility ?? 'table') === 'dm';
  publish(
    campaignId,
    {
      kind: 'roll',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      actorName,
      label: (input.label ?? '').trim().slice(0, 80),
      notation: result.notation,
      total: result.total,
      tone: critToneOf(result.notation, result.dice, result.dropped) ?? 'plain',
      secret,
    },
    secret ? 'staff' : 'everyone'
  );

  // Handed back so the roller can animate the faces the server actually
  // rolled. The log is still the record; this is only what to draw.
  return result;
}

/** Clear the log. Staff only — it is the table's record, not one player's. */
export async function clearRolls(campaignId: string): Promise<void> {
  await staff(campaignId);
  await db
    .delete(campaignRolls)
    .where(eq(campaignRolls.campaignId, campaignId));
  bumpVersion(campaignId);
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
  bumpVersion(campaignId);
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
  bumpVersion(campaignId);
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
  visibility: 'dm' | 'shared' | 'selected',
  targetUserIds: string[] = []
): Promise<void> {
  const row = await handoutRow(handoutId);
  const { userId } = await staff(row.campaignId);

  /*
   * Targets are resolved against the table before anything is written, the
   * same order `revealExcerpt` insists on: a handout addressed to somebody who
   * is not at this table would be a handout addressed to nobody, and finding
   * that out after the visibility flipped leaves the DM told it worked.
   */
  let targets: string[] = [];
  if (visibility === 'selected') {
    const members = await db
      .select({ userId: campaignMembers.userId })
      .from(campaignMembers)
      .where(eq(campaignMembers.campaignId, row.campaignId));
    const atTable = new Set(members.map(m => m.userId));
    const campaign = await db.query.campaigns.findFirst({
      columns: { gmId: true },
      where: eq(campaigns.id, row.campaignId),
    });
    if (campaign?.gmId) atTable.add(campaign.gmId);
    targets = [...new Set(targetUserIds)].filter(id => atTable.has(id));
    if (targets.length === 0) throw new Error('NOBODY_TO_SHOW');
  }

  await db
    .update(campaignHandouts)
    .set({ visibility })
    .where(eq(campaignHandouts.id, handoutId));

  // Rewritten wholesale rather than diffed: the target list is small, and
  // "who can see this now" is one answer, not a set of edits to it.
  await db
    .delete(campaignHandoutTargets)
    .where(eq(campaignHandoutTargets.handoutId, handoutId));
  if (targets.length > 0) {
    await db
      .insert(campaignHandoutTargets)
      .values(targets.map(id => ({ handoutId, userId: id })));
  }

  bumpVersion(row.campaignId);

  /*
   * Only the crossing announces, and only to the people it crossed to. A
   * handout is created behind the screen and lives there until the DM pushes
   * it, so the moment worth telling the table about is the push — not the
   * making, and not the taking back.
   */
  if (visibility === 'dm') return;
  publish(
    row.campaignId,
    {
      kind: 'handout',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      title: row.title,
      handoutKind: row.kind,
    },
    visibility === 'selected' ? { users: targets } : 'everyone'
  );
}

export async function deleteHandout(handoutId: string): Promise<string | null> {
  const row = await handoutRow(handoutId);
  await staff(row.campaignId);
  await db.delete(campaignHandouts).where(eq(campaignHandouts.id, handoutId));
  bumpVersion(row.campaignId);
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
    const { role, userId } = await requireCampaignRole(row.campaignId, [
      'gm',
      'co-gm',
      'player',
    ]);
    const isStaff = role === 'gm' || role === 'co-gm';
    if (isStaff) return { ok: true, row };
    if (row.visibility === 'shared') return { ok: true, row };
    // The file route authorises separately from the live view on purpose: a
    // player who guesses another handout's id must be refused the bytes, not
    // merely left without a link to them.
    if (row.visibility === 'selected') {
      const addressed = await db.query.campaignHandoutTargets.findFirst({
        where: and(
          eq(campaignHandoutTargets.handoutId, handoutId),
          eq(campaignHandoutTargets.userId, userId)
        ),
      });
      if (addressed) return { ok: true, row };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
