'use client';

import { Button, Link, Switch } from '@heroui/react';
import { useEffect, useState, type ReactNode } from 'react';

import { StatBlock } from '@/@shared/components/StatBlock';
import { useDiceTray } from '@/@shared/components/dice';
import { Glyph, StatusChip, type GlyphName } from '@/@shared/components/ui';
import {
  parseContentData,
  type ContentEntry,
  type CreatureData,
} from '@/@shared/content';
import type { RecordLookup } from '@/server/lookup';
import { rollAction } from '../../actions';
import { CANON_KIND_GLYPHS, CANON_KIND_LABELS } from '../../lib/canon';
import {
  BOOK_GLYPH,
  BOOK_WHERE,
  bookLine,
  findCondition,
  findRule,
  isBookType,
  lookupKey,
  RECORD_GLYPH,
  RECORD_SECTION,
  RECORD_WHERE,
  type LookupRef,
} from '../../lib/lookup';
import { rollsIn } from '../../lib/monster-prose';
import { ATTITUDE_LABEL } from '../../lib/standing';
import { writeWorldRoute } from '../../lib/world-route';
import { openBookAction, openRecordLookupAction } from '../../lookup-actions';

/** What an opened lookup has to say: a heading, and the body under it. */
type Loaded =
  | { state: 'loading' }
  | { state: 'gone' }
  | { state: 'book'; entry: ContentEntry }
  | { state: 'record'; data: RecordLookup }
  | { state: 'local' };

/**
 * Open a lookup: books and records through the server (which refuses what
 * the reader may not read), conditions and rules passages from the pure
 * modules already in the browser.
 */
