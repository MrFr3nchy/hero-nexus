import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  parseContentData,
  refKey,
  type ContentRef,
  type CreatureData,
} from '@/@shared/content';

import { db } from '@/db';
import { initiativeEncounters, initiativeEntries } from '@/db/schema';
import { requireCampaignRole } from '../campaigns';
import { activeBoardId, bindBoardToFight } from '../battlemap';

import { requestCheck } from '../checks';
import { tickEffects } from '../effects';
import { beginEntryTurn } from '../turn';

import { parseTurn } from '@/@creator/campaign/lib/turn';
import type { EntryForm } from '@/@creator/campaign/lib/casting';
import { bumpVersion, publish } from '../live-hub';
import { resolveContentRefs } from '../content';
import {
  groupLabel,
  legendaryLeft,
  nextTurn,
  normalizeLegendary,
  turnMembers,
} from '@/@creator/campaign/lib/monsters';
import { recordUndo } from '../undo';
import { readAmbience, setAmbience } from '../audio';
import { addPartyToEncounter, rollInitiative } from './entries';
import type { InitiativeRoll } from './entries';
import { orderEntries } from './live';
import type { EntryRow } from './shared';

/**
 * A fight: creating it, rolling for initiative, turns, and ending it.
 */
export async function staff(campaignId: string) {
  return requireCampaignRole(campaignId, ['gm', 'co-gm']);
}

export async function createEncounter(
  campaignId: string,
  name: string,
  /**
   * `setup` lays the fight out without starting it: the order exists, foes
   * can be placed on the board and shown to the party, and nothing advances
   * until *Roll for initiative*. That is the default now, because putting
   * the ghouls where they wait is prep and starting the fight is play, and
   * doing both in one press is what made the board feel like it only
   * existed during combat.
   */
  phase: 'setup' | 'fighting' = 'setup'
): Promise<string> {
  const { userId } = await staff(campaignId);
  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.campaignId, campaignId));
  const [row] = await db
    .insert(initiativeEncounters)
    .values({
      campaignId,
      name: name.trim() || 'Encounter',
      isActive: true,
      phase,
    })
    .returning({ id: initiativeEncounters.id });
  // The board on the table follows the fight: last week's tokens come off it
  // now, not when the DM next presses "Deal them in".
  const boardId = await activeBoardId(campaignId);
  if (boardId) await bindBoardToFight(boardId, row.id);
  bumpVersion(campaignId);
  publish(
    campaignId,
    {
      kind: 'encounter',
      id: randomUUID(),
      at: new Date().toISOString(),
      by: userId,
      encounterName: name.trim() || 'Encounter',
      // Laying a fight out is not a fight starting, and the table should not
      // be told to brace itself while the DM is still placing scenery.
      state: phase === 'setup' ? 'staged' : 'started',
    },
    phase === 'setup' ? 'staff' : 'everyone'
  );
  return row.id;
}

/**
 * Roll for initiative: the one press that turns a fight being laid out into
 * a fight.
 *
 * Everything it does is something the DM used to do by hand in some order or
 * other — add the party if nobody added them, roll for whoever has no
 * number, go to the top of the order, say so to the table. Doing them
 * together is the point: a fight with no party in it is not a fight, and a
 * table that is not told the fight has started finds out when somebody's
 * turn banner appears.
 */
export async function startFight(
  encounterId: string
): Promise<InitiativeRoll[]> {
  const campaignId = await encounterCampaign(encounterId);
  const { userId } = await staff(campaignId);
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');

  // A fight with nobody in it on the party's side: put them in rather than
  // refusing, which is what the DM was about to do anyway.
  const present = await db
    .select({ side: initiativeEntries.side })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  if (!present.some(r => r.side === 'party')) {
    await addPartyToEncounter(encounterId);
  }

  const rolled = await rollInitiative(encounterId);

  await db
    .update(initiativeEncounters)
    .set({ phase: 'fighting', round: 1, turnIndex: 0 })
    .where(eq(initiativeEncounters.id, encounterId));

  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'encounter',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    encounterName: enc.name,
    state: 'started',
  });
  return rolled;
}

export async function encounterCampaign(encounterId: string): Promise<string> {
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  return enc.campaignId;
}

