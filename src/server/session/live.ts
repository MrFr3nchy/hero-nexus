import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { CharacterSheet } from '@/@creator/character/schema';
import {
  parseContentData,
  refKey,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';
import { speedFor } from '@/@creator/campaign/lib/condition-effects';
import { parseConditions } from '@/@creator/campaign/lib/conditions';

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
import { mergeCampaignSettings, requireCampaignRole } from '../campaigns';
import { portraitsFor } from '../character-portraits';
import { getBattleMapState } from '../battlemap';
import type { TableKind } from '@/@creator/campaign/lib/screen';
import {
  applyTableRulesPatch,
  sanitizeTableRulesPatch,
} from '@/@creator/campaign/lib/table-rules';
import { listChecks } from '../checks';
import { listEffects } from '../effects';
import {
  outcomeForPlayer,
  type RollOutcome,
} from '@/@creator/campaign/lib/attack';
import { parseTurn } from '@/@creator/campaign/lib/turn';
import { listMaps } from '../maps';
import { listPartyPlayState } from '../play';
import type { EntryForm } from '@/@creator/campaign/lib/casting';
import { watchersOf } from '../live-hub';
import { resolveContentRefs } from '../content';
import { loadsFor } from '../load';
import type { Encumbrance } from '@/@creator/character/lib/derive';
import { listWhispers } from '../whispers';
import { readWorldClock } from '../world-time';
import { openRest } from '../rests';
import {
  normalizeLegendary,
  turnMembers,
} from '@/@creator/campaign/lib/monsters';
import { peekUndo } from '../undo';
import { readAmbience } from '../audio';
import { tavernViewFor } from '../tavern/view';
import { ROLL_LOG_LIMIT } from './shared';
import type {
  EntryRow,
  HandoutRow,
  LiveState,
  RollRow,
  TimerRow,
} from './shared';

/**
 * The live view: one role-filtered read that every open table re-reads
 * when the version moves.
 */
/**
 * Which table a campaign is at, from the two facts that decide it.
 *
 * Derived, never stored. No role check: the answer is not a secret, and the callers
 * (`getLiveState`, the campaign page, the sitting bar) have each already
 * established the reader belongs here.
 */
export async function tableAt(
  campaignId: string,
  /**
   * Staff see a fight being laid out as a fight; players do not, until
   * somebody rolls for initiative. Same rule as `getLiveState`.
   */
  isStaff = false
): Promise<TableKind> {
  const [sitting, fight] = await Promise.all([
    db.query.campaignSessions.findFirst({
      columns: { id: true },
      where: and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.status, 'live')
      ),
    }),
    db.query.initiativeEncounters.findFirst({
      columns: { id: true, phase: true },
      where: and(
        eq(initiativeEncounters.campaignId, campaignId),
        eq(initiativeEncounters.isActive, true)
      ),
    }),
  ]);
  const fighting = fight && (fight.phase === 'fighting' || isStaff);
  return !sitting ? 'desk' : fighting ? 'battle' : 'table';
}

/** The default a monster walks at when its block is not to hand. */
const DEFAULT_SPEED_FEET = 30;

/**
 * Every combatant's speed this turn, in one pass: heroes off their sheets,
 * dealt-in monsters off their blocks (one batched resolve), hand-typed foes
 * at the default — each through `speedFor` for conditions and exhaustion.
 */
