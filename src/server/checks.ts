/**
 * The DM asking somebody for a roll.
 *
 * The rules that matter, all of them enforced here rather than in a control:
 *
 * 1. **The modifier is computed on the server**, from the sheet the target was
 *    sitting behind when they were asked. The client sends no bonus and no
 *    total — `session.ts` states the reason for every other roll in this app
 *    and it holds hardest here: _a number the browser produced is a claim
 *    about a roll, not a record of one._
 * 2. **A hidden DC never travels to the target.** Not in a field, not hidden
 *    in CSS. They are given their total; the DM is given the verdict. Anything
 *    less is a DC that is only hidden from people who do not open dev tools.
 * 3. **A request can be declined.** A DM can ask; they cannot compel a
 *    player's screen. The DM sees that it was declined, which is the honest
 *    version of the same information.
 * 4. **One roll, one log.** An answer is an ordinary `campaign_rolls` row.
 *    There is not a second dice log for checks.
 */
import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';

import {
  ABILITY_LABELS,
  SKILL_ABILITY,
  SKILL_LABELS,
  type AbilityKey,
  type CharacterSheet,
  type SkillKey,
} from '@/@creator/character/schema';
import { savingThrow, skillBonus } from '@/@creator/character/lib/derive';
import { rollDie } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignCheckTargets,
  campaignChecks,
  campaignMembers,
  campaignRolls,
  campaignSessions,
  characters,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { requireUserId } from './session-user';

export type CheckKind = 'check' | 'save' | 'free';
export type CheckStatus = 'open' | 'answered' | 'cancelled';
export type TargetStatus = 'waiting' | 'rolled' | 'dismissed';
export type RollMode = 'straight' | 'advantage' | 'disadvantage';

/** How much of the asking a table remembers on the live view. */
const CHECK_LIMIT = 25;

export interface CheckTargetRow {
  userId: string;
  name: string;
  characterId: string | null;
  characterName: string | null;
  status: TargetStatus;
  total: number | null;
  modifier: number | null;
  /** Null when the reader is not allowed to know — a hidden DC, for one. */
  outcome: 'pass' | 'fail' | null;
  answeredAt: string | null;
}

export interface CheckRow {
  id: string;
  kind: CheckKind;
  skill: SkillKey | null;
  ability: AbilityKey | null;
  prompt: string;
  /** "Dexterity (Stealth)", composed once so every surface reads the same. */
  ask: string;
  /** Null for a target when the DC is hidden. Staff always see it. */
  dc: number | null;
  dcHidden: boolean;
  status: CheckStatus;
  askedByName: string;
  createdAt: string;
  targets: CheckTargetRow[];
  /** The reader is asked and still owes a roll. What the answer control uses. */
  mine: boolean;
}

/* --- how an ask reads -------------------------------------------------- */

/**
 * One line naming what is being asked for.
 *
 * Composed on the server so the panel, the announcement and the roll's own
 * label in the shared log cannot drift into three different wordings of one
 * question.
 */
export function askLine(input: {
  kind: CheckKind;
  skill: string | null;
  ability: string | null;
  prompt: string;
}): string {
  const skill = input.skill as SkillKey | null;
  const ability = input.ability as AbilityKey | null;

  if (input.kind === 'save' && ability) {
    return `${ABILITY_LABELS[ability]} save`;
  }
  if (skill) {
    return `${ABILITY_LABELS[SKILL_ABILITY[skill]]} (${SKILL_LABELS[skill]})`;
  }
  if (ability) return `${ABILITY_LABELS[ability]} check`;
  return input.prompt.trim() || 'A roll';
}

/* --- reading ----------------------------------------------------------- */

function isStaffRole(role: string): boolean {
  return role === 'gm' || role === 'co-gm';
}

/**
 * The asking at this table, newest first. Any member may read.
 *
 * A player sees every ask made of anybody — a group check is a shared moment
 * and hiding the other four rolls would make it five private ones — but never
 * a DC that was hidden, and never the verdict that DC decides.
 */
