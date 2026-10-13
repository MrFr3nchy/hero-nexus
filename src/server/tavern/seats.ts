import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import { gamingSetProficient } from '@/@creator/campaign/lib/tavern';
import { purseInCp } from '@/@creator/character/lib/coins';
import type { CharacterSheet } from '@/@creator/character/schema';
import { db } from '@/db';
import { canonEntries, characters } from '@/db/schema';
import { requireCampaignRole } from '../campaigns';

/** Who could sit at a tavern game here, for the DM opening one. */
export interface TavernSeatChoices {
  npcs: { id: string; name: string; attitude: string | null; stat: boolean }[];
  heroes: {
    id: string;
    name: string;
    purseCp: number;
    dice: boolean;
    cards: boolean;
  }[];
}

/**
 * Staff only: an NPC's attitude is the DM's, and a hero's purse is shown so
 * the DM can see who could cover an ante before asking.
 */
export async function tavernSeatChoices(
  campaignId: string
): Promise<TavernSeatChoices> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const [npcs, heroes] = await Promise.all([
    db
      .select()
      .from(canonEntries)
      .where(
        and(
          eq(canonEntries.campaignId, campaignId),
          eq(canonEntries.kind, 'npc')
        )
      )
      .orderBy(asc(canonEntries.title)),
    db
      .select()
      .from(characters)
      .where(eq(characters.campaignId, campaignId))
      .orderBy(asc(characters.name)),
  ]);
  return {
    npcs: npcs.map(n => ({
      id: n.id,
      name: n.title,
      attitude: n.attitude ?? null,
      stat: Boolean(n.statSource && n.statKey),
    })),
    heroes: heroes.map(h => {
      const sheet = h.sheet as CharacterSheet;
      const tools = sheet.proficiencies?.tools ?? '';
      return {
        id: h.id,
        name: h.name,
        purseCp: purseInCp(sheet.currency ?? {}),
        dice: gamingSetProficient(tools, 'liars-dice'),
        cards: gamingSetProficient(tools, 'crowns'),
      };
    }),
  };
}
