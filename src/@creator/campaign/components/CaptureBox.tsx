'use client';

import { Button, Input } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { Glyph, Marginalia } from '@/@shared/components/ui';
import type { SearchHit } from '@/server/search';
import { createCanonAction } from '../canon-actions';
import { createSessionAction } from '../chronicle-actions';
import { createClockAction } from '../clock-actions';
import { createNoteAction } from '../actions';
import { addLootAction, createQuestAction } from '../quest-actions';
import { searchCampaignAction } from '../search-actions';
import {
  captureWords,
  describeCapture,
  isCanonCapture,
  parseCapture,
  type Capture,
} from '../lib/capture';

const KIND_GLYPH = {
  canon: 'tome',
  quest: 'scroll',
  session: 'notebook',
  handout: 'letter',
  loot: 'coins',
} as const;

/** Which section of the campaign page a hit lives on, for the "go there" link. */
const WHERE_SECTION: Record<SearchHit['kind'], string> = {
  canon: 'canon',
  quest: 'quests',
  session: 'sessions',
  handout: 'sessions',
  loot: 'loot',
};

/**
 * One box over the whole table's record — it reads it, and it writes to it.
 *
 * Six sessions in, "what was that innkeeper called" means opening five
 * sections and reading, so typing searches. And a DM with an idea should not
 * have to find the right card before writing it down, so a line beginning
 * with `+` writes instead: `+ quest The miller's daughter`,
 * `+ npc Sexton Ambrose Quill, keeper of the chapel`,
 * `+ clock The tide takes the crypt, 6`. The grammar is in `lib/capture.ts`;
 * this is the box around it.
 *
 * The long forms all stay where they are. This is for the DM who is
 * *thinking* and wants to keep going.
 */
export function CaptureBox({
  campaignId,
  isStaff,
  onGo,
  onWrote,
}: {
  campaignId: string;
  isStaff: boolean;
  /** Open a section by key — a hit says where it lives, and this goes there. */
  onGo?: (section: string) => void;
  /** Something was written, so whatever is on screen should re-read. */
  onWrote?: () => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [writing, setWriting] = useState(false);
  const [wrote, setWrote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const capture = isStaff ? parseCapture(query) : null;
  // A line being captured is never also a search: `+` is the whole signal.
  const searchable = !capture && query.trim().length >= 2;

  useEffect(() => {
    if (!searchable) {
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
  }, [campaignId, query, searchable]);

  const write = async (c: Capture) => {
    setWriting(true);
    setError(null);
    const title = c.title;
    let res: { ok: boolean; error?: string };

    if (c.spec.kind === 'quest') {
      res = await createQuestAction(campaignId, {
        title,
        summary: c.tail || undefined,
        status: 'active',
        visibility: 'dm',
      });
    } else if (c.spec.kind === 'clock') {
      res = await createClockAction(campaignId, {
        title,
        segments: c.number ?? 6,
        visibility: 'dm',
      });
    } else if (c.spec.kind === 'session') {
      res = await createSessionAction(campaignId, {
        title,
        // An ISO date or nothing: the action validates, and a half-typed
        // date should fail loudly rather than silently schedule nothing.
        ...(c.tail ? { scheduledFor: c.tail } : {}),
      });
    } else if (c.spec.kind === 'note') {
      res = await createNoteAction(campaignId, title, c.tail);
    } else if (c.spec.kind === 'loot') {
      res = await addLootAction(campaignId, {
        name: title,
        quantity: c.number ?? 1,
      });
    } else if (isCanonCapture(c.spec.kind)) {
      res = await createCanonAction(campaignId, {
        kind: c.spec.kind,
        title,
        dmBody: c.tail,
        partyBody: '',
        visibility: 'dm',
      });
    } else {
      res = { ok: false, error: 'Nothing writes that.' };
    }

    setWriting(false);
    if (!res.ok) {
      setError(res.error ?? 'That did not take.');
      return;
    }
    setQuery('');
    setWrote(`${title} — written down.`);
    await onWrote?.();
  };

  return (
    <div className="mb-4">
      <div className="flex items-end gap-2">
        <Input
          size="sm"
          aria-label="Search this campaign, or write something down"
          placeholder={
            isStaff
              ? 'Search the record — or type + quest, + npc, + clock to write one'
              : "Search the table's record"
          }
          value={query}
          onValueChange={value => {
            setQuery(value);
            setWrote(null);
            setError(null);
          }}
          isClearable
          onClear={() => setQuery('')}
          onKeyDown={event => {
            if (event.key === 'Enter' && capture && !writing) {
              event.preventDefault();
              void write(capture);
            }
          }}
          className="flex-1"
          startContent={
            <Glyph
              name={capture ? 'quill' : 'magnifier'}
              size={15}
              className={capture ? 'text-gold' : 'text-ink-subtle'}
            />
          }
        />
        {capture && (
          <Button
            size="sm"
            color="primary"
            isDisabled={writing}
            isLoading={writing}
            onPress={() => write(capture)}
          >
            Write it down
          </Button>
        )}
      </div>

      {/* What is about to be written, before it is. A DM should never press
          a button and find out afterwards which box it landed in. */}
      {capture && (
        <div className="mt-2 rounded-[var(--radius-card)] border border-gold/40 bg-gold/[0.06] px-3 py-2">
          <p className="text-sm text-ink">{describeCapture(capture)}</p>
          <p className="mt-0.5 text-xs text-ink-muted">{capture.spec.hint}</p>
        </div>
      )}

      {/* The vocabulary, once, while the line is still just a plus. */}
      {isStaff && query.trim() === '+' && (
        <Marginalia className="mt-2" dash>
          {captureWords().join(' · ')}
        </Marginalia>
      )}

      {wrote && <p className="mt-2 text-sm text-ink-muted">{wrote}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

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
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm text-ink">{hit.title}</span>
                      {/* Not a word saying where it lives: the section opens,
                          which is what a reader wanted the word for. */}
                      <button
                        type="button"
                        onClick={() => onGo?.(WHERE_SECTION[hit.kind])}
                        className="font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle underline-offset-2 hover:text-gold-strong hover:underline dark:hover:text-gold"
                      >
                        {hit.where}
                      </button>
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
