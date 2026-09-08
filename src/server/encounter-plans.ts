import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  parseContentData,
  refKey,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import type { CharacterSheet } from '@/@creator/character/schema';
import { db } from '@/db';
import {
  campaignMembers,
  campaignSessions,
  characters,
  encounterPlanLines,
  encounterPlans,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { resolveContentRefs } from './content';
import {
  addCreaturesToEncounter,
  createEncounter,
  MAX_CREATURE_COPIES,
} from './session';

export interface PlanLineRow {
  id: string;
  ref: ContentRef;
  /** The stored name — what shows when the monster no longer resolves. */
  name: string;
  count: number;
  sortOrder: number;
  /**
   * Resolved at read time, never stored. Null when the content is gone: a
   * homebrew monster its author deleted, or one removed from the library.
   */
  challengeRating: number | null;
  experiencePoints: number | null;
  armorClass: number | null;
  hitPoints: number | null;
}

/**
 * What the arithmetic can honestly say about a planned fight.
 *
 * Every number here is a sum or a maximum over data the app is holding. There
 * is deliberately no "deadly / hard / medium" verdict: the encounter XP budget
 * table is not in the SRD, so a difficulty rating would mean shipping numbers
 * this project cannot cite. A DM reads the totals against their own table.
 */
export interface PlanMaths {
  /** Sum of each monster's XP times how many of it there are. */
  totalExperience: number;
  /** That total split across the players — the figure an XP award starts from. */
  experiencePerCharacter: number;
  /** How many monsters walk in, counting copies. */
  bodyCount: number;
  /** The single biggest thing in the room. */
  highestChallengeRating: number | null;
  /** Players with a character linked to this table. */
  partySize: number;
  /** Their average level, or null when nobody has linked a sheet yet. */
  partyAverageLevel: number | null;
  /** True when a line no longer resolves, so the totals are known to be short. */
  incomplete: boolean;
}

export interface PlanRow {
  id: string;
  name: string;
  notes: string;
  sessionId: string | null;
  lines: PlanLineRow[];
  maths: PlanMaths;
  createdAt: string;
  updatedAt: string;
}

/** A plan is prep, so the whole module is staff-only. */
async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

async function staffForPlan(planId: string) {
  const plan = await db.query.encounterPlans.findFirst({
    where: eq(encounterPlans.id, planId),
  });
  if (!plan) throw new Error('NOT_FOUND');
  await staff(plan.campaignId);
  return plan;
}

/** The party's own numbers, which is half of what makes a total mean anything. */
async function partyFacts(
  campaignId: string
): Promise<{ size: number; averageLevel: number | null }> {
  const rows = await db
    .select({ sheet: characters.sheet })
    .from(campaignMembers)
    .leftJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  const levels = rows
    .map(r => (r.sheet as CharacterSheet | null)?.identity?.level)
    .filter((l): l is number => typeof l === 'number' && l > 0);

  return {
    // The party is the players, not the players who have linked a sheet: a
    // fight is split five ways whether or not the fifth has finished their
    // character.
    size: Math.max(1, rows.length),
    averageLevel: levels.length
      ? Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) /
        10
      : null,
  };
}

function toRef(line: typeof encounterPlanLines.$inferSelect): ContentRef {
  return {
    source: line.contentSource,
    type: 'creature',
    key: line.contentKey,
  };
}

/**
 * Every plan at a table, with its monsters resolved and its sums done.
 *
 * Stats are resolved here rather than stored on the line, so a DM who
 * corrects a homebrew monster's hit points sees every plan containing it
 * update — the whole reason the content model forbids copying stats.
 */
