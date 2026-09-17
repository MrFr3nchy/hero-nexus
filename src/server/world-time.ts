import 'server-only';

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  advance,
  daysCrossed,
  describeMinutes,
  moment,
  normalizeWorldTime,
  startOfTime,
  type CalendarDef,
  type WorldTime,
} from '@/@creator/campaign/lib/calendar';
import { abilityModifier } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import { db } from '@/db';
import {
  campaignMembers,
  campaigns,
  characterHistory,
  characters,
} from '@/db/schema';
import { mergeCampaignSettings, requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';

/**
 * The world's clock (improvements 10).
 *
 * The one writer of `campaigns.world_time`. Everything that moves the clock —
 * the DM's hand, a rest, a sitting opening — comes through `advanceTimeAs`,
 * which publishes the `time` event and runs the **day tick** for every whole
 * day the move crossed. The tick is where survival lives: under the table's
 * `survival` rules a day without food, water or sleep costs what the book
 * says it costs, on the sheet, with a history line — and nothing at all when
 * those rules are off, which is the default.
 */

export interface WorldClock {
  calendar: CalendarDef;
  /** Null: the table has not started counting. */
  time: WorldTime | null;
}

/** How the clock reads. No role check: the callers have already sat down. */
export async function readWorldClock(campaignId: string): Promise<WorldClock> {
  const row = await db.query.campaigns.findFirst({
    columns: { settings: true, worldTime: true },
    where: eq(campaigns.id, campaignId),
  });
  const calendar = mergeCampaignSettings(row?.settings).calendar;
  return { calendar, time: normalizeWorldTime(calendar, row?.worldTime) };
}

/** Read for a member, from an action. */
export async function getWorldClock(campaignId: string): Promise<WorldClock> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);
  return readWorldClock(campaignId);
}

async function writeTime(campaignId: string, time: WorldTime): Promise<void> {
  await db
    .update(campaigns)
    .set({ worldTime: time, updatedAt: new Date().toISOString() })
    .where(eq(campaigns.id, campaignId));
}

/**
 * Set the clock outright. Staff only. Setting is not advancing: no day tick
 * runs, because a DM correcting "it is actually the 5th" did not march the
 * party three days without food.
 */
export async function setWorldTime(
  campaignId: string,
  raw: unknown
): Promise<WorldClock> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const { calendar } = await readWorldClock(campaignId);
  const time = normalizeWorldTime(calendar, raw) ?? startOfTime(calendar);
  await writeTime(campaignId, time);
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'time',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    label: moment(calendar, time),
    why: 'The DM sets the clock',
    minutes: 0,
    notes: [],
  });
  return { calendar, time };
}

/** Start counting, at dawn on the first day of year one, if not already. */
export async function startWorldClock(campaignId: string): Promise<WorldClock> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const clock = await readWorldClock(campaignId);
  if (clock.time) return clock;
  return setWorldTime(campaignId, startOfTime(clock.calendar));
}

/** Stop counting. Staff only. The calendar stays; the moment is forgotten. */
export async function stopWorldClock(campaignId: string): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await db
    .update(campaigns)
    .set({ worldTime: null, updatedAt: new Date().toISOString() })
    .where(eq(campaigns.id, campaignId));
  bumpVersion(campaignId);
}

/** The DM's clock control: staff only, then the same road as everything else. */
export async function advanceTime(
  campaignId: string,
  minutes: number,
  why: string
): Promise<WorldClock> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  return advanceTimeAs(campaignId, userId, minutes, why);
}

/**
 * Move the clock, for server code that has already decided who may — a
 * rest confirming, a sitting opening. Does nothing on a table that is not
 * counting: time passing at a table with no calendar is not an error, it is
 * just not written down.
 */
export async function advanceTimeAs(
  campaignId: string,
  userId: string | null,
  minutes: number,
  why: string
): Promise<WorldClock> {
  const clock = await readWorldClock(campaignId);
  if (!clock.time) return clock;
  const delta = Math.trunc(minutes);
  if (!Number.isFinite(delta) || delta === 0) return clock;

  const next = advance(clock.calendar, clock.time, delta);
  await writeTime(campaignId, next);

  const notes =
    delta > 0
      ? await dayTick(
          campaignId,
          userId,
          daysCrossed(clock.calendar, clock.time, next),
          delta
        )
      : [];

  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'time',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    label: moment(clock.calendar, next),
    why: `${why} · ${describeMinutes(delta, clock.calendar)}`,
    minutes: delta,
    notes,
  });
  return { calendar: clock.calendar, time: next };
}

/* --- the day tick --------------------------------------------------------- */

const EMPTY_SURVIVAL = {
  daysWithoutFood: 0,
  daysWithoutWater: 0,
  hoursAwake: 0,
};
const RATION = /\bration/i;
const WATER = /\bwater(skin)?\b/i;

/**
 * What one hero's sheet says after so many days on the road and so many
 * hours awake. Pure over the sheet, so it can be asserted apart from the db.
 *
 * Food: a carried ration is eaten, one a day, automatically; without one the
 * hungry days count, and past `max(1, CON mod + 1)` of them each further day
 * is a level of exhaustion (2024 PHB, Malnutrition). Water: a waterskin is a
 * day's water and is not used up — it refills at the next stream; without
 * one every dry day is a level. Sleep: every 24 hours awake is a level, and
 * only a long rest resets the count.
 */
