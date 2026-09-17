import 'server-only';

import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import {
  LAIR_INITIATIVE,
  LAIR_LABEL,
  legendaryLeft,
  normalizeLegendary,
  type Legendary,
} from '@/@creator/campaign/lib/monsters';
import { parseTurn } from '@/@creator/campaign/lib/turn';
import { db } from '@/db';
import { initiativeEncounters, initiativeEntries } from '@/db/schema';
import { requireCampaignRole } from './campaigns';
import { bumpVersion, publish } from './live-hub';
import { effectiveRules, fence } from './table-rules';

/**
 * Running the other side (improvements 11): the writes behind the tracker's
 * group menu, the legendary pips and the recharge dots. Staff only, all of
 * it — a player never touches a monster's counters.
 */

async function staffEntry(entryId: string) {
  const entry = await db.query.initiativeEntries.findFirst({
    where: eq(initiativeEntries.id, entryId),
  });
  if (!entry) throw new Error('NOT_FOUND');
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { id: true, campaignId: true },
    where: eq(initiativeEncounters.id, entry.encounterId),
  });
  if (!enc) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(enc.campaignId, ['gm', 'co-gm']);
  return { entry, campaignId: enc.campaignId, encounterId: enc.id, userId };
}

/* --- groups ---------------------------------------------------------------- */

/**
 * Put these rows on one turn, or take them off it. Grouping aligns every
 * member's initiative to the first's so they sit together in the order —
 * a group split across the order is not a group.
 */
export async function setEntryGroup(
  entryIds: string[],
  grouped: boolean
): Promise<void> {
  if (entryIds.length === 0) return;
  const {
    entry: first,
    campaignId,
    encounterId,
  } = await staffEntry(entryIds[0]);
  const rows = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, encounterId));
  const members = rows.filter(r => entryIds.includes(r.id));
  if (members.length !== entryIds.length) throw new Error('NOT_FOUND');

  if (!grouped) {
    for (const m of members) {
      await db
        .update(initiativeEntries)
        .set({ groupId: null })
        .where(eq(initiativeEntries.id, m.id));
    }
  } else {
    const groupId = first.groupId ?? randomUUID();
    for (const m of members) {
      await db
        .update(initiativeEntries)
        .set({ groupId, initiative: first.initiative })
        .where(eq(initiativeEntries.id, m.id));
    }
  }
  bumpVersion(campaignId);
}

/* --- legendary --------------------------------------------------------------- */

/** Staff edit the counters on the card. Null clears them. */
export async function setLegendary(
  entryId: string,
  patch: Partial<Legendary> | null
): Promise<void> {
  const { entry, campaignId } = await staffEntry(entryId);
  const current = normalizeLegendary(entry.legendary);
  const next =
    patch === null
      ? null
      : normalizeLegendary({
          actions: patch.actions ?? current?.actions ?? { max: 0, used: 0 },
          resistances: patch.resistances ??
            current?.resistances ?? { max: 0, used: 0 },
          lair: patch.lair ?? current?.lair ?? false,
        });
  await db
    .update(initiativeEntries)
    .set({ legendary: next })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
}

/**
 * Take a legendary action. Does not spend 05's action slot — it is taken at
 * the end of somebody else's turn. Refused under Enforce when none are
 * left; advising, it is recorded past the count and the log says so.
 */
export async function spendLegendaryAction(
  entryId: string,
  cost: number,
  opts: { ruling?: boolean } = {}
): Promise<{ left: number; ruling: boolean }> {
  const { entry, campaignId, encounterId, userId } = await staffEntry(entryId);
  const legendary = normalizeLegendary(entry.legendary);
  if (!legendary || legendary.actions.max === 0)
    throw new Error('NOT_LEGENDARY');
  const c = Math.max(1, Math.min(5, Math.trunc(cost) || 1));
  const rules = await effectiveRules(campaignId, encounterId);
  const left = legendaryLeft(legendary.actions);
  let ruling = false;
  if (left < c) {
    ruling = fence('NO_LEGENDARY_LEFT', rules, {
      isStaff: true,
      ruling: opts.ruling,
    });
  }
  const used = Math.min(legendary.actions.max, legendary.actions.used + c);
  await db
    .update(initiativeEntries)
    .set({
      legendary: { ...legendary, actions: { ...legendary.actions, used } },
    })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'action',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorLabel: entry.label,
    action: `Legendary action${c > 1 ? ` (${c})` : ''}`,
    cost: 'free',
    note: '',
    again: left < c,
    ruling,
    what: 'took',
  });
  return { left: Math.max(0, legendary.actions.max - used), ruling };
}

