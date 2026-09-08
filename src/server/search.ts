import 'server-only';

import { listCanon } from './canon';
import { listSessions } from './campaign-sessions';
import { requireCampaignRole } from './campaigns';
import { getLedger, listQuests } from './quests';
import { getLiveState } from './session';

export type SearchKind = 'canon' | 'quest' | 'session' | 'handout' | 'loot';

export interface SearchHit {
  kind: SearchKind;
  /** The row's id, so the caller can send someone to it. */
  id: string;
  title: string;
  /** The matching line, with enough either side to recognise it. */
  excerpt: string;
  /** Which tab it lives on, as a word rather than a route. */
  where: string;
}

/**
 * One search box over a whole campaign.
 *
 * Six sessions in, a table's own record is spread over a canon, a quest log, a
 * chronicle, a pile of handouts and a ledger, and "what was that innkeeper
 * called" means opening five tabs and reading. This answers it once.
 *
 * **Built on the existing readers, deliberately.** `listCanon`, `listQuests`,
 * `listSessions`, `getLiveState` and `getLedger` each already decide what a
 * given viewer may see — a player gets no `dmBody`, no DM-only quest, no
 * unshared recap, no staff handout. Re-implementing those rules as a set of
 * `WHERE` clauses here would be a second copy of the most security-sensitive
 * logic in the app, and the copy is the one that would drift.
 *
 * So the rule this module keeps is simple and checkable: **search can only
 * ever find what the tab would have shown you.** It costs a handful of queries
 * that a single SQL sweep would not, which is the right trade for a box a
 * table uses a few times a night.
 */
export async function searchCampaign(
  campaignId: string,
  query: string
): Promise<SearchHit[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);

  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const hits: SearchHit[] = [];

  /** Push a hit when the haystack matches, with the match in context. */
  const consider = (
    kind: SearchKind,
    id: string,
    title: string,
    where: string,
    ...bodies: (string | null | undefined)[]
  ): void => {
    const inTitle = title.toLowerCase().includes(needle);
    const body = bodies.filter(Boolean).join('\n');
    const at = body.toLowerCase().indexOf(needle);
    if (!inTitle && at === -1) return;

    // A window around the match, not the first 120 characters of the row: the
    // point of an excerpt is to show the reader why this result is here.
    const excerpt =
      at === -1
        ? body.slice(0, 120)
        : `${at > 40 ? '…' : ''}${body.slice(Math.max(0, at - 40), at + 80).trim()}${
            at + 80 < body.length ? '…' : ''
          }`;

    hits.push({ kind, id, title: title || 'Untitled', excerpt, where });
  };

  const [canon, quests, sessions, live, ledger] = await Promise.all([
    listCanon(campaignId).catch(() => []),
    listQuests(campaignId).catch(() => []),
    listSessions(campaignId).catch(() => []),
    getLiveState(campaignId).catch(() => null),
    getLedger(campaignId).catch(() => null),
  ]);

  for (const entry of canon) {
    consider(
      'canon',
      entry.id,
      entry.title,
      'Canon',
      entry.partyBody,
      // Null for a player, which is exactly the point — the DM's half of an
      // entry is not searchable by somebody who cannot read it.
      entry.dmBody
    );
  }

  for (const quest of quests) {
    consider(
      'quest',
      quest.id,
      quest.title,
      'Quests',
      quest.summary,
      quest.dmNotes,
      quest.giver,
      quest.reward,
      ...quest.objectives.map(o => o.body)
    );
  }

  for (const session of sessions) {
    consider(
      'session',
      session.id,
      session.title || `Session ${session.number}`,
      'Chronicle',
      session.recapBody,
      session.prepBody
    );
  }

  for (const handout of live?.handouts ?? []) {
    consider('handout', handout.id, handout.title, 'Session', handout.body);
  }

  for (const item of ledger?.loot ?? []) {
    consider('loot', item.id, item.name, 'Party', item.notes);
  }

  return hits;
}
