import 'server-only';
import { and, eq } from 'drizzle-orm';

import {
  applyDamageWhileDown,
  clearDying,
  dyingState,
} from '@/@creator/character/lib/dying';

import { type CharacterSheet } from '@/@creator/character/schema';

import { db } from '@/db';
import { campaignMembers, characters, initiativeEntries } from '@/db/schema';
import { requireCampaignRole } from '../campaigns';
import { concentrationAfterDamage } from '../concentration';
import { bumpVersion } from '../live-hub';
import { loadsFor } from '../load';
import { requireUserId } from '../session-user';
import {
  SLOT_KEYS,
  announceVitals,
  authorize,
  clamp,
  conditionsFor,
  physicalFor,
  playStateOf,
  toPlayState,
} from './shared';
import type { PlayPatch, PlayState } from './shared';

/**
 * Reading a hero at the table, and patching the numbers that move in play.
 */
export async function getPlayState(
  characterId: string,
  campaignId: string | null
): Promise<PlayState> {
  const { character, canEdit, isStaff } = await authorize(
    characterId,
    campaignId
  );
  return playStateOf(character, canEdit, campaignId, isStaff);
}

/** Every party member's play state, for the DM's view of the table. */
export async function listPartyPlayState(
  campaignId: string
): Promise<PlayState[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const isStaff = role === 'gm' || role === 'co-gm';
  const userId = await requireUserId();

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

  const loads = await loadsFor(
    new Map(
      rows.map(r => [r.character.id, r.character.sheet as CharacterSheet])
    ),
    campaignId
  );
  const physical = await physicalFor(campaignId, isStaff);
  return Promise.all(
    rows.map(async r =>
      toPlayState(
        r.character,
        isStaff || r.character.ownerId === userId,
        await conditionsFor(r.character.id),
        loads.get(r.character.id) ?? null,
        physical
      )
    )
  );
}

/**
 * Apply a play-mode change to the sheet.
 *
 * HP arrives as a delta rather than a total, so two people pressing "−5" at
 * once costs ten hit points instead of one of them winning. Temp HP absorbs
 * damage first and is never restored by healing, matching the tracker.
 */
export async function applyPlayPatch(
  characterId: string,
  campaignId: string | null,
  patch: PlayPatch
): Promise<PlayState> {
  const { character, canEdit, isStaff } = await authorize(
    characterId,
    campaignId
  );
  if (!canEdit) throw new Error('FORBIDDEN');
  return applyPlayPatchUnchecked(
    character,
    campaignId,
    patch,
    canEdit,
    isStaff
  );
}

/**
 * The write behind `applyPlayPatch`, for server code that has already
 * decided who may — a spell landing on a hero whose player allowed it, a
 * proposed hit its target's player accepted. Never exported to an action.
 */