/** Choose to succeed instead. One a day; refused when none are left. */
export async function spendLegendaryResistance(
  entryId: string
): Promise<number> {
  const { entry, campaignId, userId } = await staffEntry(entryId);
  const legendary = normalizeLegendary(entry.legendary);
  if (!legendary || legendary.resistances.max === 0) {
    throw new Error('NOT_LEGENDARY');
  }
  if (legendaryLeft(legendary.resistances) === 0) {
    throw new Error('NO_RESISTANCE_LEFT');
  }
  const used = legendary.resistances.used + 1;
  await db
    .update(initiativeEntries)
    .set({
      legendary: {
        ...legendary,
        resistances: { ...legendary.resistances, used },
      },
    })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'action',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorLabel: entry.label,
    action: 'Legendary Resistance',
    cost: 'free',
    note: 'chooses to succeed',
    again: false,
    ruling: false,
    what: 'took',
  });
  return legendary.resistances.max - used;
}

/**
 * The lair fights: a "Lair" row at initiative 20, losing ties, on the
 * creature's side of nothing. Off deletes it. Kept on the creature's own
 * `legendary.lair` so `removeEntry` can take the room with the dragon.
 */
export async function setLair(entryId: string, lair: boolean): Promise<void> {
  const { entry, campaignId, encounterId } = await staffEntry(entryId);
  const legendary = normalizeLegendary(entry.legendary) ?? {
    actions: { max: 0, used: 0 },
    resistances: { max: 0, used: 0 },
    lair: false,
  };
  await db
    .update(initiativeEntries)
    .set({ legendary: { ...legendary, lair } })
    .where(eq(initiativeEntries.id, entryId));

  const existing = await db.query.initiativeEntries.findFirst({
    where: and(
      eq(initiativeEntries.encounterId, encounterId),
      eq(initiativeEntries.label, LAIR_LABEL)
    ),
  });
  if (lair && !existing) {
    const rows = await db
      .select({ sort: initiativeEntries.sort })
      .from(initiativeEntries)
      .where(eq(initiativeEntries.encounterId, encounterId));
    // The highest sort loses every tie at 20, which is the rule.
    const sort = rows.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
    await db.insert(initiativeEntries).values({
      encounterId,
      label: LAIR_LABEL,
      initiative: LAIR_INITIATIVE,
      side: 'other',
      sort,
      legendary: {
        actions: { max: 0, used: 0 },
        resistances: { max: 0, used: 0 },
        lair: true,
      },
    });
  } else if (!lair && existing) {
    await db
      .delete(initiativeEntries)
      .where(eq(initiativeEntries.id, existing.id));
  }
  bumpVersion(campaignId);
}

/* --- recharge --------------------------------------------------------------- */

/**
 * Use an ability that recharges. Not ready: refused under Enforce
 * (`NOT_RECHARGED`), recorded and marked past the rule when advising. Either
 * way it is spent, and the d6 at the start of the creature's next turn is
 * what brings it back.
 */
export async function spendRechargeFeature(
  entryId: string,
  name: string,
  opts: { ruling?: boolean } = {}
): Promise<{ ruling: boolean }> {
  const { entry, campaignId, encounterId, userId } = await staffEntry(entryId);
  const turn = parseTurn(entry.turn);
  const state = turn.recharge?.[name];
  if (!state) throw new Error('NOT_A_RECHARGE');
  const rules = await effectiveRules(campaignId, encounterId);
  let ruling = false;
  if (!state.ready) {
    ruling = fence('NOT_RECHARGED', rules, {
      isStaff: true,
      ruling: opts.ruling,
    });
  }
  await db
    .update(initiativeEntries)
    .set({
      turn: {
        ...turn,
        recharge: { ...turn.recharge, [name]: { ...state, ready: false } },
      },
    })
    .where(eq(initiativeEntries.id, entryId));
  bumpVersion(campaignId);
  publish(campaignId, {
    kind: 'action',
    id: randomUUID(),
    at: new Date().toISOString(),
    by: userId,
    actorLabel: entry.label,
    action: name,
    cost: 'action',
    note: state.ready ? '' : 'not recharged',
    again: !state.ready,
    ruling,
    what: 'took',
  });
  return { ruling };
}

/** A rest readies everything on every foe still in the fight. */
export async function readyAllRecharges(campaignId: string): Promise<void> {
  const enc = await db.query.initiativeEncounters.findFirst({
    columns: { id: true },
    where: and(
      eq(initiativeEncounters.campaignId, campaignId),
      eq(initiativeEncounters.isActive, true)
    ),
  });
  if (!enc) return;
  const rows = await db
    .select()
    .from(initiativeEntries)
    .where(eq(initiativeEntries.encounterId, enc.id));
  for (const row of rows) {
    const turn = parseTurn(row.turn);
    if (!turn.recharge) continue;
    const recharge = Object.fromEntries(
      Object.entries(turn.recharge).map(([k, v]) => [k, { ...v, ready: true }])
    );
    await db
      .update(initiativeEntries)
      .set({ turn: { ...turn, recharge } })
      .where(eq(initiativeEntries.id, row.id));
  }
}