export function tickSheet(
  sheet: CharacterSheet,
  rules: { food: boolean; water: boolean; sleep: boolean },
  days: number,
  minutes: number
): { sheet: CharacterSheet; notes: string[] } {
  if (!rules.food && !rules.water && !rules.sleep) return { sheet, notes: [] };
  if (days <= 0 && (!rules.sleep || minutes <= 0)) return { sheet, notes: [] };
  const notes: string[] = [];
  // Stored sheets predate the field; the row is read raw, not parsed.
  const survival = { ...EMPTY_SURVIVAL, ...(sheet.survival ?? {}) };
  const combat = { ...sheet.combat };
  let inventory = sheet.inventory;
  let exhausted = 0;

  if (rules.food && days > 0) {
    const allowance = Math.max(
      1,
      abilityModifier(sheet.abilities?.constitution?.score ?? 10) + 1
    );
    for (let d = 0; d < days; d++) {
      const idx = inventory.findIndex(
        i => RATION.test(i.name) && i.quantity > 0
      );
      if (idx >= 0) {
        inventory = inventory.map((i, n) =>
          n === idx ? { ...i, quantity: i.quantity - 1 } : i
        );
        survival.daysWithoutFood = 0;
        continue;
      }
      survival.daysWithoutFood += 1;
      if (survival.daysWithoutFood > allowance) exhausted += 1;
    }
    if (survival.daysWithoutFood > 0) {
      notes.push(
        `${sheet.identity.name} has gone ${survival.daysWithoutFood} day${
          survival.daysWithoutFood === 1 ? '' : 's'
        } without food`
      );
    }
  }

  if (rules.water && days > 0) {
    const carried = inventory.some(i => WATER.test(i.name) && i.quantity > 0);
    if (carried) {
      survival.daysWithoutWater = 0;
    } else {
      survival.daysWithoutWater += days;
      exhausted += days;
      notes.push(
        `${sheet.identity.name} has gone ${survival.daysWithoutWater} day${
          survival.daysWithoutWater === 1 ? '' : 's'
        } without water`
      );
    }
  }

  if (rules.sleep && minutes > 0) {
    const before = survival.hoursAwake;
    const after = Math.round((before * 60 + minutes) / 60);
    survival.hoursAwake = Math.min(9999, after);
    const crossed = Math.floor(after / 24) - Math.floor(before / 24);
    if (crossed > 0) {
      exhausted += crossed;
      notes.push(`${sheet.identity.name} has not slept in ${after} hours`);
    }
  }

  if (exhausted > 0) {
    combat.exhaustion = Math.min(6, (combat.exhaustion ?? 0) + exhausted);
    notes.push(
      `${sheet.identity.name} · exhaustion ${combat.exhaustion}${
        combat.exhaustion >= 6 ? ' — dead' : ''
      }`
    );
  }

  return { sheet: { ...sheet, survival, combat, inventory }, notes };
}

/**
 * Run the road over every seated hero. Returns the lines the `time` event
 * carries. Nothing happens, and nothing is written, with every survival
 * rule off — the ordinary case.
 */
async function dayTick(
  campaignId: string,
  userId: string | null,
  days: number,
  minutes: number
): Promise<string[]> {
  const row = await db.query.campaigns.findFirst({
    columns: { settings: true },
    where: eq(campaigns.id, campaignId),
  });
  const rules = mergeCampaignSettings(row?.settings).table.survival;
  if (!rules.food && !rules.water && !rules.sleep) return [];
  if (days === 0 && !rules.sleep) return [];

  const rows = await db
    .select({ character: characters })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  const now = new Date().toISOString();
  const notes: string[] = [];
  for (const { character } of rows) {
    const sheet = character.sheet as CharacterSheet;
    const ticked = tickSheet(sheet, rules, days, minutes);
    if (ticked.sheet === sheet) continue;
    notes.push(...ticked.notes);
    await db
      .update(characters)
      .set({ sheet: ticked.sheet, updatedAt: now })
      .where(eq(characters.id, character.id));
    if (ticked.sheet.combat.exhaustion !== sheet.combat.exhaustion) {
      await db.insert(characterHistory).values({
        characterId: character.id,
        actorUserId: userId,
        kind: 'other',
        field: 'combat.exhaustion',
        fromValue: String(sheet.combat.exhaustion),
        toValue: String(ticked.sheet.combat.exhaustion),
        detail: ticked.notes.join(' · '),
        occurredAt: now,
      });
    }
  }
  return notes;
}

/**
 * The DM says the party ate, or drank — at an inn, from a spring, off a
 * hunt — and the count starts again. Staff only.
 */
export async function markProvisioned(
  campaignId: string,
  characterId: string,
  what: { food?: boolean; water?: boolean; slept?: boolean }
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const member = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId)
    ),
  });
  if (!member) throw new Error('NOT_FOUND');
  const row = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!row) throw new Error('NOT_FOUND');
  const sheet = row.sheet as CharacterSheet;
  const survival = { ...EMPTY_SURVIVAL, ...(sheet.survival ?? {}) };
  if (what.food) survival.daysWithoutFood = 0;
  if (what.water) survival.daysWithoutWater = 0;
  if (what.slept) survival.hoursAwake = 0;
  await db
    .update(characters)
    .set({ sheet: { ...sheet, survival }, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));
  bumpVersion(campaignId);
}

/** A long rest: slept. Called by the rest flow, which has already checked. */
export async function resetSleep(characterIds: string[]): Promise<void> {
  for (const id of characterIds) {
    const row = await db.query.characters.findFirst({
      where: eq(characters.id, id),
    });
    if (!row) continue;
    const sheet = row.sheet as CharacterSheet;
    if (!sheet.survival?.hoursAwake) continue;
    await db
      .update(characters)
      .set({
        sheet: {
          ...sheet,
          survival: { ...EMPTY_SURVIVAL, ...sheet.survival, hoursAwake: 0 },
        },
        updatedAt: new Date().toISOString(),
      })
      .where(eq(characters.id, id));
  }
}