async function speedsFor(
  campaignId: string,
  rows: (typeof initiativeEntries.$inferSelect)[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (rows.length === 0) return out;
  const characterIds = rows
    .map(r => r.characterId)
    .filter((id): id is string => id !== null);
  const sheets = new Map(
    characterIds.length > 0
      ? (
          await db
            .select({ id: characters.id, sheet: characters.sheet })
            .from(characters)
            .where(inArray(characters.id, characterIds))
        ).map(c => [c.id, c.sheet as CharacterSheet])
      : []
  );
  const refs = rows
    .map(r => r.creatureRef as ContentRef | null)
    .filter((r): r is ContentRef => r !== null);
  const [blocks, loads] = await Promise.all([
    refs.length > 0 ? resolveContentRefs(refs) : new Map(),
    loadsFor(sheets, campaignId),
  ]);
  for (const r of rows) {
    let base = DEFAULT_SPEED_FEET;
    let exhaustion = 0;
    let load: Encumbrance | null = null;
    const sheet = r.characterId ? sheets.get(r.characterId) : undefined;
    if (sheet) {
      base = sheet.combat?.speed ?? base;
      exhaustion = sheet.combat?.exhaustion ?? 0;
      load = loads.get(r.characterId!) ?? null;
    } else if (r.creatureRef) {
      const block = blocks.get(refKey(r.creatureRef as ContentRef));
      if (block) {
        const d = parseContentData('creature', block.data) as CreatureData;
        if (d.speed.walk > 0) base = d.speed.walk;
      }
    }
    out.set(
      r.id,
      speedFor(base, parseConditions(r.conditionKeys), exhaustion, load)
    );
  }
  return out;
}

export function orderEntries(rows: EntryRow[]): EntryRow[] {
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
  if (!MEASURE_LIVE) return assembleLiveState(campaignId);
  const started = performance.now();
  const state = await assembleLiveState(campaignId);
  // Serialised here only to be weighed. The bytes the wire carries are the
  // action's own encoding of the same object, within a few percent.
  const bytes = Buffer.byteLength(JSON.stringify(state));
  console.error(
    `[live] getLiveState ${campaignId} ${state.role} ${(
      performance.now() - started
    ).toFixed(1)}ms ${bytes}B entries=${state.entries.length} effects=${
      state.effects.length
    } whispers=${state.whispers.length} tokens=${
      state.battlemap?.tokens.length ?? 0
    }`
  );
  return state;
}

/**
 * `HERO_NEXUS_MEASURE_LIVE=1` logs one line per read: how long it took and
 * how many bytes it weighs. The stream carries a version number and nothing
 * else, so every nudge is one of these per connected browser. Take fresh
 * numbers with it rather than trusting old ones.
 */
const MEASURE_LIVE = process.env.HERO_NEXUS_MEASURE_LIVE === '1';

async function assembleLiveState(campaignId: string): Promise<LiveState> {
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

  const entryRows = encounter
    ? await db
        .select()
        .from(initiativeEntries)
        .where(eq(initiativeEntries.encounterId, encounter.id))
    : [];
  const speeds = await speedsFor(campaignId, entryRows);
  const rawEntries = orderEntries(
    entryRows.map(
      r =>
        ({
          ...r,
          turn: parseTurn(r.turn),
          form: (r.form as EntryForm | null) ?? null,
          speed: speeds.get(r.id) ?? DEFAULT_SPEED_FEET,
          groupId: r.groupId ?? null,
          legendary: normalizeLegendary(r.legendary),
        }) as EntryRow
    )
  );
  // Nobody's turn while the fight is still being laid out: an order that
  // has not been rolled has no top, and a player told it was their turn
  // before anybody rolled has been told the fight started.
  const turnEntryIds =
    encounter && encounter.phase === 'fighting'
      ? turnMembers(rawEntries, encounter.turnIndex).map(i => rawEntries[i].id)
      : [];

  const entries = isStaff
    ? rawEntries
    : rawEntries.map(e =>
        e.side === 'party'
          ? { ...e, creatureRef: null, legendary: null }
          : {
              ...e,
              hpCurrent: null,
              hpMax: null,
              hpTemp: 0,
              armorClass: null,
              form: e.form
                ? { ...e.form, hpCurrent: 0, hpMax: 0, armorClass: 0 }
                : null,
              // The block is the DM's. A player knows what an aboleth is from
              // its name; they do not get a key into the bestiary from it.
              creatureRef: null,
              // Only that the lair fights, never the counters.
              legendary: e.legendary?.lair
                ? {
                    actions: { max: 0, used: 0 },
                    resistances: { max: 0, used: 0 },
                    lair: true,
                  }
                : null,
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

  // The rules are read here as well as below, because the roll log's
  // outcome filter needs `showHitMiss` before the rest of the state is
  // gathered. One read, used twice.
  const campaignRow = await db.query.campaigns.findFirst({
    columns: { settings: true },
    where: eq(campaigns.id, campaignId),
  });
  const tableRules = mergeCampaignSettings(campaignRow?.settings).table;
  const rules = encounter?.isActive
    ? applyTableRulesPatch(tableRules, encounter.ruleOverrides)
    : tableRules;

  const rolls: RollRow[] = rollRows
    // A roll behind the screen reaches staff and whoever rolled it: a
    // player's own hidden roll (a tavern game's cheat) is theirs to see, and
    // nothing is ever hidden from the DM.
    .filter(
      r => isStaff || r.visibility === 'table' || r.actorUserId === userId
    )
    .map(r => {
      const outcome = (r.outcome as RollOutcome | null) ?? null;
      return {
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
        physical: r.physical,
        createdAt: r.createdAt,
        outcome:
          outcome && !isStaff
            ? outcomeForPlayer(outcome, rules.showHitMiss)
            : outcome,
      };
    });

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
      pausedAt: t.pausedAt,
    }));

  // Both are their own modules and already role-filtered there — these are
  // reads, not second places that decide what a player may see.
  const [
    checks,
    party,
    maps,
    battlemap,
    portraitRows,
    whispers,
    effects,
    clock,
    rest,
    ambience,
  ] = await Promise.all([
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
    encounter ? listEffects(encounter.id, isStaff) : Promise.resolve([]),
    readWorldClock(campaignId),
    openRest(campaignId),
    readAmbience(campaignId),
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

  /*
   * A fight being laid out puts the DM at the board and leaves everybody
   * else at the table. The DM needs the board to place the ghouls; a player
   * whose screen rearranged itself into a fight the moment the DM started
   * placing scenery has been told something they were not told.
   */
  const table: TableKind = !sittingRow
    ? 'desk'
    : encounter?.isActive && (encounter.phase === 'fighting' || isStaff)
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
          phase: encounter.phase,
          round: encounter.round,
          turnIndex: encounter.turnIndex,
          ruleOverrides: sanitizeTableRulesPatch(encounter.ruleOverrides),
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
    rules,
    effects,
    clock,
    rest,
    turnEntryIds,
    undo: isStaff ? peekUndo(campaignId) : null,
    ambience,
    tavern: await tavernViewFor(campaignId, { userId, role }),
  };
}
