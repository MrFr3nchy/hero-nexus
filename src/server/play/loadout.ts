import 'server-only';
import { and, eq } from 'drizzle-orm';

import {
  encumbrance,
  itemUseWords,
  type Encumbrance,
  armorClass,
} from '@/@creator/character/lib/derive';
import { MAX_ATTUNED, type CharacterSheet } from '@/@creator/character/schema';
import { parseContentData, refKey } from '@/@shared/content';

import { resolveContentRefs } from '../content';

import { db } from '@/db';
import { campaignMembers, characters, initiativeEntries } from '@/db/schema';
import { bumpVersion } from '../live-hub';
import { effectiveRules, fence } from '../table-rules';
import { spendWeaponSwap } from '../turn';
import { DEFAULT_TABLE_RULES } from '@/@creator/campaign/lib/table-rules';
import { authorize } from './shared';

/**
 * The loadout — what is in hand and what is prepared today.
 */
/**
 * One inventory row, as play mode needs it.
 *
 * Deliberately not the whole `InventoryItem`: play mode toggles what is in
 * hand, it does not edit the line. Adding a longsword to your pack is a
 * builder job — you do it between sessions — while drawing the one you are
 * already carrying is a table job, and the difference is what keeps this
 * surface safe to hand someone mid-fight.
 */
export interface LoadoutItem {
  id: string;
  name: string;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  /** Whether the content behind it says attunement is required. */
  requiresAttunement: boolean;
  /** Pounds for the whole row — quantity × the item's weight; 0 when unknown (09). */
  weight: number;
  /** Whether *Use* does anything: a `use` block, or charges to spend (09). */
  usable: boolean;
  /** What using it does, in a few words. Empty when not usable. */
  useWords: string;
  /** Whether it is a potion or the like — used on the *Use* button's verb. */
  consumable: boolean;
}

/** One spell, as play mode needs it. */
export interface LoadoutSpell {
  /** `refKey(ref)` — the type-carrying key, never the bare slug. */
  key: string;
  name: string;
  level: number;
  prepared: boolean;
  alwaysPrepared: boolean;
}

/** What is in the purse. Mirrors `sheet.currency`. */
export type Coins = CharacterSheet['currency'];
export type CoinKey = keyof Coins;
export const COIN_KEYS: CoinKey[] = ['pp', 'gp', 'ep', 'sp', 'cp'];

/** Somebody a thing can be handed to: another character seated at the table. */
export interface Seat {
  characterId: string;
  name: string;
}

export interface PlayLoadout {
  canEdit: boolean;
  items: LoadoutItem[];
  spells: LoadoutSpell[];
  attunedCount: number;
  maxAttuned: number;
  /**
   * Whether the attunement cap is a fence or advice at this table. The
   * table's Advise / Enforce switch, read once here so the control can say
   * in advance what the server will do. A character at no table is advised.
   */
  attunementEnforced: boolean;
  currency: Coins;
  /** The pack against the hero's capacity (09); null where the table does not weigh. */
  weight: Encumbrance | null;
  /**
   * The other characters seated at this table, for the *Give* control. Empty
   * with no campaign, and empty when the character sits alone — in both
   * cases there is nobody to hand anything to, and the control stays off.
   */
  others: Seat[];
}

/** What a loadout control may change. One toggle per call. */
export interface LoadoutPatch {
  equip?: { itemId: string; equipped: boolean };
  attune?: { itemId: string; attuned: boolean };
  prepare?: { key: string; prepared: boolean };
  /** Staff overruling a refusal. Ignored from anybody else. */
  ruling?: boolean;
}