export async function listPlans(campaignId: string): Promise<PlanRow[]> {
  await staff(campaignId);

  const plans = await db
    .select()
    .from(encounterPlans)
    .where(eq(encounterPlans.campaignId, campaignId))
    .orderBy(asc(encounterPlans.createdAt));
  if (plans.length === 0) return [];

  const lines = await db
    .select()
    .from(encounterPlanLines)
    .where(
      inArray(
        encounterPlanLines.planId,
        plans.map(p => p.id)
      )
    )
    .orderBy(asc(encounterPlanLines.sortOrder));

  const resolved = await resolveContentRefs(lines.map(toRef));
  const party = await partyFacts(campaignId);

  return plans.map(plan => {
    const mine = lines.filter(l => l.planId === plan.id);

    const rows: PlanLineRow[] = mine.map(line => {
      const entry = resolved.get(refKey(toRef(line)));
      const d = entry
        ? (parseContentData('creature', entry.data) as CreatureData)
        : null;
      return {
        id: line.id,
        ref: toRef(line),
        // The live name when it resolves; the stored one only as a fallback,
        // so a renamed monster is not stale in every plan holding it.
        name: entry?.name || line.name,
        count: line.count,
        sortOrder: line.sortOrder,
        challengeRating: d ? d.challenge_rating : null,
        experiencePoints: d ? d.experience_points : null,
        armorClass: d ? d.armor_class : null,
        hitPoints: d ? d.hit_points : null,
      };
    });

    const totalExperience = rows.reduce(
      (sum, r) => sum + (r.experiencePoints ?? 0) * r.count,
      0
    );
    const challenges = rows
      .map(r => r.challengeRating)
      .filter((c): c is number => c !== null);

    return {
      id: plan.id,
      name: plan.name,
      notes: plan.notes,
      sessionId: plan.sessionId,
      lines: rows,
      maths: {
        totalExperience,
        experiencePerCharacter: Math.floor(totalExperience / party.size),
        bodyCount: rows.reduce((sum, r) => sum + r.count, 0),
        highestChallengeRating: challenges.length
          ? Math.max(...challenges)
          : null,
        partySize: party.size,
        partyAverageLevel: party.averageLevel,
        incomplete: rows.some(r => r.experiencePoints === null),
      },
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  });
}

export interface PlanInput {
  name: string;
  notes?: string;
  sessionId?: string | null;
}

async function checkSession(
  campaignId: string,
  sessionId: string | null | undefined
): Promise<string | null> {
  if (!sessionId) return null;
  const row = await db.query.campaignSessions.findFirst({
    where: and(
      eq(campaignSessions.id, sessionId),
      eq(campaignSessions.campaignId, campaignId)
    ),
  });
  if (!row) throw new Error('NOT_FOUND');
  return row.id;
}

export async function createPlan(
  campaignId: string,
  input: PlanInput
): Promise<string> {
  const { userId } = await staff(campaignId);
  const [row] = await db
    .insert(encounterPlans)
    .values({
      campaignId,
      name: input.name.trim() || 'Encounter',
      notes: input.notes ?? '',
      sessionId: await checkSession(campaignId, input.sessionId),
      createdBy: userId,
    })
    .returning({ id: encounterPlans.id });
  return row.id;
}

export async function updatePlan(
  planId: string,
  patch: Partial<PlanInput>
): Promise<void> {
  const plan = await staffForPlan(planId);
  const set: Partial<typeof encounterPlans.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.name !== undefined) set.name = patch.name.trim() || 'Encounter';
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.sessionId !== undefined) {
    set.sessionId = await checkSession(plan.campaignId, patch.sessionId);
  }
  await db.update(encounterPlans).set(set).where(eq(encounterPlans.id, planId));
}

export async function deletePlan(planId: string): Promise<void> {
  await staffForPlan(planId);
  await db.delete(encounterPlans).where(eq(encounterPlans.id, planId));
}

/**
 * Put a monster on the list.
 *
 * The ref is resolved before the row is written, so a plan can never hold a
 * line that never meant anything — a monster deleted *later* is a different
 * case, and that one renders by its stored name.
 */
export async function addPlanLine(
  planId: string,
  ref: ContentRef,
  count: number
): Promise<void> {
  await staffForPlan(planId);
  if (ref.type !== 'creature') throw new Error('NOT_A_CREATURE');

  const resolved = await resolveContentRefs([ref]);
  const entry = resolved.get(refKey(ref));
  if (!entry) throw new Error('NO_SUCH_CREATURE');

  const existing = await db
    .select({ sortOrder: encounterPlanLines.sortOrder })
    .from(encounterPlanLines)
    .where(eq(encounterPlanLines.planId, planId));
  const next = existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;

  await db.insert(encounterPlanLines).values({
    planId,
    contentSource: ref.source,
    contentKey: ref.key,
    name: entry.name,
    count: Math.max(1, Math.min(MAX_CREATURE_COPIES, Math.trunc(count) || 1)),
    sortOrder: next,
  });
}

async function staffForLine(lineId: string) {
  const line = await db.query.encounterPlanLines.findFirst({
    where: eq(encounterPlanLines.id, lineId),
  });
  if (!line) throw new Error('NOT_FOUND');
  await staffForPlan(line.planId);
  return line;
}

export async function setPlanLineCount(
  lineId: string,
  count: number
): Promise<void> {
  await staffForLine(lineId);
  await db
    .update(encounterPlanLines)
    .set({
      count: Math.max(1, Math.min(MAX_CREATURE_COPIES, Math.trunc(count) || 1)),
    })
    .where(eq(encounterPlanLines.id, lineId));
}

export async function removePlanLine(lineId: string): Promise<void> {
  await staffForLine(lineId);
  await db.delete(encounterPlanLines).where(eq(encounterPlanLines.id, lineId));
}

/**
 * Deal the plan out as a live fight.
 *
 * The plan is left exactly as it was — that is the point of it being a
 * separate row. Running the same ambush twice deals two encounters, each with
 * its own hit points and its own separately rolled initiative, rather than
 * resurrecting the first one.
 *
 * A line whose monster no longer resolves is skipped rather than failing the
 * whole fight: the DM is at the table with four other people, and the goblins
 * should still walk in when the homebrew troll has gone missing. The count of
 * what was skipped comes back so the UI can say so.
 */
export async function runPlan(
  planId: string
): Promise<{ encounterId: string; skipped: number }> {
  const plan = await staffForPlan(planId);

  const lines = await db
    .select()
    .from(encounterPlanLines)
    .where(eq(encounterPlanLines.planId, planId))
    .orderBy(asc(encounterPlanLines.sortOrder));

  const encounterId = await createEncounter(plan.campaignId, plan.name);

  let skipped = 0;
  for (const line of lines) {
    try {
      await addCreaturesToEncounter(encounterId, toRef(line), line.count);
    } catch {
      skipped += 1;
    }
  }

  return { encounterId, skipped };
}
