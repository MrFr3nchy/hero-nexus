import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import {
  characterSheetSchema,
  type CharacterSheet,
} from '@/@creator/character/schema';
import { db } from '@/db';
import {
  campaignMembers,
  campaignSessionAttendance,
  campaignSessions,
  characters,
  sessionAwardGrants,
  sessionAwards,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { writeSheetAsStaff } from './characters';

export type AwardKind = 'xp' | 'milestone';

/** The cap the sheet itself enforces; repeated here to explain the clamp. */
const MAX_LEVEL = 20;

export interface AwardGrantRow {
  characterId: string | null;
  characterName: string;
  xp: number;
  levels: number;
}

export interface AwardRow {
  id: string;
  sessionId: string | null;
  sessionNumber: number | null;
  kind: AwardKind;
  xp: number;
  levels: number;
  note: string;
  createdAt: string;
  grants: AwardGrantRow[];
}

async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

/**
 * Every award this table has handed out, newest first.
 *
 * Readable by the whole table, not just staff. Experience is not a secret —
 * a player checking whether they were given session 9's XP should not have to
 * ask the person who would have to look it up anyway.
 */
export async function listAwards(campaignId: string): Promise<AwardRow[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);

  const rows = await db
    .select()
    .from(sessionAwards)
    .where(eq(sessionAwards.campaignId, campaignId))
    .orderBy(desc(sessionAwards.createdAt));
  if (rows.length === 0) return [];

  const [grants, sessions] = await Promise.all([
    db
      .select()
      .from(sessionAwardGrants)
      .where(
        inArray(
          sessionAwardGrants.awardId,
          rows.map(r => r.id)
        )
      ),
    db
      .select({ id: campaignSessions.id, number: campaignSessions.number })
      .from(campaignSessions)
      .where(eq(campaignSessions.campaignId, campaignId)),
  ]);

  const numberById = new Map(sessions.map(s => [s.id, s.number]));

  return rows.map(row => ({
    id: row.id,
    sessionId: row.sessionId,
    sessionNumber: row.sessionId
      ? (numberById.get(row.sessionId) ?? null)
      : null,
    kind: row.kind,
    xp: row.xp,
    levels: row.levels,
    note: row.note,
    createdAt: row.createdAt,
    grants: grants
      .filter(g => g.awardId === row.id)
      .map(g => ({
        characterId: g.characterId,
        characterName: g.characterName,
        xp: g.xp,
        levels: g.levels,
      })),
  }));
}

/**
 * Who is standing to receive an award by default: the characters of the people
 * the register says were at that sitting.
 *
 * Late counts, absent does not. A DM who disagrees names the recipients
 * explicitly — this is a starting point, not a rule, because handing the XP to
 * someone who missed the night is a normal decision at a real table.
 */
export async function defaultRecipients(
  campaignId: string,
  sessionId: string | null
): Promise<{ characterId: string; name: string }[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);

  const linked = await db
    .select({
      userId: campaignMembers.userId,
      characterId: characters.id,
      name: characters.name,
    })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  const strip = (rows: typeof linked) =>
    rows.map(r => ({ characterId: r.characterId, name: r.name }));

  if (!sessionId) return strip(linked);

  const register = await db
    .select()
    .from(campaignSessionAttendance)
    .where(eq(campaignSessionAttendance.sessionId, sessionId));
  if (register.length === 0) return strip(linked);

  // Matched by **user**, not by character. Attendance is keyed on the person —
  // `character_id` on those rows is whatever they had linked at the time, and
  // is null for anyone who answered before finishing a sheet. Matching on it
  // meant a register full of nulls matched nobody, the "nobody matched"
  // fallback fired, and a player explicitly marked absent was handed the
  // experience anyway.
  const absent = new Set(
    register.filter(r => r.status === 'absent').map(r => r.userId)
  );
  return strip(linked.filter(l => !absent.has(l.userId)));
}

export interface AwardInput {
  sessionId?: string | null;
  kind: AwardKind;
  /** Experience each recipient receives. Ignored for a milestone. */
  xp?: number;
  /** Levels each recipient gains. Ignored for an experience award. */
  levels?: number;
  note?: string;
  /** Who receives it. Defaults to whoever the register says was there. */
  characterIds?: string[];
}