/**
 * What a fight turned out to be worth.
 *
 * Handed back by `endEncounter` so the bookkeeping happens while it is
 * fresh: the DM used to end the fight, and then find the award card a
 * section away, by which time the table had moved on and the experience was
 * handed out next week or not at all.
 *
 * Everything here is a sum over what was actually in the order — foes that
 * were dealt in and did not leave — not what a plan said before it started.
 */
export interface FightSpoils {
  /** The fight's name, for the card's line. */
  name: string;
  /** Foes in the order, counting copies. */
  foes: number;
  /** How many of them were left standing. */
  standing: number;
  /** Sum of the foes' experience, where the block says. */
  experience: number;
  /** Seated heroes on the party's side, for the split. */
  partySize: number;
  /** The split, rounded down. Zero when nobody was seated. */
  perCharacter: number;
  /** The characters who were in it, for the award's recipients. */
  characterIds: string[];
  /** True when a foe's block no longer resolves, so the total is short. */
  incomplete: boolean;
}

export async function endEncounter(
  encounterId: string
): Promise<FightSpoils | null> {
  const campaignId = await encounterCampaign(encounterId);
  await staff(campaignId);
  const enc = await db.query.initiativeEncounters.findFirst({
    where: eq(initiativeEncounters.id, encounterId),
  });

  // What it was worth, read before the fight is closed — the rows do not
  // move, but reading first keeps the summary about the fight that ran.
  const spoils = enc ? await fightSpoils(enc.id, enc.name) : null;

  await db
    .update(initiativeEncounters)
    .set({ isActive: false })
    .where(eq(initiativeEncounters.id, encounterId));
  // A track the board started goes with the fight (12); one the DM chose
  // by hand stays on.
  const playing = await readAmbience(campaignId);
  if (playing?.fromBoard) await setAmbience(campaignId, null);
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'encounter',
    id: randomUUID(),
    at: new Date().toISOString(),
    encounterName: enc?.name ?? 'The fight',
    state: 'ended',
  });
  return spoils;
}