export async function applyPlayPatchUnchecked(
  character: typeof characters.$inferSelect,
  campaignId: string | null,
  patch: PlayPatch,
  canEdit = true,
  /** For the returned state's real-dice flag; the callers that ignore the state leave it. */
  isStaff = false
): Promise<PlayState> {
  const characterId = character.id;
  const sheet = character.sheet as CharacterSheet;
  const combat = { ...sheet.combat };
  const wasDying = dyingState(combat.hitPointsCurrent, {
    successes: combat.deathSaveSuccesses,
    failures: combat.deathSaveFailures,
    stable: combat.stable,
  });

  if (patch.longRest) {
    combat.hitPointsCurrent = combat.hitPointsMax;
    combat.hitPointsTemp = 0;
    combat.deathSaveSuccesses = 0;
    combat.deathSaveFailures = 0;
    // A long rest returns up to half the character's total hit dice, rounded
    // down, minimum one — 2024 PHB.
    const back = Math.max(1, Math.floor(combat.hitDiceMax / 2));
    combat.hitDiceSpent = Math.max(0, combat.hitDiceSpent - back);
    // And it removes one level of exhaustion. Forgetting this is how a party
    // carries a −2 on every roll for three sessions without noticing.
    combat.exhaustion = Math.max(0, (combat.exhaustion ?? 0) - 1);
  }

  if (patch.exhaustionDelta) {
    combat.exhaustion = clamp(
      (combat.exhaustion ?? 0) + patch.exhaustionDelta,
      0,
      6
    );
  }

  if (patch.hpCurrentDelta) {
    const delta = patch.hpCurrentDelta;
    if (delta < 0) {
      const damage = -delta;
      const fromTemp = Math.min(combat.hitPointsTemp, damage);
      combat.hitPointsTemp -= fromTemp;
      const toBody = damage - fromTemp;
      const hpBefore = combat.hitPointsCurrent;
      combat.hitPointsCurrent = Math.max(0, hpBefore - toBody);

      /*
       * A hit that lands on somebody already down is a death-save failure,
       * and a big enough one kills outright — both handled together, because
       * at a table they are one question: how much of that was left over.
       *
       * Temporary hit points are excluded from the reckoning on purpose: they
       * are not the character's own, so soaking a hit with them is not being
       * hit at 0. Only what reached the body counts.
       */
      const after = applyDamageWhileDown(
        {
          successes: combat.deathSaveSuccesses,
          failures: combat.deathSaveFailures,
          stable: combat.stable,
        },
        toBody,
        hpBefore,
        combat.hitPointsMax,
        patch.critical
      );
      combat.deathSaveSuccesses = after.tracks.successes;
      combat.deathSaveFailures = after.tracks.failures;
      combat.stable = after.tracks.stable;
    } else {
      combat.hitPointsCurrent = Math.min(
        combat.hitPointsMax,
        combat.hitPointsCurrent + delta
      );
    }
  }

  if (patch.hpTemp !== undefined) {
    combat.hitPointsTemp = clamp(patch.hpTemp, 0, 999);
  }
  if (patch.hitDiceSpent !== undefined) {
    combat.hitDiceSpent = clamp(patch.hitDiceSpent, 0, combat.hitDiceMax);
  }
  if (patch.deathSaveSuccesses !== undefined) {
    combat.deathSaveSuccesses = clamp(patch.deathSaveSuccesses, 0, 3);
  }
  if (patch.deathSaveFailures !== undefined) {
    combat.deathSaveFailures = clamp(patch.deathSaveFailures, 0, 3);
  }
  // Being conscious again ends the dying entirely — both tracks and the
  // stability flag. Leaving them filled is how a table forgets someone already
  // died once this fight, and leaving `stable` set is how a healed character
  // reads as unconscious on every surface that asks.
  if (combat.hitPointsCurrent > 0) {
    const cleared = clearDying();
    combat.deathSaveSuccesses = cleared.successes;
    combat.deathSaveFailures = cleared.failures;
    combat.stable = cleared.stable;
  }

  const spellcasting = {
    ...sheet.spellcasting,
    slots: { ...sheet.spellcasting.slots },
  };
  if (patch.slot) {
    const key = SLOT_KEYS[patch.slot.level - 1];
    if (key) {
      const current = spellcasting.slots[key];
      spellcasting.slots[key] = {
        ...current,
        expended: clamp(patch.slot.expended, 0, current.total),
      };
    }
  }
  if (patch.longRest) {
    for (const key of SLOT_KEYS) {
      spellcasting.slots[key] = { ...spellcasting.slots[key], expended: 0 };
    }
  }

  const next: CharacterSheet = { ...sheet, combat, spellcasting };

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  // Keep an active tracker row in step, so the DM's initiative list and the
  // player's own sheet never disagree about how hurt someone is.
  await db
    .update(initiativeEntries)
    .set({
      hpCurrent: combat.hitPointsCurrent,
      hpMax: combat.hitPointsMax,
      hpTemp: combat.hitPointsTemp,
      armorClass: combat.armorClass,
    })
    .where(eq(initiativeEntries.characterId, characterId));

  if (campaignId) bumpVersion(campaignId);
  announceVitals(
    campaignId,
    { id: characterId, name: character.name },
    wasDying,
    dyingState(combat.hitPointsCurrent, {
      successes: combat.deathSaveSuccesses,
      failures: combat.deathSaveFailures,
      stable: combat.stable,
    })
  );

  // Damage to somebody holding a spell asks for the save (07); at 0 hit
  // points the spell simply drops.
  if (campaignId && patch.hpCurrentDelta && patch.hpCurrentDelta < 0) {
    await concentrationAfterDamage(
      campaignId,
      { characterId },
      -patch.hpCurrentDelta,
      combat.hitPointsCurrent <= 0
    );
  }

  return playStateOf(
    { ...character, sheet: next },
    canEdit,
    campaignId,
    isStaff
  );
}
