'use server';

import type { WeaponAttack } from '@/@creator/character/lib/derive';
import type { ContentEntry } from '@/@shared/content';
import { getEntryCreature, getMyAttacks, mySeat } from '@/server/fight';

export async function getMyAttacksAction(
  characterId: string,
  campaignId: string
): Promise<WeaponAttack[]> {
  try {
    return await getMyAttacks(characterId, campaignId);
  } catch {
    return [];
  }
}

export async function getEntryCreatureAction(
  entryId: string
): Promise<ContentEntry | null> {
  try {
    return await getEntryCreature(entryId);
  } catch {
    return null;
  }
}

export async function mySeatAction(campaignId: string): Promise<string | null> {
  try {
    return await mySeat(campaignId);
  } catch {
    return null;
  }
}
