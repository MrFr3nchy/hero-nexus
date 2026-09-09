import 'server-only';

import {
  fromReference,
  parseContentData,
  refKey,
  REFERENCE_CATEGORIES,
  type ContentEntry,
  type ContentRef,
  type ContentType,
  type CreatureData,
  type ShelfItem,
} from '@/@shared/content';

import { listCampaignContent } from './campaign-content';
import { getHomebrewByIds, listHomebrew, toContentEntries } from './homebrew';
import { getReference } from './reference';

/**
 * Loading content out of the two places it lives.
 *
 * `@/server/reference` reads the SRD rows and `@/server/homebrew` reads the
 * authored ones; this module is where they stop being two things. Callers ask
 * for a `ContentType` and get `ContentEntry[]`, with no idea which source each
 * came from — that is the whole point of `@/@shared/content`.
 */

/** The `reference_data` categories that carry a given content type. */
const CATEGORIES_FOR: Record<ContentType, string[]> = {
  class: ['class'],
  // Open5e mixes subclasses into `classes`; `fromReference` skips them, so
  // there is no SRD source for a standalone subclass entry today.
  subclass: [],
  species: ['species'],
  background: ['background'],
  feat: ['feat'],
  spell: ['spell'],
  item: ['magic-item', 'weapon', 'armor'],
  creature: ['creature'],
};

/** Every SRD entry of one type, adapted and sorted by name. */
export async function listSrdContent(
  type: ContentType
): Promise<ContentEntry[]> {
  const categories = CATEGORIES_FOR[type] ?? [];
  const pages = await Promise.all(
    categories.map(async category => {
      const rows = await getReference(category);
      return rows
        .map(row => fromReference(category, row))
        .filter((e): e is ContentEntry => e !== null);
    })
  );
  return pages.flat().sort((a, b) => a.name.localeCompare(b.name));
}

/** Every SRD entry across every category this app models as content. */
export async function listAllSrdContent(): Promise<ContentEntry[]> {
  const categories = [...new Set(Object.keys(REFERENCE_CATEGORIES))];
  const pages = await Promise.all(
    categories.map(async category => {
      const rows = await getReference(category);
      return rows
        .map(row => fromReference(category, row))
        .filter((e): e is ContentEntry => e !== null);
    })
  );
  return pages.flat();
}

/**
 * Resolve a batch of refs to entries.
 *
 * Batched on purpose: a sheet carrying twenty items must not become twenty
 * queries. Refs that no longer resolve — a homebrew row its author deleted —
 * are simply absent from the result, and the caller decides how to show the
 * gap. Never throws on a dangling ref.
 */
export async function resolveContentRefs(
  refs: ContentRef[]
): Promise<Map<string, ContentEntry>> {
  const out = new Map<string, ContentEntry>();
  if (refs.length === 0) return out;

  const homebrewIds = [
    ...new Set(refs.filter(r => r.source === 'homebrew').map(r => r.key)),
  ];

  // Matched on `refKey`, which includes the type: an SRD slug is unique only
  // within its category, so `srd-2024_shield` names both a piece of armour and
  // a spell. Keying on the slug alone handed back whichever loaded last.
  const wanted = new Set(refs.map(refKey));

  if (homebrewIds.length > 0) {
    for (const entry of toContentEntries(await getHomebrewByIds(homebrewIds))) {
      if (wanted.has(refKey(entry.ref))) out.set(refKey(entry.ref), entry);
    }
  }

  if (refs.some(r => r.source === 'srd')) {
    for (const entry of await listAllSrdContent()) {
      if (wanted.has(refKey(entry.ref))) out.set(refKey(entry.ref), entry);
    }
  }

  return out;
}

/**
 * What one player may pick from, for a given content type.
 *
 * Three sources, in the order a picker should show them:
 *
 *   1. The SRD.
 *   2. The player's own homebrew — theirs to use on their own characters.
 *   3. Whatever the campaign has in play, when building for a table.
 *
 * A campaign's library is included whole rather than filtered to approved
 * submissions, because that *is* what the library means: everything in it has
 * either been approved or was put there by the DM.
 */
export async function listPickableContent(
  type: ContentType,
  campaignId?: string
): Promise<ContentEntry[]> {
  const [srd, own, library] = await Promise.all([
    listSrdContent(type),
    listHomebrew().catch(() => []),
    campaignId
      ? listCampaignContent(campaignId).catch(() => [])
      : Promise.resolve([]),
  ]);

  const out = new Map<string, ContentEntry>();
  for (const entry of srd)
    out.set(`${entry.ref.source}:${entry.ref.key}`, entry);
  for (const entry of toContentEntries(own)) {
    if (entry.type === type) out.set(`homebrew:${entry.ref.key}`, entry);
  }
  for (const item of library) {
    if (item.entry.type === type) {
      out.set(`homebrew:${item.entry.ref.key}`, item.entry);
    }
  }

  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One compendium shelf: everything of a type this reader may look at.
 *
 * Two sources today — the SRD, and the reader's own homebrew — and a third
 * reserved: content adopted from the market, which is other people's public
 * homebrew sitting on your shelf. Nothing writes that yet (the market lists
 * and copies nothing), so the `shared` branch is the seam, not a feature: when
 * adoption lands it is one more source merged here, and the shelf page, its
 * filters and its "yours to edit" action already read `origin` rather than
 * guessing from `ref.source`.
 *
 * Not `listPickableContent`: that answers "what may this player put on a
 * sheet", which folds in a campaign's library — content that belongs to a
 * table you play at, not to you, and which has no business on your shelf when
 * you are not building for that table.
 */
export async function listShelfContent(
  type: ContentType
): Promise<ShelfItem[]> {
  const [srd, own] = await Promise.all([
    listSrdContent(type),
    // Signed out — the compendium still renders — there is no own homebrew,
    // and a thrown session error must not take the shelf down with it.
    listHomebrew().catch(() => []),
  ]);

  const items = new Map<string, ShelfItem>();
  for (const entry of srd) {
    items.set(refKey(entry.ref), { entry, origin: 'srd' });
  }
  for (const entry of toContentEntries(own)) {
    if (entry.type !== type) continue;
    items.set(refKey(entry.ref), { entry, origin: 'mine' });
  }

  return [...items.values()].sort((a, b) =>
    a.entry.name.localeCompare(b.entry.name)
  );
}

/**
 * One line per monster a DM might drop into a fight.
 *
 * Deliberately not `ContentEntry[]`: the tracker's picker needs a name and the
 * four numbers that go on an initiative row, and shipping 300 full stat blocks
 * — every trait, every action, every legendary action — down to a dropdown is
 * megabytes to render a list of names.
 */
export interface CombatantChoice {
  /** `refKey` of the creature — unique, so it keys the list. */
  key: string;
  /** Sent straight back when the DM picks it; never rebuilt from `key`. */
  ref: ContentRef;
  name: string;
  challengeRating: number;
  armorClass: number;
  hitPoints: number;
  initiativeBonus: number;
  isHomebrew: boolean;
}

export async function listCombatantChoices(
  campaignId?: string
): Promise<CombatantChoice[]> {
  const entries = await listPickableContent('creature', campaignId);
  return entries.map(entry => {
    const d = parseContentData('creature', entry.data) as CreatureData;
    return {
      key: refKey(entry.ref),
      ref: entry.ref,
      name: entry.name,
      challengeRating: d.challenge_rating,
      armorClass: d.armor_class,
      hitPoints: d.hit_points,
      initiativeBonus: d.initiative_bonus,
      isHomebrew: entry.ref.source === 'homebrew',
    };
  });
}