export async function listChecks(campaignId: string): Promise<CheckRow[]> {
  const { role, userId } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = isStaffRole(role);

  const checks = await db
    .select()
    .from(campaignChecks)
    .where(eq(campaignChecks.campaignId, campaignId))
    .orderBy(desc(campaignChecks.createdAt))
    .limit(CHECK_LIMIT);
  if (checks.length === 0) return [];

  const ids = checks.map(c => c.id);
  const targets = await db
    .select({
      checkId: campaignCheckTargets.checkId,
      userId: campaignCheckTargets.userId,
      characterId: campaignCheckTargets.characterId,
      status: campaignCheckTargets.status,
      total: campaignCheckTargets.total,
      modifier: campaignCheckTargets.modifier,
      answeredAt: campaignCheckTargets.answeredAt,
      name: users.name,
      email: users.email,
      characterName: characters.name,
    })
    .from(campaignCheckTargets)
    .leftJoin(users, eq(users.id, campaignCheckTargets.userId))
    .leftJoin(characters, eq(characters.id, campaignCheckTargets.characterId))
    .where(inArray(campaignCheckTargets.checkId, ids));

  const askers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      inArray(
        users.id,
        checks.map(c => c.askedBy).filter((id): id is string => id !== null)
      )
    );
  const askerName = new Map(askers.map(a => [a.id, a.name ?? 'The DM']));

  return checks.map(check => {
    const hidden = check.dcVisibility === 'hidden';
    // The single decision this whole feature turns on. `visibleDc` is the only
    // path a DC takes to a browser, so a hidden one cannot reach a player by
    // some other field being added later.
    const visibleDc = isStaff || !hidden ? check.dc : null;

    const mineRows = targets.filter(t => t.checkId === check.id);
    return {
      id: check.id,
      kind: check.kind,
      skill: (check.skill as SkillKey | null) ?? null,
      ability: (check.ability as AbilityKey | null) ?? null,
      prompt: check.prompt,
      ask: askLine(check),
      dc: visibleDc,
      dcHidden: hidden,
      status: check.status,
      askedByName: check.askedBy
        ? (askerName.get(check.askedBy) ?? 'The DM')
        : 'The DM',
      createdAt: check.createdAt,
      targets: mineRows.map(t => ({
        userId: t.userId,
        name: t.name?.trim() || t.email?.split('@')[0] || 'Somebody',
        characterId: t.characterId,
        characterName: t.characterName,
        status: t.status,
        total: t.total,
        modifier: t.modifier,
        // Derived, never stored: a stored verdict is a second copy of a fact
        // the total and the DC already settle between them.
        outcome:
          visibleDc === null || t.total === null
            ? null
            : t.total >= visibleDc
              ? ('pass' as const)
              : ('fail' as const),
        answeredAt: t.answeredAt,
      })),
      mine:
        check.status === 'open' &&
        mineRows.some(t => t.userId === userId && t.status === 'waiting'),
    };
  });
}

/* --- asking ------------------------------------------------------------ */

export interface CheckInput {
  kind: CheckKind;
  skill?: string | null;
  ability?: string | null;
  prompt?: string;
  dc?: number | null;
  dcVisibility?: 'hidden' | 'shown';
  /** Who is asked. Empty means everybody at the table. */
  targetUserIds?: string[];
}

/**
 * Ask for a roll. Staff only.
 *
 * An empty target list means the whole party, because "everybody roll
 * initiative" is the commonest ask at any table and making the DM tick five
 * boxes for it would be the reason they go back to saying it out loud.
 */