function applyToSheet(
  sheet: CharacterSheet,
  xp: number,
  levels: number
): CharacterSheet {
  return {
    ...sheet,
    identity: {
      ...sheet.identity,
      xp: Math.max(0, sheet.identity.xp + xp),
      level: Math.max(1, Math.min(MAX_LEVEL, sheet.identity.level + levels)),
    },
  };
}

/**
 * Hand out experience, or a level.
 *
 * The sheets are the balance and this table is the receipt: every recipient's
 * sheet is written through the character write path, so the change lands in
 * `character_history` and shows on the player's own log in the DM's wording
 * (content model rule 7). Awarding without touching the sheets would leave two
 * places disagreeing about what level somebody is.
 *
 * A recipient whose sheet will not parse is skipped rather than failing the
 * whole award — four other players should not lose their experience because
 * one stored sheet is from before a field existed — and the grant row is not
 * written for them, so the record says who actually got it.
 */
export async function awardExperience(
  campaignId: string,
  input: AwardInput
): Promise<{ awardId: string; granted: number; skipped: number }> {
  const { userId } = await staff(campaignId);

  if (input.sessionId) {
    const session = await db.query.campaignSessions.findFirst({
      where: and(
        eq(campaignSessions.id, input.sessionId),
        eq(campaignSessions.campaignId, campaignId)
      ),
    });
    if (!session) throw new Error('NOT_FOUND');
  }

  const xp = input.kind === 'xp' ? Math.max(0, Math.trunc(input.xp ?? 0)) : 0;
  const levels =
    input.kind === 'milestone'
      ? Math.max(1, Math.min(MAX_LEVEL, Math.trunc(input.levels ?? 1)))
      : 0;
  if (xp === 0 && levels === 0) throw new Error('NOTHING_TO_AWARD');

  // Whoever was named, narrowed to characters actually at this table — a
  // character id from another campaign must not be levelled up from here.
  const atTable = await db
    .select({ characterId: characters.id, name: characters.name })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );

  const named = input.characterIds?.length
    ? atTable.filter(c => input.characterIds!.includes(c.characterId))
    : await defaultRecipients(campaignId, input.sessionId ?? null);
  if (named.length === 0) throw new Error('NO_RECIPIENTS');

  const [award] = await db
    .insert(sessionAwards)
    .values({
      campaignId,
      sessionId: input.sessionId ?? null,
      kind: input.kind,
      xp,
      levels,
      note: input.note ?? '',
      awardedBy: userId,
    })
    .returning({ id: sessionAwards.id });

  let granted = 0;
  let skipped = 0;

  for (const recipient of named) {
    const row = await db.query.characters.findFirst({
      where: eq(characters.id, recipient.characterId),
    });
    if (!row) {
      skipped += 1;
      continue;
    }
    const parsed = characterSheetSchema.safeParse(row.sheet);
    if (!parsed.success) {
      skipped += 1;
      continue;
    }

    try {
      await writeSheetAsStaff(
        recipient.characterId,
        userId,
        applyToSheet(parsed.data, xp, levels)
      );
    } catch {
      // A sheet the table's own rules would now reject cannot be written, and
      // that is a real answer: the DM sees it as one recipient short.
      skipped += 1;
      continue;
    }

    await db.insert(sessionAwardGrants).values({
      awardId: award.id,
      characterId: recipient.characterId,
      characterName: recipient.name,
      xp,
      levels,
    });
    granted += 1;
  }

  // An award nobody could receive is not a record of anything.
  if (granted === 0) {
    await db.delete(sessionAwards).where(eq(sessionAwards.id, award.id));
    throw new Error('NO_RECIPIENTS');
  }

  return { awardId: award.id, granted, skipped };
}

/**
 * Strike an award from the record.
 *
 * Deliberately does **not** take the experience back off the sheets. The
 * sheets are the balance; unwinding one would mean guessing what else has
 * happened to a character since, and a player who levelled up on Tuesday
 * should not be silently demoted on Thursday. Removing the receipt and telling
 * the DM to correct the sheet is the honest half of the job.
 */
export async function deleteAward(awardId: string): Promise<void> {
  const award = await db.query.sessionAwards.findFirst({
    where: eq(sessionAwards.id, awardId),
  });
  if (!award) throw new Error('NOT_FOUND');
  await staff(award.campaignId);
  await db.delete(sessionAwards).where(eq(sessionAwards.id, awardId));
}
