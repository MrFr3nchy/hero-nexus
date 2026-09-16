import 'server-only';

import { encumbrance, type Encumbrance } from '@/@creator/character/lib/derive';
import type { CharacterSheet } from '@/@creator/character/schema';
import type { TableRules } from '@/@creator/campaign/lib/table-rules';
import { DEFAULT_TABLE_RULES } from '@/@creator/campaign/lib/table-rules';
import { resolveContentRefs } from './content';
import { effectiveRules } from './table-rules';

/**
 * What a character is carrying, weighed under the table's rule (09).
 *
 * One read of the content behind the pack, then the pure arithmetic. Null
 * when the table has encumbrance off — the spec's "nothing computed, nothing
 * shown" — and for a character at no table the defaults apply, so the sheet
 * still says what it weighs.
 */
export async function loadFor(
  sheet: CharacterSheet,
  campaignId: string | null,
  rules?: TableRules
): Promise<Encumbrance | null> {
  const r =
    rules ??
    (campaignId ? await effectiveRules(campaignId) : DEFAULT_TABLE_RULES);
  if (r.encumbrance === 'off') return null;
  const refs = (sheet.inventory ?? [])
    .map(i => i.ref)
    .filter(ref => ref !== null);
  const resolved = await resolveContentRefs(refs);
  return encumbrance(sheet, resolved, r.encumbrance);
}

/** Several sheets at once, one content read between them. */
export async function loadsFor(
  sheets: ReadonlyMap<string, CharacterSheet>,
  campaignId: string
): Promise<Map<string, Encumbrance | null>> {
  const out = new Map<string, Encumbrance | null>();
  const rules = await effectiveRules(campaignId);
  if (rules.encumbrance === 'off') {
    for (const id of sheets.keys()) out.set(id, null);
    return out;
  }
  const refs = [...sheets.values()].flatMap(s =>
    (s.inventory ?? []).map(i => i.ref).filter(ref => ref !== null)
  );
  const resolved = await resolveContentRefs(refs);
  for (const [id, sheet] of sheets) {
    out.set(id, encumbrance(sheet, resolved, rules.encumbrance));
  }
  return out;
}
