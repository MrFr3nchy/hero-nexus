import 'server-only';
import { and, eq } from 'drizzle-orm';
import { type ConditionKey } from '@/@creator/campaign/lib/conditions';

import {
  applyDeathSave,
  dyingState,
  type DeathSaveMode,
} from '@/@creator/character/lib/dying';
import { abilityModifier } from '@/@creator/character/lib/derive';
import { type CharacterSheet } from '@/@creator/character/schema';
import { d20Faces, rollDie, type NotationRoll } from '@/@shared/lib/dice';
import { db } from '@/db';
import {
  campaignMembers,
  campaignRolls,
  characters,
  initiativeEntries,
} from '@/db/schema';
import { requireCampaignRole } from '../campaigns';
import { writeConditions } from '../conditions';
import { clearRestedEffects } from '../effects';
import { bumpVersion } from '../live-hub';
import { claimedFaces } from '../dice-claims';
import { regainsInspirationOnLongRest } from '@/@creator/campaign/lib/rests';
import { readyAllRecharges } from '../monsters';
import { SLOT_KEYS, announceVitals, authorize, playStateOf } from './shared';
import type { PlayState } from './shared';

/**
 * Death saves, hit dice, rests and conditions.
 */
/**
 * Roll one death saving throw, on the server.
 *
 * The die is rolled here and written to `campaign_rolls` for the same reason
 * `spendHitDice` rolls here: a total the browser produced is a claim about a
 * roll, not a record of one. That matters more for this roll than any other in
 * the app — it is the one a table most needs to trust, and the one most
 * tempting to fudge.
 *
 * `secret` keeps it off the players' log. It is refused for anybody who is not
 * staff, which is the same rule `session.ts` already applies to ordinary rolls;
 * a player cannot hide their own death save, because a hidden roll is a thing
 * the DM does *to* the table, not a thing a player does to their DM.
 *
 * The rules live in `character/lib/dying.ts`, pure and tested apart from this.
 */
/** What a death save hands back: the sheet after it, and the faces to draw. */
export interface DeathSaveResult {
  state: PlayState;
  /**
   * The roll as the log has it, so the tray can draw the server's faces. Two
   * rolls for one save — one on the server for the record, one in the browser
   * for the animation — is how a log and a screen start disagreeing, and it
   * did: the log said 7 and the tray said 19.
   */
  roll: NotationRoll;
  /** The face came off a real die. */
  physical: boolean;
}

export async function rollDeathSave(
  characterId: string,
  campaignId: string | null,
  options: { mode?: DeathSaveMode; secret?: boolean; faces?: number[] } = {}
): Promise<DeathSaveResult> {
  const { character, canEdit, isStaff } = await authorize(
    characterId,
    campaignId
  );
  if (!canEdit) throw new Error('FORBIDDEN');
  const claimed = await claimedFaces(campaignId, isStaff, options.faces);

  const sheet = character.sheet as CharacterSheet;
  const combat = { ...sheet.combat };

  const state = dyingState(combat.hitPointsCurrent, {
    successes: combat.deathSaveSuccesses,
    failures: combat.deathSaveFailures,
    stable: combat.stable,
  });
  // Rolling when you are not dying is not a correction, it is a mistake — and
  // silently accepting it would put a failure on a conscious character.
  if (state !== 'dying') throw new Error('NOT_DYING');

  const mode = options.mode ?? 'straight';
  // Staff only, checked here rather than trusted from the client.
  let secret = false;
  if (options.secret) {
    if (!campaignId) throw new Error('SECRET_NEEDS_A_TABLE');
    const { role } = await requireCampaignRole(campaignId, [
      'gm',
      'co-gm',
      'player',
    ]);
    // Its own code, not FORBIDDEN: the sheet *is* theirs, and being told
    // otherwise is a confusing answer to "why can't I hide this roll".
    if (role !== 'gm' && role !== 'co-gm') {
      throw new Error('SECRET_IS_STAFF_ONLY');
    }
    secret = true;
  }

  const dice = d20Faces(mode, claimed);
  if (!dice) throw new Error('BAD_FACES');
  const outcome = applyDeathSave(
    {
      successes: combat.deathSaveSuccesses,
      failures: combat.deathSaveFailures,
      stable: combat.stable,
    },
    dice,
    mode
  );

  combat.deathSaveSuccesses = outcome.tracks.successes;
  combat.deathSaveFailures = outcome.tracks.failures;
  combat.stable = outcome.tracks.stable;
  if (outcome.hpCurrent !== null) {
    combat.hitPointsCurrent = outcome.hpCurrent;
  }
  // The die that did not count is shown as dropped, so a reader can see the
  // advantage rather than being told the total.
  const dropped = dice.length === 2 ? [dice[0] === outcome.result ? 1 : 0] : [];

  const next: CharacterSheet = { ...sheet, combat };

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  await db
    .update(initiativeEntries)
    .set({ hpCurrent: combat.hitPointsCurrent })
    .where(eq(initiativeEntries.characterId, characterId));

  if (campaignId) {
    await db.insert(campaignRolls).values({
      campaignId,
      actorUserId: character.ownerId,
      characterId,
      actorName: character.name,
      label: `Death save — ${outcome.summary}`,
      notation: mode === 'straight' ? '1d20' : '2d20',
      dice,
      dropped,
      modifier: 0,
      total: outcome.result,
      visibility: secret ? 'dm' : 'table',
      physical: claimed !== undefined,
    });
    bumpVersion(campaignId);
  }

  /*
   * A death save that stabilises or kills is the loudest thing that happens at
   * a table, and it is announced even when the roll itself was secret: the
   * roll is the DM's business, the outcome is the party's. `state` was read
   * before the write, so a third failure announces once.
   */
  announceVitals(
    campaignId,
    { id: characterId, name: character.name },
    state,
    dyingState(combat.hitPointsCurrent, {
      successes: combat.deathSaveSuccesses,
      failures: combat.deathSaveFailures,
      stable: combat.stable,
    })
  );

  return {
    state: await playStateOf(
      { ...character, sheet: next },
      canEdit,
      campaignId,
      isStaff
    ),
    roll: {
      notation: mode === 'straight' ? '1d20' : '2d20',
      dice,
      dropped,
      modifier: 0,
      total: outcome.result,
    },
    physical: claimed !== undefined,
  };
}

