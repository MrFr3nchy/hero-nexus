import 'server-only';

import {
  BOOK_TYPES,
  bookLine,
  isBookType,
  type BookHit,
  type BookType,
  type RecordKind,
} from '@/@creator/campaign/lib/lookup';
import type { CanonEntryRow } from '@/@creator/campaign/lib/canon';
import {
  refKey,
  sameRef,
  type ContentEntry,
  type ContentRef,
} from '@/@shared/content';
import { listSessions, type SessionRow } from './campaign-sessions';
import { listCampaignContent } from './campaign-content';
import { requireCampaignRole } from './campaigns';
import { listCanon } from './canon';
import { listShelfContent } from './content';
import { getLedger, listQuests, type LootRow, type QuestRow } from './quests';
import { getLiveState, type HandoutRow } from './session';

/**
 * What Search on the session screen may show from the books, and opening one.
 *
 * The same answer for listing and for opening, so nothing can be opened that
 * would not have been listed:
 *
 * - the reader's own shelf — the SRD, their homebrew, what they adopted —
 *   which is what `/spells` and `/bestiary` already show them;
 * - the campaign's library for spells, items and house rules, because
 *   content in play at a table is something its players may read;
 * - **not** the library's creatures, for a player. A DM's homebrew monster
 *   is a spoiler until it is on the board, and then the stat block panel is
 *   the DM's, not the party's.
 */
async function readable(
  campaignId: string,
  types: readonly BookType[]
): Promise<{ entry: ContentEntry; homebrew: boolean }[]> {
  const { role } = await requireCampaignRole(campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);
  const staff = role === 'gm' || role === 'co-gm';

  const [shelves, library] = await Promise.all([
    Promise.all(types.map(t => listShelfContent(t))),
    listCampaignContent(campaignId).catch(() => []),
  ]);

  const out = new Map<string, { entry: ContentEntry; homebrew: boolean }>();
  for (const item of shelves.flat()) {
    out.set(refKey(item.entry.ref), {
      entry: item.entry,
      homebrew: item.origin !== 'srd',
    });
  }
  for (const item of library) {
    const type = item.entry.type;
    if (!isBookType(type) || !types.includes(type)) continue;
    if (type === 'creature' && !staff) continue;
    out.set(refKey(item.entry.ref), { entry: item.entry, homebrew: true });
  }
  return [...out.values()];
}

/**
 * Every book entry this reader may look up, as one line each. Fetched once
 * per screen and filtered in the browser: a list of names, never the stat
 * blocks behind them.
 */
export async function bookIndex(campaignId: string): Promise<BookHit[]> {
  const rows = await readable(campaignId, BOOK_TYPES);
  return rows
    .map(({ entry, homebrew }) => ({
      ref: entry.ref,
      name: entry.name,
      line: bookLine(entry),
      homebrew,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One book entry in full — only if `bookIndex` would have listed it. */
export async function openBook(
  campaignId: string,
  ref: ContentRef
): Promise<ContentEntry | null> {
  if (!isBookType(ref.type)) return null;
  const rows = await readable(campaignId, [ref.type]);
  return rows.find(r => sameRef(r.entry.ref, ref))?.entry ?? null;
}

/** One record of the campaign, as the tab it lives on would show it. */
export type RecordLookup =
  | {
      record: 'canon';
      entry: CanonEntryRow;
      /** Where it is — a person's home, the place a place sits inside — when the reader may see it. */
      place: { id: string; title: string } | null;
    }
  | { record: 'quest'; quest: QuestRow }
  | { record: 'session'; session: SessionRow }
  | { record: 'handout'; handout: HandoutRow }
  | { record: 'loot'; loot: LootRow };

/**
 * Open a record Search found. Built on the same role-filtered readers as
 * `searchCampaign`, so it can only open what search could have found: a
 * player asking for a hidden canon entry by id gets nothing, and a player's
 * copy of an entry carries no DM body.
 */
export async function openRecord(
  campaignId: string,
  record: RecordKind,
  id: string
): Promise<RecordLookup | null> {
  switch (record) {
    case 'canon': {
      const all = await listCanon(campaignId);
      const entry = all.find(e => e.id === id);
      if (!entry) return null;
      // From the same role-filtered list, so a player is never told the name
      // of a place they have not been shown.
      const home = entry.placeId
        ? all.find(e => e.id === entry.placeId)
        : undefined;
      return {
        record,
        entry,
        place: home ? { id: home.id, title: home.title } : null,
      };
    }
    case 'quest': {
      const quest = (await listQuests(campaignId)).find(q => q.id === id);
      return quest ? { record, quest } : null;
    }
    case 'session': {
      const session = (await listSessions(campaignId)).find(s => s.id === id);
      return session ? { record, session } : null;
    }
    case 'handout': {
      const live = await getLiveState(campaignId);
      const handout = live?.handouts.find(h => h.id === id);
      return handout ? { record, handout } : null;
    }
    case 'loot': {
      const ledger = await getLedger(campaignId);
      const loot = ledger?.loot.find(l => l.id === id);
      return loot ? { record, loot } : null;
    }
    default:
      return null;
  }
}
