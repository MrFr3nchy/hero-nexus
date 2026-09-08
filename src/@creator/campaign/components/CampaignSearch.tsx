'use client';

import { Input } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { Glyph } from '@/@shared/components/ui';
import type { SearchHit } from '@/server/search';
import { searchCampaignAction } from '../search-actions';

const KIND_GLYPH = {
  canon: 'tome',
  quest: 'scroll',
  session: 'notebook',
  handout: 'letter',
  loot: 'coins',
} as const;

/**
 * One box over the whole table's record.
 *
 * Six sessions in, "what was that innkeeper called" means opening five tabs
 * and reading. The results say which tab a hit lives on rather than linking
 * into it: this sits above a tab strip, and a link that changed the tab under
 * someone mid-search is worse than a word telling them where to look.
 */
export function CampaignSearch({ campaignId }: { campaignId: string }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    // Typing is faster than a round trip; only the newest answer is allowed to
    // land, or a slow early query overwrites a fast later one.
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await searchCampaignAction(campaignId, query);
      setSearching(false);
      if (mine === seq.current) setHits(found);
    }, 250);
    return () => clearTimeout(timer);
  }, [campaignId, query]);

  return (
    <div className="mb-4">
      <Input
        size="sm"
        aria-label="Search this campaign"
        placeholder="Search the table's record — an innkeeper, a thread, a night"
        value={query}
        onValueChange={setQuery}
        isClearable
        onClear={() => setQuery('')}
        startContent={
          <Glyph name="magnifier" size={15} className="text-ink-subtle" />
        }
      />

      {hits !== null && (
        <div className="mt-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
          {hits.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              {searching ? 'Looking…' : 'Nothing by that name.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {hits.slice(0, 12).map(hit => (
                <li key={`${hit.kind}-${hit.id}`} className="flex gap-2">
                  <Glyph
                    name={KIND_GLYPH[hit.kind]}
                    size={14}
                    className="mt-0.5 shrink-0 text-gold"
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm text-ink">{hit.title}</span>
                      <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle">
                        {hit.where}
                      </span>
                    </div>
                    {hit.excerpt && (
                      <p className="truncate text-xs text-ink-muted">
                        {hit.excerpt}
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {hits.length > 12 && (
                <li className="text-xs text-ink-subtle">
                  and {hits.length - 12} more — narrow it down.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