export async function requestCheck(
  campaignId: string,
  input: CheckInput
): Promise<string> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const members = await db
    .select({
      userId: campaignMembers.userId,
      characterId: campaignMembers.characterId,
    })
    .from(campaignMembers)
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  const wanted = new Set(input.targetUserIds ?? []);
  const chosen =
    wanted.size === 0 ? members : members.filter(m => wanted.has(m.userId));
  // An ask nobody receives is never what the DM pressed the button for — the
  // same refusal `revealExcerpt` makes for a 'selected' reveal with no targets.
  if (chosen.length === 0) throw new Error('NOBODY_TO_ASK');

  const sitting = await db.query.campaignSessions.findFirst({
    columns: { id: true },
    where: and(
      eq(campaignSessions.campaignId, campaignId),
      eq(campaignSessions.status, 'live')
    ),
  });

  const dc =
    input.dc === null || input.dc === undefined
      ? null
      : Math.max(1, Math.min(40, Math.trunc(input.dc)));

  const [row] = await db
    .insert(campaignChecks)
    .values({
      campaignId,
      kind: input.kind,
      skill: input.skill ?? null,
      ability: input.ability ?? null,
      prompt: (input.prompt ?? '').trim().slice(0, 200),
      dc,
      // A hidden DC with no DC is a contradiction that would render as a
      // permanently unanswerable verdict, so it is normalised away here.
      dcVisibility: dc === null ? 'shown' : (input.dcVisibility ?? 'shown'),
      status: 'open',
      askedBy: userId,
      sessionId: sitting?.id ?? null,
    })
    .returning({ id: campaignChecks.id });

  await db.insert(campaignCheckTargets).values(
    chosen.map(m => ({
      checkId: row.id,
      userId: m.userId,
      characterId: m.characterId,
    }))
  );

  const names = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      inArray(
        users.id,
        chosen.map(m => m.userId)
      )
    );

  bumpVersion(campaignId);
  publish(
    campaignId,
    {
      kind: 'check',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      checkId: row.id,
      ask: askLine({
        kind: input.kind,
        skill: input.skill ?? null,
        ability: input.ability ?? null,
        prompt: input.prompt ?? '',
      }),
      state: 'asked',
      targetNames: names.map(
        n => n.name?.trim() || n.email?.split('@')[0] || 'Somebody'
      ),
      // Announced only where it is shown. The panel filters too, but an event
      // is a broadcast and must be safe on its own — the payload rule from
      // `live-hub.ts` applied to the one field it exists for.
      dc: input.dcVisibility === 'hidden' ? null : dc,
      actorName: null,
      total: null,
      outcome: null,
    },
    { users: chosen.map(m => m.userId) }
  );

  return row.id;
}

/* --- answering --------------------------------------------------------- */

async function checkAndTarget(checkId: string, userId: string) {
  const check = await db.query.campaignChecks.findFirst({
    where: eq(campaignChecks.id, checkId),
  });
  if (!check) throw new Error('NOT_FOUND');
  await requireCampaignRole(check.campaignId, ['gm', 'co-gm', 'player']);
  const target = await db.query.campaignCheckTargets.findFirst({
    where: and(
      eq(campaignCheckTargets.checkId, checkId),
      eq(campaignCheckTargets.userId, userId)
    ),
  });
  return { check, target };
}

/**
 * The modifier this ask is worth on this sheet.
 *
 * Null when there is no sheet to read — an unseated player, or a free ask that
 * names no skill. The roll then goes out as a flat d20 and says so, which is
 * honest; inventing a plausible bonus would be the worst of both.
 */
function bonusFor(
  sheet: CharacterSheet | null,
  check: { kind: string; skill: string | null; ability: string | null }
): number | null {
  if (!sheet) return null;
  if (check.kind === 'save' && check.ability) {
    return savingThrow(sheet, check.ability as AbilityKey);
  }
  if (check.skill) return skillBonus(sheet, check.skill as SkillKey);
  if (check.ability) return savingThrow(sheet, check.ability as AbilityKey);
  return null;
}

/**
 * Answer an ask. Rolled here, on the server, with the modifier read off the
 * sheet — see rule 1 in the file header.
 */