/**
 * Spend hit dice on a short rest.
 *
 * The dice are rolled **on the server** and written to the shared roll log, so
 * the table watches a rogue roll 3 and 2 on their d8s rather than being told a
 * number. That is the same rule `campaign_rolls` exists for: a total the
 * browser produced is a claim about a roll, not a record of one.
 *
 * Each die heals its roll plus the character's Constitution modifier, never
 * below zero for that die — a Con of 6 costs you nothing extra, it just stops
 * helping (2024 PHB).
 */
export interface HitDiceResult {
  state: PlayState;
  /** The dice as the log has them, so the tray draws the server's faces. */
  roll: NotationRoll;
  physical: boolean;
}

export async function spendHitDice(
  characterId: string,
  campaignId: string | null,
  count: number,
  faces?: number[]
): Promise<HitDiceResult> {
  const { character, canEdit, isStaff } = await authorize(
    characterId,
    campaignId
  );
  if (!canEdit) throw new Error('FORBIDDEN');
  const claimed = await claimedFaces(campaignId, isStaff, faces);

  const sheet = character.sheet as CharacterSheet;
  const combat = { ...sheet.combat };

  const available = Math.max(0, combat.hitDiceMax - combat.hitDiceSpent);
  const spending = Math.max(0, Math.min(available, Math.trunc(count) || 0));
  if (spending === 0) throw new Error('NO_HIT_DICE');

  const conMod = abilityModifier(sheet.abilities?.constitution?.score ?? 10);
  const size = combat.hitDieSize || 8;

  // One face per die spent, each within the die, or the server's own.
  if (
    claimed &&
    (claimed.length !== spending ||
      !claimed.every(f => Number.isInteger(f) && f >= 1 && f <= size))
  ) {
    throw new Error('BAD_FACES');
  }
  const dice: number[] = [];
  let healed = 0;
  for (let i = 0; i < spending; i++) {
    const roll = claimed ? claimed[i] : rollDie(size);
    dice.push(roll);
    healed += Math.max(0, roll + conMod);
  }

  combat.hitDiceSpent = combat.hitDiceSpent + spending;
  combat.hitPointsCurrent = Math.min(
    combat.hitPointsMax,
    combat.hitPointsCurrent + healed
  );
  // Back on your feet, so the death-save tracks go — the same rule the rest of
  // the play patch follows.
  if (combat.hitPointsCurrent > 0) {
    combat.deathSaveSuccesses = 0;
    combat.deathSaveFailures = 0;
  }

  const next: CharacterSheet = { ...sheet, combat };
  const notation = `${spending}d${size}${conMod >= 0 ? '+' : ''}${conMod * spending}`;

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  await db
    .update(initiativeEntries)
    .set({
      hpCurrent: combat.hitPointsCurrent,
      hpMax: combat.hitPointsMax,
      hpTemp: combat.hitPointsTemp,
    })
    .where(eq(initiativeEntries.characterId, characterId));

  if (campaignId) {
    await db.insert(campaignRolls).values({
      campaignId,
      actorUserId: character.ownerId,
      characterId,
      actorName: character.name,
      label: `Short rest — ${spending} hit di${spending === 1 ? 'e' : 'ce'}`,
      notation,
      dice,
      dropped: [],
      modifier: conMod * spending,
      total: healed,
      visibility: 'table',
      physical: claimed !== undefined,
    });
    bumpVersion(campaignId);
  }

  return {
    state: await playStateOf(
      { ...character, sheet: next },
      canEdit,
      campaignId,
      isStaff
    ),
    roll: {
      notation,
      dice,
      dropped: [],
      modifier: conMod * spending,
      total: healed,
    },
    physical: claimed !== undefined,
  };
}

