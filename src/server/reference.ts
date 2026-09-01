import 'server-only';

import { asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { referenceData, rpgSystems } from '@/db/schema';

export interface ReferenceEntry {
  slug: string;
  name: string;
  data: unknown;
}

/**
 * SRD reference rows for a category, e.g. 'class', 'species', 'background',
 * 'skill', 'ability-score', 'alignment', 'language', 'feat', 'equipment'.
 * Loaded by `npm run db:seed` from `data/srd/`.
 */
export async function getReference(
  category: string
): Promise<ReferenceEntry[]> {
  const rows = await db
    .select({
      slug: referenceData.slug,
      name: referenceData.name,
      data: referenceData.data,
    })
    .from(referenceData)
    .where(eq(referenceData.category, category))
    .orderBy(asc(referenceData.name));
  return rows as ReferenceEntry[];
}

export async function listRpgSystems() {
  return db.select().from(rpgSystems).orderBy(asc(rpgSystems.name));
}
