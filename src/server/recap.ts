import 'server-only';

import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignHandouts,
  campaignMembers,
  campaignSessionAttendance,
  campaignSessions,
  characterHistory,
  characters,
  downtimePeriods,
  initiativeEncounters,
  initiativeEntries,
  users,
} from '@/db/schema';
import { requireCampaignRole } from './campaigns';

/**
 * A recap the DM did not have to remember.
 *
 * Everything here is a fact the app already recorded: the fights that were
 * filed under the sitting, who was at it, what was handed across, and the
 * changes that landed on the party's sheets while it was going on. Nothing is
 * generated, inferred or phrased for effect — the point is a DM opening a
 * blank recap box at midnight and being given the evening's spine to edit,
 * not a machine-written account of a story it did not watch.
 *
 * The lines are deliberately plain and slightly under-written. A draft that
 * reads as finished prose is one a tired DM posts unedited, and then the
 * chronicle is written by a query.
 */
export interface RecapDraft {
  /** The suggested body, ready to be edited. Empty when nothing was recorded. */
  body: string;
  /** What it was built from, so the DM can see why a line is there. */
  sources: {
    encounters: number;
    handouts: number;
    sheetChanges: number;
    downtime: number;
  };
}

/**
 * The stretch of time a sitting covers, or null when it does not cover one
 * yet.
 *
 * From the end of the previous sitting to the end of this one, because a
 * change to a character between two sessions belongs to the one it was played
 * at — a player who levels up on the Wednesday is doing it for last Tuesday's
 * night, not next week's.
 *
 * A sitting that has not been played has no window at all. Running to "now"
 * instead swept up every change since the last session — for an evening that
 * has not happened — and then handed the same rows to the next sitting's draft
 * as well, because an unplayed session leaves no boundary behind it. Before
 * the night, the only honest sources are the things actually filed under it.
 */
async function windowFor(
  session: typeof campaignSessions.$inferSelect
): Promise<{ from: string; to: string } | null> {
  if (session.status !== 'played') return null;

  const previous = await db
    .select({
      playedOn: campaignSessions.playedOn,
      createdAt: campaignSessions.createdAt,
      number: campaignSessions.number,
    })
    .from(campaignSessions)
    .where(
      and(
        eq(campaignSessions.campaignId, session.campaignId),
        lte(campaignSessions.number, session.number - 1)
      )
    )
    .orderBy(asc(campaignSessions.number));

  const last = previous.at(-1);
  return {
    from: last?.playedOn ?? last?.createdAt ?? session.createdAt,
    to: session.playedOn ?? session.updatedAt,
  };
}

/** "Pip, Thora and Bertrand" — a list that reads as a sentence. */
function sentenceList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export async function draftRecap(sessionId: string): Promise<RecapDraft> {
  const session = await db.query.campaignSessions.findFirst({
    where: eq(campaignSessions.id, sessionId),
  });
  if (!session) throw new Error('NOT_FOUND');
  await requireCampaignRole(session.campaignId, ['gm', 'co-gm']);

  const window = await windowFor(session);

  const [encounters, handouts, periods, register, party] = await Promise.all([
    db
      .select()
      .from(initiativeEncounters)
      .where(eq(initiativeEncounters.sessionId, sessionId)),
    db
      .select()
      .from(campaignHandouts)
      .where(eq(campaignHandouts.sessionId, sessionId)),
    db
      .select()
      .from(downtimePeriods)
      .where(eq(downtimePeriods.sessionId, sessionId)),
    db
      .select({
        status: campaignSessionAttendance.status,
        userId: campaignSessionAttendance.userId,
        name: users.name,
        characterName: characters.name,
      })
      .from(campaignSessionAttendance)
      .leftJoin(users, eq(users.id, campaignSessionAttendance.userId))
      .leftJoin(
        characters,
        eq(characters.id, campaignSessionAttendance.characterId)
      )
      .where(eq(campaignSessionAttendance.sessionId, sessionId)),
    db
      .select({ id: characters.id, name: characters.name })
      .from(campaignMembers)
      .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
      .where(eq(campaignMembers.campaignId, session.campaignId)),
  ]);

  // Foes are the interesting half of a fight: "the bridge at Duskwater" says
  // less than "four goblin warriors and a boss".
  const foes = encounters.length
    ? await db
        .select()
        .from(initiativeEntries)
        .where(
          inArray(
            initiativeEntries.encounterId,
            encounters.map(e => e.id)
          )
        )
    : [];

  // Only the changes that are worth a line. A recap listing every hit point is
  // not a recap, which is also why play-mode HP writes no history row at all.
  const history =
    window && party.length
      ? await db
          .select()
          .from(characterHistory)
          .where(
            and(
              inArray(
                characterHistory.characterId,
                party.map(p => p.id)
              ),
              gt(characterHistory.occurredAt, window.from),
              lte(characterHistory.occurredAt, window.to)
            )
          )
          .orderBy(asc(characterHistory.occurredAt))
      : [];

  const nameById = new Map(party.map(p => [p.id, p.name]));
  const notable = history.filter(
    h => h.kind === 'level' || h.kind === 'homebrew' || h.kind === 'inventory'
  );

  const lines: string[] = [];

  const there = register
    .filter(r => r.status !== 'absent')
    .map(r => r.characterName || r.name || 'someone');
  if (there.length > 0) {
    lines.push(
      `${sentenceList(there)} ${there.length === 1 ? 'was' : 'were'} at the table.`
    );
  }

  for (const encounter of encounters) {
    const mine = foes.filter(f => f.encounterId === encounter.id);
    const enemies = mine.filter(f => f.side === 'foe');
    const down = enemies.filter(f => f.hpCurrent !== null && f.hpCurrent <= 0);

    // Count copies by name, so "Goblin Warrior 1..4" reads as "four of them".
    const kinds = new Map<string, number>();
    for (const foe of enemies) {
      const base = foe.label.replace(/\s+\d+$/, '');
      kinds.set(base, (kinds.get(base) ?? 0) + 1);
    }
    // "4× Goblin Warrior" rather than "4 Goblin Warriors": pluralising an
    // arbitrary monster name produces "4 Wolfs" often enough that the count
    // is better stated than guessed. The draft is a spine to rewrite, and a
    // wrong plural in it is a thing the DM has to notice and fix.
    const roster = [...kinds.entries()]
      .map(([label, n]) => (n > 1 ? `${n}× ${label}` : label))
      .join(', ');

    const fell =
      down.length === 0
        ? 'None of them went down.'
        : down.length === enemies.length
          ? 'All of them went down.'
          : `${down.length} of them went down.`;

    lines.push(
      roster ? `${encounter.name}: ${roster}. ${fell}` : `${encounter.name}.`
    );

    const fallen = mine.filter(
      f => f.side === 'party' && f.hpCurrent !== null && f.hpCurrent <= 0
    );
    if (fallen.length > 0) {
      lines.push(`${sentenceList(fallen.map(f => f.label))} went down in it.`);
    }
  }

  for (const handout of handouts.filter(h => h.visibility === 'shared')) {
    lines.push(`They were shown ${handout.title || 'a handout'}.`);
  }

  for (const change of notable) {
    const who = nameById.get(change.characterId) ?? 'Someone';
    lines.push(`${who} — ${change.detail}`);
  }

  for (const period of periods) {
    lines.push(`Downtime opened: ${period.label || 'a stretch of days'}.`);
  }

  return {
    body: lines.join('\n'),
    sources: {
      encounters: encounters.length,
      handouts: handouts.length,
      sheetChanges: notable.length,
      downtime: periods.length,
    },
  };
}
