'use client';

import { Button, Input } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Glyph, Marginalia } from '@/@shared/components/ui';
import type { SearchHit } from '@/server/search';
import { createCanonAction, listCanonAction } from '../canon-actions';
import type { CanonEntryRow } from '../lib/canon';
import { isPlace } from '../lib/world';
import { PlacePicker } from './world/PlacePicker';
import { createSessionAction } from '../chronicle-actions';
import { createClockAction } from '../clock-actions';
import { createNoteAction } from '../actions';
import { addLootAction, createQuestAction } from '../quest-actions';
import {
  createRandomTableAction,
  rollRandomTableByNameAction,
} from '../random-table-actions';
import { searchCampaignAction } from '../search-actions';
import {
  captureWords,
  describeCapture,
  isCanonCapture,
  parseCapture,
  parseRollCapture,
  resolveCapturePlace,
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
  canon: 'world',
  quest: 'world/everywhere/quests',
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
  defaultPlaceId = null,
}: {
  campaignId: string;
  isStaff: boolean;
  /**
   * The place being looked at in the World: a line written there lands
   * there, unless it says `@Somewhere else`.
   */
  defaultPlaceId?: string | null;
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

  // The places, read once a line could land in one.
  const [places, setPlaces] = useState<CanonEntryRow[] | null>(null);
  const wantsPlaces = Boolean(
    capture?.spec.placeable && (capture.at !== null || defaultPlaceId)
  );
  useEffect(() => {
    if (!wantsPlaces || places) return;
    void listCanonAction(campaignId).then(rows =>
      setPlaces(rows.filter(isPlace))
    );
  }, [wantsPlaces, places, campaignId]);
  // Re-read after a write: the line may have been a new place.
  const forgetPlaces = () => setPlaces(null);

  // Where the line will land: the `@` it names, else where the reader is.
  const [picked, setPicked] = useState<string | null>(null);
  const landing = useMemo(() => {
    if (!capture?.spec.placeable) return { placeId: null, ask: false };
    if (capture.at === null) {
      return {
        placeId:
          defaultPlaceId &&
          (!places || places.some(p => p.id === defaultPlaceId))
            ? defaultPlaceId
            : null,
        ask: false,
      };
    }
    if (!places) return { placeId: null, ask: true };
    const { place } = resolveCapturePlace(capture.at, places);
    return place
      ? { placeId: place.id, ask: false }
      : { placeId: picked, ask: true };
  }, [capture, places, defaultPlaceId, picked]);
  const landingName = landing.placeId
    ? (places?.find(p => p.id === landing.placeId)?.title ?? null)
    : null;
  // An `@` that names no single place writes nothing until one is picked.
  const blocked = landing.ask && !landing.placeId;
  // `roll Tavern names`: a random table, rolled behind the screen. It stays
  // a search too, in case "roll" was the start of something else.
  const rollTitle = isStaff && !capture ? parseRollCapture(query) : null;
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
    if (blocked) return;
    setWriting(true);
    setError(null);
    const title = c.title;
    const placeId = c.spec.placeable ? landing.placeId : null;
    let res: { ok: boolean; error?: string };

    if (c.spec.kind === 'quest') {
      res = await createQuestAction(campaignId, {
        title,
        summary: c.tail || undefined,
        status: 'active',
        visibility: 'dm',
        placeId,
      });
    } else if (c.spec.kind === 'clock') {
      res = await createClockAction(campaignId, {
        title,
        segments: c.number ?? 6,
        visibility: 'dm',
        placeId,
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
    } else if (c.spec.kind === 'random-table') {
      res = await createRandomTableAction(campaignId, { title });
    } else if (isCanonCapture(c.spec.kind)) {
      res = await createCanonAction(campaignId, {
        kind: c.spec.kind,
        title,
        dmBody: c.tail,
        partyBody: '',
        visibility: 'dm',
        placeId,
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
    setPicked(null);
    if (c.spec.kind === 'location') forgetPlaces();
    setWrote(
      landingName && placeId
        ? `${title} — written into ${landingName}.`
        : `${title} — written down.`
    );
    await onWrote?.();
  };

  const rollIt = async (title: string) => {
    setWriting(true);
    setError(null);
    const res = await rollRandomTableByNameAction(campaignId, title);
    setWriting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setQuery('');
    setWrote(
      `${res.data.title} — ${res.data.notation} → ${res.data.face}: ${res.data.entry} (behind the screen)`
    );
  };

  return (
    <div className="mb-4">
      <div className="flex items-end gap-2">
        <Input
          size="sm"
          aria-label="Search this campaign, or write something down"
          placeholder={
            isStaff
              ? 'Search the record — + quest, + npc, + clock to write one; roll <random table>'
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
            if (event.key === 'Enter' && capture && !writing && !blocked) {
              event.preventDefault();
              void write(capture);
            } else if (event.key === 'Enter' && rollTitle && !writing) {
              event.preventDefault();
              void rollIt(rollTitle);
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
            isDisabled={writing || blocked}
            isLoading={writing}
            onPress={() => write(capture)}
          >
            Write it down
          </Button>
        )}
        {rollTitle && (
          <Button
            size="sm"
            color="primary"
            isDisabled={writing}
            isLoading={writing}
            onPress={() => rollIt(rollTitle)}
          >
            Roll it
          </Button>
        )}
      </div>

      {/* What is about to be written, before it is. A DM should never press
          a button and find out afterwards which box it landed in. */}
      {capture && (
        <div className="mt-2 rounded-[var(--radius-card)] border border-gold/40 bg-gold/[0.06] px-3 py-2">
          <p className="text-sm text-ink">
            {describeCapture(capture)}
            {landingName && (
              <>
                {' '}
                — in <span className="font-medium">{landingName}</span>
              </>
            )}
          </p>
          {landing.ask && places && capture.at !== null && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <p className="text-xs text-warning">
                {capture.at === ''
                  ? 'Which place? Name it after the @, or pick one.'
                  : resolveCapturePlace(capture.at, places).candidates.length >
                      1
                    ? `More than one place is called “${capture.at}”. Pick the one you mean.`
                    : `No place is called “${capture.at}”. Pick one, or write it without the @.`}
              </p>
              <PlacePicker
                entries={places}
                value={picked}
                onChange={setPicked}
                label=""
                nowhere="Pick a place"
                className="w-56"
              />
            </div>
          )}
          <p className="mt-0.5 text-xs text-ink-muted">{capture.spec.hint}</p>
        </div>
      )}

      {rollTitle && (
        <div className="mt-2 rounded-[var(--radius-card)] border border-gold/40 bg-gold/[0.06] px-3 py-2">
          <p className="text-sm text-ink">
            Roll the random table “{rollTitle}” behind the screen
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            The result goes to Dice, for staff only. Show the party from the
            Random tables section.
          </p>
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
                        onClick={() =>
                          onGo?.(
                            hit.kind === 'canon'
                              ? `world/entry/${hit.id}`
                              : WHERE_SECTION[hit.kind]
                          )
                        }
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