/**
 * The write a confirmed rest makes, for the rest flow (`server/rests.ts`), which
 * has already checked who is confirming. Never exported to an action.
 */
export async function applyRestUnchecked(
  campaignId: string,
  kind: 'short' | 'long'
): Promise<{ rested: number; characterIds: string[] }> {
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

  let rested = 0;
  for (const row of rows) {
    const sheet = row.character.sheet as CharacterSheet;
    const combat = { ...sheet.combat };
    const spellcasting = {
      ...sheet.spellcasting,
      slots: { ...sheet.spellcasting.slots },
    };

    if (kind === 'long') {
      combat.hitPointsCurrent = combat.hitPointsMax;
      combat.hitPointsTemp = 0;
      combat.deathSaveSuccesses = 0;
      combat.deathSaveFailures = 0;
      combat.hitDiceSpent = Math.max(
        0,
        combat.hitDiceSpent - Math.max(1, Math.floor(combat.hitDiceMax / 2))
      );
      combat.exhaustion = Math.max(0, (combat.exhaustion ?? 0) - 1);
      // 2024: a human wakes inspired (10). Anybody else keeps what they had.
      if (regainsInspirationOnLongRest(sheet.identity.species)) {
        combat.heroicInspiration = true;
      }
      for (const key of SLOT_KEYS) {
        spellcasting.slots[key] = { ...spellcasting.slots[key], expended: 0 };
      }
    } else {
      // A short rest restores temporary hit points to nobody and slots to
      // nobody: what it actually clears is the fight, and the hit dice are
      // spent by their owners.
      combat.hitPointsTemp = 0;
    }

    const next: CharacterSheet = { ...sheet, combat, spellcasting };
    await db
      .update(characters)
      .set({ sheet: next, updatedAt: new Date().toISOString() })
      .where(eq(characters.id, row.character.id));
    await db
      .update(initiativeEntries)
      .set({
        hpCurrent: combat.hitPointsCurrent,
        hpMax: combat.hitPointsMax,
        hpTemp: combat.hitPointsTemp,
      })
      .where(eq(initiativeEntries.characterId, row.character.id));
    rested += 1;
  }

  // Anything measured in rounds is over after eight hours; a curse with no
  // clock on it is not a nap away. `clearRestedEffects` draws that line and
  // tells the table what lifted.
  if (kind === 'long') {
    await clearRestedEffects(
      campaignId,
      rows.map(r => r.character.id)
    );
  }
  // A rest readies every recharge on the other side too (11).
  await readyAllRecharges(campaignId);

  bumpVersion(campaignId);
  return { rested, characterIds: rows.map(r => r.character.id) };
}

/** Set the conditions the tracker has this character under. Staff only. */
export async function setPlayConditions(
  characterId: string,
  campaignId: string,
  keys: string[]
): Promise<void> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  await writeConditions(characterId, keys);
  bumpVersion(campaignId);
}

/**
 * A player setting their own conditions, with or without a table.
 *
 * The DM's route is `setPlayConditions`, which is staff-only and campaign
 * scoped. This one authorises the way every other play control does, so a hero
 * who is poisoned between sessions can say so on their own sheet.
 */
export async function setOwnConditions(
  characterId: string,
  campaignId: string | null,
  keys: string[]
): Promise<ConditionKey[]> {
  const { canEdit } = await authorize(characterId, campaignId);
  if (!canEdit) throw new Error('FORBIDDEN');
  const cleaned = await writeConditions(characterId, keys);
  if (campaignId) bumpVersion(campaignId);
  return cleaned;
}