function useLookup(campaignId: string, ref: LookupRef): Loaded {
  const key = lookupKey(ref);
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded }>({
    key: '',
    value: { state: 'loading' },
  });

  useEffect(() => {
    if (ref.kind === 'condition' || ref.kind === 'rule') return;
    let live = true;
    const done = (value: Loaded) => {
      if (live) setLoaded({ key, value });
    };
    if (ref.kind === 'book') {
      openBookAction(campaignId, ref.ref)
        .then(entry =>
          done(entry ? { state: 'book', entry } : { state: 'gone' })
        )
        .catch(() => done({ state: 'gone' }));
    } else {
      openRecordLookupAction(campaignId, ref.record, ref.id)
        .then(data =>
          done(data ? { state: 'record', data } : { state: 'gone' })
        )
        .catch(() => done({ state: 'gone' }));
    }
    return () => {
      live = false;
    };
    // `key` is the ref, spelled as a string, so a new object for the same
    // lookup does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, key]);

  if (ref.kind === 'condition' || ref.kind === 'rule')
    return { state: 'local' };
  return loaded.key === key ? loaded.value : { state: 'loading' };
}

/** The kind word a lookup wears as its panel title: "Spell", "Person". */
export function lookupKindWord(ref: LookupRef, canonKind?: string): string {
  switch (ref.kind) {
    case 'book':
      return (
        {
          spell: 'Spell',
          creature: 'Stat block',
          item: 'Item',
          rule: 'House rule',
        }[ref.ref.type as 'spell'] ?? 'Entry'
      );
    case 'condition':
      return 'Condition';
    case 'rule':
      return 'Rule';
    case 'record':
      return ref.record === 'canon'
        ? canonKind && canonKind in CANON_KIND_LABELS
          ? CANON_KIND_LABELS[canonKind as keyof typeof CANON_KIND_LABELS]
          : 'Canon'
        : {
            quest: 'Quest',
            session: 'Session',
            handout: 'Handout',
            loot: 'Loot',
          }[ref.record];
  }
}

/** The glyph a lookup wears in a list. */
export function lookupGlyph(ref: LookupRef, canonKind?: string): GlyphName {
  switch (ref.kind) {
    case 'book':
      return isBookType(ref.ref.type) ? BOOK_GLYPH[ref.ref.type] : 'tome';
    case 'condition':
      return 'question';
    case 'rule':
      return 'gavel';
    case 'record':
      return ref.record === 'canon' &&
        canonKind &&
        canonKind in CANON_KIND_GLYPHS
        ? CANON_KIND_GLYPHS[canonKind as keyof typeof CANON_KIND_GLYPHS]
        : RECORD_GLYPH[ref.record];
  }
}

function Where({ glyph, children }: { glyph: GlyphName; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
      <Glyph name={glyph} size={13} />
      {children}
    </p>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-xl leading-tight text-ink">{children}</h3>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
      {children}
    </p>
  );
}

/** The DM's half of something: hatched, dotted, *only you* (rule 9). */
function OnlyYou({ children }: { children: ReactNode }) {
  return (
    <div className="status-hatch space-y-1.5 rounded-md border border-dotted border-ink-muted p-2">
      <StatusChip kind="hidden" />
      <div className="rounded bg-surface px-2 py-1.5">
        <Prose>{children}</Prose>
      </div>
    </div>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return (
    <p className="pt-1 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
      {children}
    </p>
  );
}

/**
 * A creature's attacks as buttons, for staff: the bonus and the dice read
 * off the prose (`rollsIn`), rolled on the server as the creature and drawn
 * by the tray from the server's faces. Behind the screen by default — a
 * monster looked up is not yet a monster on the board.
 */
export function CreatureRolls({
  campaignId,
  name,
  data,
  onError,
}: {
  campaignId: string;
  name: string;
  data: CreatureData;
  onError: (message: string) => void;
}) {
  const tray = useDiceTray();
  const [hidden, setHidden] = useState(true);
  const lines = [
    ...data.actions,
    ...data.bonus_actions,
    ...data.reactions,
    ...data.legendary_actions,
  ]
    .map(a => ({ name: a.name, ...rollsIn(a.desc) }))
    .filter(a => a.hit || a.damage.length > 0);
  if (lines.length === 0) return null;

  const roll = async (notation: string, what: string) => {
    const res = await rollAction(campaignId, {
      notation,
      label: `${name} · ${what}`.slice(0, 80),
      characterId: null,
      visibility: hidden ? 'dm' : 'table',
    });
    if (!res.ok) {
      onError(res.error ?? 'The dice did not land.');
      return;
    }
    await tray.showNotationRoll(res.data, {
      title: name,
      hint: what,
      secret: hidden,
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {lines.map(l => (
          <span key={l.name} className="contents">
            {l.hit && (
              <Button
                size="sm"
                variant="flat"
                startContent={<Glyph name="die" size={13} />}
                onPress={() => roll(l.hit!, `${l.name} · to hit`)}
              >
                {l.name} {l.hit.replace('1d20', '')}
              </Button>
            )}
            {l.damage.map((d, i) => (
              <Button
                key={`${d}-${i}`}
                size="sm"
                variant="flat"
                startContent={<Glyph name="die" size={13} />}
                onPress={() => roll(d, `${l.name} · damage`)}
              >
                {d}
              </Button>
            ))}
          </span>
        ))}
      </div>
      <Switch size="sm" isSelected={hidden} onValueChange={setHidden}>
        <span className="text-xs text-ink-muted">Behind the screen</span>
      </Switch>
    </div>
  );
}

/** A person's stat block, by name and with its rolls — staff only. */
function StatOf({
  campaignId,
  stat,
  onError,
}: {
  campaignId: string;
  stat: NonNullable<
    Extract<RecordLookup, { record: 'canon' }>['entry']['stat']
  >;
  onError: (message: string) => void;
}) {
  const [entry, setEntry] = useState<ContentEntry | null | undefined>(
    undefined
  );
  const available = stat.available;
  const key = `${stat.ref.source}:${stat.ref.type}:${stat.ref.key}`;
  useEffect(() => {
    if (!available) return;
    let live = true;
    openBookAction(campaignId, stat.ref)
      .then(e => live && setEntry(e))
      .catch(() => live && setEntry(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, key, available]);

  return (
    <div className="space-y-1.5">
      <SubLabel>Stat block · {stat.name ?? 'Unnamed'}</SubLabel>
      {!available || entry === null ? (
        <p className="text-xs text-danger">
          Unavailable — this stat block no longer resolves at this table.
        </p>
      ) : entry === undefined ? (
        <p className="text-xs text-ink-subtle">Opening the bestiary…</p>
      ) : (
        <>
          <p className="text-xs text-ink-muted">{bookLine(entry)}</p>
          <CreatureRolls
            campaignId={campaignId}
            name={stat.name ?? entry.name}
            data={parseContentData('creature', entry.data)}
            onError={onError}
          />
        </>
      )}
    </div>
  );
}

/** A canon entry: who or what it is, as this reader may know it. */
function CanonBody({
  campaignId,
  data,
  isStaff,
  onError,
}: {
  campaignId: string;
  data: Extract<RecordLookup, { record: 'canon' }>;
  isStaff: boolean;
  onError: (message: string) => void;
}) {
  const e = data.entry;
  const person = e.kind === 'npc';
  const facts = [
    isStaff && e.attitude
      ? (['Attitude', ATTITUDE_LABEL[e.attitude]] as const)
      : null,
    ...Object.entries(e.fields)
      .filter(([, v]) => v.trim())
      .slice(0, 4)
      .map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v] as const),
  ].filter((x): x is readonly [string, string] => x !== null);
  const world = writeWorldRoute({
    scope: 'here',
    placeId: e.kind === 'location' ? e.id : (data.place?.id ?? null),
    entryId: e.kind === 'location' ? null : e.id,
    filter: 'everything',
  });

  return (
    <div className="space-y-2.5">
      <Where glyph={CANON_KIND_GLYPHS[e.kind]}>
        {CANON_KIND_LABELS[e.kind]}
        {data.place && (
          <>
            {' · '}
            {person ? 'Lives in' : 'Inside'} {data.place.title}
          </>
        )}
      </Where>
      <Title>{e.title}</Title>
      {isStaff && e.visibility !== 'shared' && <StatusChip kind="hidden" />}
      {facts.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {facts.map(([k, v]) => (
            <span key={k} className="contents">
              <dt className="text-ink-subtle">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </span>
          ))}
        </dl>
      )}
      {e.partyBody && <Prose>{e.partyBody}</Prose>}
      {isStaff && e.dmBody && <OnlyYou>{e.dmBody}</OnlyYou>}
      {isStaff && e.stat && (
        <StatOf campaignId={campaignId} stat={e.stat} onError={onError} />
      )}
      {e.partyNotes.length > 0 && (
        <div className="space-y-1">
          <SubLabel>Party notes</SubLabel>
          {e.partyNotes.map(n => (
            <p key={n.id} className="text-sm text-ink">
              <span className="text-ink-muted">{n.byName} — </span>
              {n.body}
            </p>
          ))}
        </div>
      )}
      <Link
        href={`/campaigns/${campaignId}#${world}`}
        size="sm"
        className="text-gold-strong dark:text-gold"
      >
        Open in the World
      </Link>
    </div>
  );
}

function RecordBody({
  campaignId,
  data,
  isStaff,
  onError,
}: {
  campaignId: string;
  data: RecordLookup;
  isStaff: boolean;
  onError: (message: string) => void;
}) {
  const goTo = (
    <Link
      href={`/campaigns/${campaignId}#${RECORD_SECTION[data.record]}`}
      size="sm"
      className="text-gold-strong dark:text-gold"
    >
      Open on the campaign page
    </Link>
  );
  switch (data.record) {
    case 'canon':
      return (
        <CanonBody
          campaignId={campaignId}
          data={data}
          isStaff={isStaff}
          onError={onError}
        />
      );
    case 'quest': {
      const q = data.quest;
      return (
        <div className="space-y-2.5">
          <Where glyph={RECORD_GLYPH.quest}>
            {RECORD_WHERE.quest} · {q.status}
          </Where>
          <Title>{q.title}</Title>
          {q.summary && <Prose>{q.summary}</Prose>}
          {q.objectives.length > 0 && (
            <ul className="space-y-0.5 text-sm">
              {q.objectives.map(o => (
                <li
                  key={o.id}
                  className={
                    o.done ? 'text-ink-subtle line-through' : 'text-ink'
                  }
                >
                  {o.body}
                </li>
              ))}
            </ul>
          )}
          {(q.giver || q.reward) && (
            <p className="text-xs text-ink-muted">
              {[q.giver && `From ${q.giver}`, q.reward && `Reward: ${q.reward}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {isStaff && q.dmNotes && <OnlyYou>{q.dmNotes}</OnlyYou>}
          {goTo}
        </div>
      );
    }
    case 'session': {
      const s = data.session;
      return (
        <div className="space-y-2.5">
          <Where glyph={RECORD_GLYPH.session}>{RECORD_WHERE.session}</Where>
          <Title>
            Session {s.number}
            {s.title ? ` · ${s.title}` : ''}
          </Title>
          {s.recapBody ? (
            <Prose>{s.recapBody}</Prose>
          ) : (
            <p className="text-sm text-ink-subtle">No recap written.</p>
          )}
          {isStaff && s.prepBody && <OnlyYou>{s.prepBody}</OnlyYou>}
          {goTo}
        </div>
      );
    }
    case 'handout': {
      const h = data.handout;
      return (
        <div className="space-y-2.5">
          <Where glyph={RECORD_GLYPH.handout}>{RECORD_WHERE.handout}</Where>
          <Title>{h.title}</Title>
          {h.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/campaigns/${campaignId}/handouts/${h.id}`}
              alt={h.title}
              className="max-h-80 w-full rounded-md border border-line object-contain"
            />
          ) : (
            h.body && <Prose>{h.body}</Prose>
          )}
          {goTo}
        </div>
      );
    }
    case 'loot': {
      const l = data.loot;
      return (
        <div className="space-y-2.5">
          <Where glyph={RECORD_GLYPH.loot}>{RECORD_WHERE.loot}</Where>
          <Title>
            {l.name}
            {l.quantity > 1 ? ` ×${l.quantity}` : ''}
          </Title>
          <p className="text-xs text-ink-muted">
            {l.holderName ? `Carried by ${l.holderName}` : 'In the common pile'}
            {l.identified ? '' : ' · not identified'}
          </p>
          {l.notes && <Prose>{l.notes}</Prose>}
          {goTo}
        </div>
      );
    }
  }
}

/**
 * The body of an opened lookup, whatever it is: a spell, a stat block, an
 * item or house rule from the books; a person, place, quest, session,
 * handout or loot from the campaign's record; a condition; a rules passage.
 * Drawn inside a `Panel` — the opened hit beside the panels, and a kept row
 * in Lookups — so it draws no frame and no heading of its own (rule 9).
 */
export function LookupView({
  campaignId,
  lookup,
  isStaff,
  onError,
}: {
  campaignId: string;
  lookup: LookupRef;
  isStaff: boolean;
  onError: (message: string) => void;
}) {
  const loaded = useLookup(campaignId, lookup);

  if (lookup.kind === 'condition') {
    const c = findCondition(lookup.key);
    return c ? (
      <div className="space-y-2">
        <Where glyph="question">Conditions</Where>
        <Title>{c.label}</Title>
        <Prose>{c.hint}</Prose>
      </div>
    ) : null;
  }
  if (lookup.kind === 'rule') {
    const r = findRule(lookup.section, lookup.key);
    return r ? (
      <div className="space-y-2">
        <Where glyph="gavel">
          Rules · {r.sectionTitle} · {r.entry.cite}
        </Where>
        <Title>{r.entry.title}</Title>
        <Prose>{r.entry.body}</Prose>
      </div>
    ) : null;
  }

  if (loaded.state === 'loading') {
    return <p className="text-xs text-ink-subtle">Opening it…</p>;
  }
  if (loaded.state === 'gone') {
    return (
      <p className="text-sm text-ink-muted">
        Unavailable — it was deleted, hidden again, or is not yours to read.
      </p>
    );
  }
  if (loaded.state === 'book') {
    const entry = loaded.entry;
    const type = entry.type;
    return (
      <div className="space-y-2.5">
        <Where glyph={isBookType(type) ? BOOK_GLYPH[type] : 'tome'}>
          {isBookType(type) ? BOOK_WHERE[type] : 'The books'}
          {entry.ref.source === 'homebrew' ? ' · homebrew' : ' · SRD'}
        </Where>
        <Title>{entry.name}</Title>
        <StatBlock entry={entry} headless showSource />
        {isStaff && type === 'creature' && (
          <CreatureRolls
            campaignId={campaignId}
            name={entry.name}
            data={parseContentData('creature', entry.data)}
            onError={onError}
          />
        )}
      </div>
    );
  }
  if (loaded.state === 'record') {
    return (
      <RecordBody
        campaignId={campaignId}
        data={loaded.data}
        isStaff={isStaff}
        onError={onError}
      />
    );
  }
  return null;
}