/** The arithmetic behind `FightSpoils`. Staff-only by its one caller. */
async function fightSpoils(
  encounterId: string,
  name: string
): Promise<FightSpoils> {
  const rows = await db
    .select({
      id: initiativeEntries.id,
      side: initiativeEntries.side,
      characterId: initiativeEntries.characterId,
      creatureRef: initiativeEntries.creatureRef,
      hpCurrent: initiativeEntries.hpCurrent,
    })
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));

  const foes = rows.filter(r => r.side === 'foe');
  const party = rows.filter(r => r.side === 'party' && r.characterId);

  const refs = foes
    .map(f => f.creatureRef as ContentRef | null)
    .filter((r): r is ContentRef => r !== null);
  const resolved = refs.length > 0 ? await resolveContentRefs(refs) : new Map();

  let experience = 0;
  let incomplete = false;
  for (const foe of foes) {
    const ref = foe.creatureRef as ContentRef | null;
    if (!ref) {
      // A hand-typed foe has no block and so no experience the app can
      // claim. That is not the same as being worth nothing, so the card
      // says the total is short rather than pretending it is complete.
      incomplete = true;
      continue;
    }
    const entry = resolved.get(refKey(ref));
    const data = entry
      ? (parseContentData('creature', entry.data) as CreatureData)
      : null;
    const xp = data?.experience_points ?? null;
    if (xp === null) {
      incomplete = true;
      continue;
    }
    experience += xp;
  }

  const partySize = party.length;
  return {
    name,
    foes: foes.length,
    standing: foes.filter(f => f.hpCurrent === null || f.hpCurrent > 0).length,
    experience,
    partySize,
    perCharacter: partySize > 0 ? Math.floor(experience / partySize) : 0,
    characterIds: party
      .map(p => p.characterId)
      .filter((id): id is string => id !== null),
    incomplete,
  };
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
    (
      await db
        .select()
        .from(initiativeEntries)
        .where(eq(initiativeEntries.encounterId, encounterId))
    ).map(
      r =>
        ({
          ...r,
          turn: parseTurn(r.turn),
          form: (r.form as EntryForm | null) ?? null,
          speed: 0,
          groupId: r.groupId ?? null,
          legendary: normalizeLegendary(r.legendary),
        }) as EntryRow
    )
  );
  const count = ordered.length;
  if (count === 0) return;

  // A group is one turn (11): the step lands on the head of the next group
  // or the next lone row, and a round is counted when it wraps.
  const step = nextTurn(ordered, enc.turnIndex, direction);
  const turn = step.turn;
  const round = step.wrapped
    ? direction === 1
      ? enc.round + 1
      : Math.max(1, enc.round - 1)
    : enc.round;
  await db
    .update(initiativeEncounters)
    .set({ turnIndex: turn, round })
    .where(eq(initiativeEncounters.id, encounterId));
  // The DM's undo (11): the order steps back, the effects it expired stay.
  recordUndo(campaignId, {
    label: `Turn back to ${ordered[enc.turnIndex]?.label ?? 'the top'}; effects stayed`,
    inverse: async () => {
      await db
        .update(initiativeEncounters)
        .set({ turnIndex: enc.turnIndex, round: enc.round })
        .where(eq(initiativeEncounters.id, encounterId));
    },
  });
  bumpVersion(campaignId);

  const up = ordered[turn];
  const upMembers = turnMembers(ordered, turn).map(i => ordered[i]);
  publish(campaignId, {
    kind: 'turn',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    encounterName: enc.name,
    round,
    label:
      upMembers.length > 1
        ? groupLabel(up?.label ?? '')
        : (up?.label ?? 'Somebody'),
    characterId: up?.characterId ?? null,
  });

  /*
   * Legendary creatures (11): at the end of every turn that is not theirs,
   * staff are nudged with what is left — a legendary action is taken at
   * the end of somebody else's turn, and the DM is the one who forgets.
   */
  if (direction === 1) {
    /*
     * One slip, not one per creature. Three legendary creatures used to
     * mean three near-identical nudges in the corner at the end of every
     * turn, which reads as the same notification arriving again and again.
     */
    const waiting = ordered
      .filter(
        row =>
          row.legendary &&
          row.legendary.actions.max > 0 &&
          !upMembers.some(m => m.id === row.id) &&
          legendaryLeft(row.legendary.actions) > 0
      )
      .map(row => ({
        label: row.label,
        left: legendaryLeft(row.legendary!.actions),
      }));
    if (waiting.length > 0) {
      publish(
        campaignId,
        {
          kind: 'action',
          id: randomUUID(),
          at: new Date().toISOString(),
          by: userId,
          actorLabel:
            waiting.length === 1
              ? waiting[0].label
              : `${waiting.length} creatures`,
          action: 'Legendary action',
          cost: 'free',
          note: waiting.map(w => `${w.label} · ${w.left} left`).join(' · '),
          again: false,
          ruling: false,
          what: 'legendary',
        },
        'staff'
      );
    }
  }

  /*
   * The one clock. Everything with rounds on it counts down here — a turn
   * ending, the next beginning, the top of a new round — and nowhere else.
   * Only forwards: "Back" is the DM correcting a mis-tap, and un-ticking
   * would have to un-announce what the table was already told. A save that
   * falls due on a seated hero comes back as a prompt and is raised here
   * through the Asking, so a pass on it can close the effect that asked.
   */
  if (direction === 1) {
    // The turn that begins is fresh: slots back, Dodge over, reaction
    // returned — and anyone holding a Ready is nudged to staff. A group
    // begins together.
    await beginEntryTurn(
      campaignId,
      encounterId,
      upMembers.map(m => m.id),
      userId
    );
    const ended = ordered[Math.min(enc.turnIndex, count - 1)];
    const prompts = await tickEffects(
      campaignId,
      encounterId,
      {
        endedEntryId: ended?.id ?? null,
        beganEntryId: up?.id ?? null,
        newRound: round > enc.round,
      },
      userId
    );
    for (const p of prompts) {
      await requestCheck(campaignId, {
        kind: 'save',
        ability: p.ability,
        dc: p.dc,
        dcVisibility: p.visibility === 'dm' ? 'hidden' : 'shown',
        prompt: p.prompt,
        targetUserIds: [p.userId],
        effectId: p.effectId,
      }).catch(err => {
        // A seat that emptied between the tick and the ask is not a reason
        // to stop the turn; the row stays and asks again next time round.
        console.error('[effects] could not raise a save', err);
      });
    }
  }
}