export async function answerCheck(
  checkId: string,
  mode: RollMode = 'straight'
): Promise<void> {
  const userId = await requireUserId();
  const { check, target } = await checkAndTarget(checkId, userId);
  if (!target) throw new Error('NOT_ASKED');
  if (check.status !== 'open') throw new Error('CHECK_CLOSED');
  if (target.status !== 'waiting') throw new Error('ALREADY_ANSWERED');

  const character = target.characterId
    ? await db.query.characters.findFirst({
        where: eq(characters.id, target.characterId),
      })
    : null;

  const bonus = bonusFor(
    (character?.sheet as CharacterSheet | undefined) ?? null,
    check
  );
  const modifier = bonus ?? 0;

  const dice = mode === 'straight' ? [rollDie(20)] : [rollDie(20), rollDie(20)];
  const face =
    mode === 'advantage'
      ? Math.max(...dice)
      : mode === 'disadvantage'
        ? Math.min(...dice)
        : dice[0];
  const total = face + modifier;

  const ask = askLine(check);
  const person = await db.query.users.findFirst({
    columns: { name: true, email: true },
    where: eq(users.id, userId),
  });
  const actorName =
    character?.name?.trim() ||
    person?.name?.trim() ||
    person?.email?.split('@')[0] ||
    'A player';

  const [roll] = await db
    .insert(campaignRolls)
    .values({
      campaignId: check.campaignId,
      actorUserId: userId,
      characterId: target.characterId,
      actorName,
      label: ask,
      notation: `${mode === 'straight' ? '1d20' : '2d20'}${
        modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`
      }`,
      dice,
      // The die that did not count is marked dropped rather than dropped from
      // the record, so a reader sees the advantage instead of being told it.
      dropped:
        dice.length === 2 ? [dice[0] === face ? 1 : 0] : ([] as number[]),
      modifier,
      total,
      // Always 'table'. A player cannot hide a roll from their DM, and a DM
      // hiding the answer to their own question from the table would be
      // hiding it from the person who rolled it.
      visibility: 'table',
    })
    .returning({ id: campaignRolls.id });

  await db
    .update(campaignCheckTargets)
    .set({
      status: 'rolled',
      rollId: roll.id,
      total,
      modifier,
      answeredAt: new Date().toISOString(),
    })
    .where(eq(campaignCheckTargets.id, target.id));

  await closeIfSettled(check.id);

  bumpVersion(check.campaignId);
  publish(check.campaignId, {
    kind: 'check',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    checkId: check.id,
    ask,
    state: 'answered',
    targetNames: [],
    // Broadcast to the table, so the DC only travels where it was shown —
    // otherwise the announcement would be the leak the panel is careful about.
    dc: check.dcVisibility === 'hidden' ? null : check.dc,
    actorName,
    total,
    outcome:
      check.dc === null || check.dcVisibility === 'hidden'
        ? null
        : total >= check.dc
          ? 'pass'
          : 'fail',
  });
}

/**
 * Decline. The DM is told, which is the honest version of the same fact.
 *
 * A request that cannot be refused is a demand, and a table where the DM can
 * compel a player's screen is a different social object than one where they
 * can ask — model decision 8, and the open question the README raised.
 */
export async function dismissCheck(checkId: string): Promise<void> {
  const userId = await requireUserId();
  const { check, target } = await checkAndTarget(checkId, userId);
  if (!target) throw new Error('NOT_ASKED');
  if (target.status !== 'waiting') throw new Error('ALREADY_ANSWERED');

  await db
    .update(campaignCheckTargets)
    .set({ status: 'dismissed', answeredAt: new Date().toISOString() })
    .where(eq(campaignCheckTargets.id, target.id));

  await closeIfSettled(check.id);
  bumpVersion(check.campaignId);
}

/** Withdraw the whole ask. Staff only. */
export async function cancelCheck(checkId: string): Promise<void> {
  const check = await db.query.campaignChecks.findFirst({
    where: eq(campaignChecks.id, checkId),
  });
  if (!check) throw new Error('NOT_FOUND');
  await requireCampaignRole(check.campaignId, ['gm', 'co-gm']);
  if (check.status !== 'open') return;

  await db
    .update(campaignChecks)
    .set({ status: 'cancelled', resolvedAt: new Date().toISOString() })
    .where(eq(campaignChecks.id, checkId));

  bumpVersion(check.campaignId);
  publish(check.campaignId, {
    kind: 'check',
    id: randomUUID(),
    at: new Date().toISOString(),
    checkId,
    ask: askLine(check),
    state: 'cancelled',
    targetNames: [],
    dc: null,
    actorName: null,
    total: null,
    outcome: null,
  });
}

/**
 * Close an ask once nobody still owes it an answer.
 *
 * Rolled *and* dismissed both count as settled: the question has been put to
 * everybody and everybody has responded, even if one of the responses was no.
 */
async function closeIfSettled(checkId: string): Promise<void> {
  const rows = await db
    .select({ status: campaignCheckTargets.status })
    .from(campaignCheckTargets)
    .where(eq(campaignCheckTargets.checkId, checkId));
  if (rows.some(r => r.status === 'waiting')) return;
  await db
    .update(campaignChecks)
    .set({ status: 'answered', resolvedAt: new Date().toISOString() })
    .where(eq(campaignChecks.id, checkId));
}