/** Every other character seated at a table, by the unique member index. */
export async function othersAt(
  campaignId: string,
  characterId: string
): Promise<Seat[]> {
  const rows = await db
    .select({ id: characters.id, name: characters.name })
    .from(campaignMembers)
    .innerJoin(characters, eq(characters.id, campaignMembers.characterId))
    .where(
      and(
        eq(campaignMembers.campaignId, campaignId),
        eq(campaignMembers.status, 'active')
      )
    );
  return rows
    .filter(r => r.id !== characterId)
    .map(r => ({ characterId: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The character's gear and spell list, with the content behind each row
 * resolved so attunement and spell level are known.
 */
export async function getPlayLoadout(
  characterId: string,
  campaignId: string | null
): Promise<PlayLoadout> {
  const { character, canEdit } = await authorize(characterId, campaignId);
  const sheet = character.sheet as CharacterSheet;

  const refs = [
    ...sheet.inventory.map(i => i.ref).filter(r => r !== null),
    ...sheet.spellcasting.spells.map(s => s.ref),
  ];
  const [resolved, others, rules] = await Promise.all([
    resolveContentRefs(refs),
    campaignId ? othersAt(campaignId, characterId) : Promise.resolve([]),
    campaignId
      ? effectiveRules(campaignId)
      : Promise.resolve(DEFAULT_TABLE_RULES),
  ]);

  return {
    canEdit,
    maxAttuned: MAX_ATTUNED,
    attunementEnforced: campaignId !== null && rules.mode === 'enforce',
    attunedCount: sheet.inventory.filter(i => i.attuned).length,
    currency: { ...sheet.currency },
    weight:
      rules.encumbrance === 'off'
        ? null
        : encumbrance(sheet, resolved, rules.encumbrance),
    others,
    items: sheet.inventory.map(item => {
      const entry = item.ref ? resolved.get(refKey(item.ref)) : undefined;
      const data =
        entry && entry.type === 'item'
          ? parseContentData('item', entry.data)
          : null;
      const charges = data?.charges ?? 0;
      return {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        equipped: item.equipped,
        attuned: item.attuned,
        requiresAttunement: Boolean(data?.requires_attunement),
        weight: Math.round((data?.weight ?? 0) * item.quantity * 10) / 10,
        usable: Boolean(data?.use) || charges > 0,
        useWords: itemUseWords(data?.use, charges, item.charges),
        consumable: data?.kind === 'consumable',
      };
    }),
    spells: sheet.spellcasting.spells.map(spell => {
      const entry = resolved.get(refKey(spell.ref));
      const data =
        entry && entry.type === 'spell'
          ? parseContentData('spell', entry.data)
          : null;
      return {
        key: refKey(spell.ref),
        name: spell.ref.name,
        // An unresolved spell reports level -1 rather than 0, so it sorts to
        // its own group instead of masquerading as a cantrip.
        level: data ? data.level : -1,
        prepared: spell.prepared,
        alwaysPrepared: spell.alwaysPrepared,
      };
    }),
  };
}

/**
 * Toggle one thing in the loadout.
 *
 * Writes straight through, like every other play control — there is no save
 * button at a table. The attunement cap is checked here rather than trusted
 * to the control, because the control is the thing an over-attuned sheet gets
 * past — and it is checked through the table's fence, so a table that is
 * advising is told about the fourth item and allowed it, and a table that is
 * enforcing refuses unless the DM rules otherwise.
 */
export async function applyLoadoutPatch(
  characterId: string,
  campaignId: string | null,
  patch: LoadoutPatch
): Promise<PlayLoadout> {
  const { character, canEdit, isStaff } = await authorize(
    characterId,
    campaignId
  );
  if (!canEdit) throw new Error('FORBIDDEN');

  const sheet = character.sheet as CharacterSheet;
  let inventory = sheet.inventory;
  let spells = sheet.spellcasting.spells;

  if (patch.equip) {
    const { itemId, equipped } = patch.equip;
    inventory = inventory.map(i => (i.id === itemId ? { ...i, equipped } : i));
    // Mid-fight, on your own turn, the swap costs the free hand — and the
    // second one the action (05). Off your turn or off the table, nothing.
    if (campaignId) {
      await spendWeaponSwap(characterId, campaignId, {
        isStaff,
        ruling: patch.ruling,
      });
    }
  }

  if (patch.attune) {
    const { itemId, attuned } = patch.attune;
    if (attuned) {
      const already = inventory.filter(
        i => i.attuned && i.id !== itemId
      ).length;
      if (already >= MAX_ATTUNED) {
        // No table, no rules to enforce: a character on nobody's sheet but
        // their own is advised, the same as a table on the default.
        const rules = campaignId
          ? await effectiveRules(campaignId)
          : DEFAULT_TABLE_RULES;
        fence('ATTUNEMENT_FULL', rules, { isStaff, ruling: patch.ruling });
      }
    }
    inventory = inventory.map(i => (i.id === itemId ? { ...i, attuned } : i));
  }

  if (patch.prepare) {
    const { key, prepared } = patch.prepare;
    spells = spells.map(s =>
      refKey(s.ref) === key && !s.alwaysPrepared ? { ...s, prepared } : s
    );
  }

  const next: CharacterSheet = {
    ...sheet,
    inventory,
    spellcasting: { ...sheet.spellcasting, spells },
  };

  // Armour class follows what is worn, so equipping a shield has to move it —
  // otherwise the sheet says 16 while the tracker says 14 and the DM believes
  // the tracker.
  const resolved = await resolveContentRefs(
    inventory.map(i => i.ref).filter(r => r !== null)
  );
  next.combat = { ...next.combat, armorClass: armorClass(next, resolved) };

  await db
    .update(characters)
    .set({ sheet: next, updatedAt: new Date().toISOString() })
    .where(eq(characters.id, characterId));

  await db
    .update(initiativeEntries)
    .set({ armorClass: next.combat.armorClass })
    .where(eq(initiativeEntries.characterId, characterId));

  if (campaignId) bumpVersion(campaignId);

  return getPlayLoadout(characterId, campaignId);
}
