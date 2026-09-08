'use client';

import {
  Button,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Glyph,
  Marginalia,
  QuietDeskScene,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { CampaignMemberRow } from '@/server/campaigns';
import type { CanonEntryRow } from '@/server/canon';
import type { SessionRow } from '@/server/campaign-sessions';
import type { NoteRow } from '@/server/notes';
import { listMembersAction } from '../actions';
import { listCanonAction } from '../canon-actions';
import { listSessionsAction } from '../chronicle-actions';
import {
  createNoteAction,
  deleteNoteAction,
  listNotesAction,
  revealExcerptAction,
  updateNoteAction,
} from '../notes-actions';

/** The surfaces a revealed excerpt can also be pinned to, beyond the timeline. */
type Destination = 'timeline' | 'canon' | 'recap' | 'handout';

interface RevealDraft {
  body: string;
  toParty: boolean;
  targetUserIds: string[];
  destination: Destination;
  canonId: string;
  sessionId: string;
  handoutTitle: string;
}

function emptyReveal(body: string): RevealDraft {
  return {
    body,
    toParty: true,
    targetUserIds: [],
    destination: 'timeline',
    canonId: '',
    sessionId: '',
    handoutTitle: '',
  };
}

/* --- the reveal composer ---------------------------------------------- */

/**
 * What happens to the words the DM just highlighted.
 *
 * The excerpt is shown back verbatim, because this is the last moment before
 * it becomes something the party has read — and it is copied at that moment
 * rather than linked, so what is on screen here is exactly what the timeline
 * will keep.
 */
function RevealComposer({
  draft,
  setDraft,
  members,
  canon,
  sessions,
  onCancel,
  onConfirm,
  busy,
}: {
  draft: RevealDraft;
  setDraft: (next: RevealDraft) => void;
  members: CampaignMemberRow[];
  canon: CanonEntryRow[];
  sessions: SessionRow[];
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  // A reveal for named players cannot also be pinned somewhere the whole table
  // reads, so those destinations disappear rather than failing on submit.
  const destinations: { key: Destination; label: string }[] = [
    { key: 'timeline', label: 'The timeline only' },
    ...(draft.toParty
      ? ([
          { key: 'canon', label: 'Also a canon entry' },
          { key: 'recap', label: 'Also a session recap' },
          { key: 'handout', label: 'Also a handout' },
        ] as { key: Destination; label: string }[])
      : []),
  ];

  const ready =
    draft.body.trim().length > 0 &&
    (draft.toParty || draft.targetUserIds.length > 0) &&
    (draft.destination !== 'canon' || Boolean(draft.canonId)) &&
    (draft.destination !== 'recap' || Boolean(draft.sessionId));

  return (
    <div className="mt-3 rounded-[var(--radius-card)] border border-gold/40 bg-gold/[0.06] p-4">
      <div className="flex items-center gap-2">
        <Glyph name="candle" size={16} className="text-gold" />
        <h3 className="font-display text-sm text-ink">Tell them this much</h3>
      </div>

      <blockquote className="mt-3 whitespace-pre-wrap border-l-2 border-gold/50 pl-3 font-hand text-[1.1875rem] leading-snug text-ink-muted">
        {draft.body}
      </blockquote>

      <div className="mt-4 flex flex-col gap-3">
        <Switch
          size="sm"
          isSelected={draft.toParty}
          onValueChange={v =>
            setDraft({
              ...draft,
              toParty: v,
              // Dropping to named players invalidates the party-wide pins.
              destination: v ? draft.destination : 'timeline',
            })
          }
        >
          <span className="text-sm">
            {draft.toParty ? 'The whole table' : 'Only the people I name'}
          </span>
        </Switch>

        {!draft.toParty && (
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => {
              const on = draft.targetUserIds.includes(m.userId);
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      targetUserIds: on
                        ? draft.targetUserIds.filter(id => id !== m.userId)
                        : [...draft.targetUserIds, m.userId],
                    })
                  }
                  className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                    on
                      ? 'border-arcane bg-arcane/15 text-ink'
                      : 'border-line text-ink-muted hover:border-arcane/60 hover:text-ink'
                  }`}
                >
                  {m.name ?? m.email ?? 'Someone'}
                </button>
              );
            })}
            {members.length === 0 && (
              <p className="text-xs text-ink-subtle">
                Nobody has joined this table yet.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Select
            aria-label="Where it lands"
            size="sm"
            className="w-52"
            selectedKeys={[draft.destination]}
            onSelectionChange={keys => {
              const key = Array.from(keys)[0];
              if (key) setDraft({ ...draft, destination: key as Destination });
            }}
          >
            {destinations.map(d => (
              <SelectItem key={d.key} textValue={d.label}>
                {d.label}
              </SelectItem>
            ))}
          </Select>

          {draft.destination === 'canon' && (
            <Select
              aria-label="Which entry"
              size="sm"
              className="w-56"
              placeholder="Pick an entry"
              selectedKeys={draft.canonId ? [draft.canonId] : []}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                setDraft({ ...draft, canonId: key ? String(key) : '' });
              }}
            >
              {canon.map(c => (
                <SelectItem key={c.id} textValue={c.title || 'Untitled'}>
                  {c.title || 'Untitled'}
                </SelectItem>
              ))}
            </Select>
          )}

          {draft.destination === 'recap' && (
            <Select
              aria-label="Which sitting"
              size="sm"
              className="w-56"
              placeholder="Pick a sitting"
              selectedKeys={draft.sessionId ? [draft.sessionId] : []}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                setDraft({ ...draft, sessionId: key ? String(key) : '' });
              }}
            >
              {sessions.map(s => (
                <SelectItem key={s.id} textValue={`Session ${s.number}`}>
                  Session {s.number}
                  {s.title ? ` · ${s.title}` : ''}
                </SelectItem>
              ))}
            </Select>
          )}

          {draft.destination === 'handout' && (
            <Input
              size="sm"
              aria-label="Handout title"
              placeholder="A torn page"
              className="w-56"
              value={draft.handoutTitle}
              onValueChange={v => setDraft({ ...draft, handoutTitle: v })}
            />
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            color="primary"
            isDisabled={!ready || busy}
            isLoading={busy}
            onPress={onConfirm}
          >
            Reveal it
          </Button>
          <Button size="sm" variant="light" onPress={onCancel}>
            Keep it back
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --- one page ---------------------------------------------------------- */

function NotePage({
  campaignId,
  note,
  members,
  canon,
  sessions,
  refresh,
  onError,
  onRevealed,
}: {
  campaignId: string;
  note: NoteRow;
  members: CampaignMemberRow[];
  canon: CanonEntryRow[];
  sessions: SessionRow[];
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onRevealed: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    title: note.title,
    body: note.body,
    tags: note.tags.join(', '),
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState<RevealDraft | null>(null);
  const [revealing, setRevealing] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { confirm, dialog } = useConfirm();

  // A different page selected in the list is a different document; reset the
  // draft rather than carrying the last page's words into it.
  useEffect(() => {
    setDraft({
      title: note.title,
      body: note.body,
      tags: note.tags.join(', '),
    });
    setDirty(false);
    setReveal(null);
  }, [note.id, note.title, note.body, note.tags]);

  const save = async () => {
    setSaving(true);
    const res = await updateNoteAction(campaignId, note.id, {
      title: draft.title,
      body: draft.body,
      tags: draft.tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setDirty(false);
    await refresh();
  };

  /** Lift whatever is highlighted in the body out into a reveal draft. */
  const startReveal = () => {
    const el = bodyRef.current;
    const selected = el
      ? draft.body.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0).trim()
      : '';
    if (!selected) {
      onError('Highlight the part of the page they get to hear first.');
      return;
    }
    setReveal(emptyReveal(selected));
  };

  const submitReveal = async () => {
    if (!reveal) return;
    setRevealing(true);
    const res = await revealExcerptAction(campaignId, {
      body: reveal.body,
      sourceKind: 'note',
      sourceId: note.id,
      visibility: reveal.toParty ? 'party' : 'selected',
      targetUserIds: reveal.toParty ? undefined : reveal.targetUserIds,
      appendToCanonId: reveal.destination === 'canon' ? reveal.canonId : null,
      appendToRecapSessionId:
        reveal.destination === 'recap' ? reveal.sessionId : null,
      asHandoutTitle:
        reveal.destination === 'handout' ? reveal.handoutTitle : null,
    });
    setRevealing(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setReveal(null);
    await onRevealed();
  };

  return (
    <SectionCard
      title={
        <Input
          aria-label="Page title"
          variant="underlined"
          value={draft.title}
          onValueChange={v => {
            setDraft({ ...draft, title: v });
            setDirty(true);
          }}
          classNames={{ input: 'font-display text-lg' }}
        />
      }
      actions={
        <>
          <Button
            size="sm"
            variant="flat"
            isDisabled={!dirty || saving}
            isLoading={saving}
            onPress={save}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="light"
            onPress={async () => {
              const yes = await confirm({
                title: 'Tear out this page?',
                body: 'The page goes. Anything already revealed from it stays revealed — the party was told.',
                confirmLabel: 'Tear it out',
                destructive: true,
              });
              if (!yes) return;
              const res = await deleteNoteAction(campaignId, note.id);
              if (!res.ok) {
                onError(res.error);
                return;
              }
              await refresh();
            }}
          >
            Tear out
          </Button>
        </>
      }
    >
      {dialog}

      <div className="flex flex-col gap-3">
        <Textarea
          ref={bodyRef}
          aria-label="Page"
          minRows={10}
          placeholder="The reeve is already dead. If they go north instead…"
          value={draft.body}
          onValueChange={v => {
            setDraft({ ...draft, body: v });
            setDirty(true);
          }}
          classNames={{ input: 'font-hand text-[1.1875rem] leading-relaxed' }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Input
            size="sm"
            aria-label="Tags"
            placeholder="factions, duskwater"
            className="w-56"
            startContent={
              <Glyph name="key" size={13} className="text-ink-subtle" />
            }
            value={draft.tags}
            onValueChange={v => {
              setDraft({ ...draft, tags: v });
              setDirty(true);
            }}
          />

          <Select
            aria-label="File under a sitting"
            size="sm"
            className="w-48"
            placeholder="Standing note"
            selectedKeys={note.sessionId ? [note.sessionId] : []}
            onSelectionChange={async keys => {
              const key = Array.from(keys)[0];
              const res = await updateNoteAction(campaignId, note.id, {
                sessionId: key ? String(key) : null,
              });
              if (!res.ok) onError(res.error);
              await refresh();
            }}
          >
            {sessions.map(s => (
              <SelectItem key={s.id} textValue={`Session ${s.number}`}>
                Session {s.number}
                {s.title ? ` · ${s.title}` : ''}
              </SelectItem>
            ))}
          </Select>

          <Switch
            size="sm"
            isSelected={note.pinned}
            onValueChange={async v => {
              const res = await updateNoteAction(campaignId, note.id, {
                pinned: v,
              });
              if (!res.ok) onError(res.error);
              await refresh();
            }}
          >
            <span className="text-sm">Pinned</span>
          </Switch>

          <Switch
            size="sm"
            isSelected={note.visibility === 'shared'}
            onValueChange={async v => {
              const res = await updateNoteAction(campaignId, note.id, {
                visibility: v ? 'shared' : 'dm',
              });
              if (!res.ok) onError(res.error);
              await refresh();
            }}
          >
            <span className="text-sm">
              {note.visibility === 'shared' ? 'Table reads it' : 'Yours alone'}
            </span>
          </Switch>

          <Button
            size="sm"
            color="primary"
            variant="flat"
            className="ml-auto"
            onPress={startReveal}
          >
            Reveal selection
          </Button>
        </div>

        {reveal && (
          <RevealComposer
            draft={reveal}
            setDraft={setReveal}
            members={members}
            canon={canon}
            sessions={sessions}
            busy={revealing}
            onCancel={() => setReveal(null)}
            onConfirm={submitReveal}
          />
        )}
      </div>
    </SectionCard>
  );
}

/* --- the notebook ------------------------------------------------------ */

/**
 * The DM's prep, and the one control that turns a piece of it into something
 * the party knows.
 *
 * Highlighting is the whole interaction: a DM writing "the reeve is already
 * dead, but the party only heard he left for the capital" should be able to
 * hand over the second half of that sentence without retyping it and without
 * the first half going with it.
 */
export function NotebookPanel({
  campaignId,
  onRevealed,
}: {
  campaignId: string;
  /** Called after a reveal lands, so the timeline beside this can re-read. */
  onRevealed?: () => Promise<void>;
}) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);
  const [canon, setCanon] = useState<CanonEntryRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setNotes(await listNotesAction(campaignId));
    } catch {
      setError('Failed to open the notebook.');
    }
  }, [campaignId]);

  const loadSide = useCallback(async () => {
    const [m, c, s] = await Promise.all([
      listMembersAction(campaignId).catch(() => [] as CampaignMemberRow[]),
      listCanonAction(campaignId).catch(() => [] as CanonEntryRow[]),
      listSessionsAction(campaignId).catch(() => [] as SessionRow[]),
    ]);
    // The GM has no member row and cannot be told something privately by
    // themselves, so the target list is the players.
    setMembers(m.filter(x => x.role === 'player'));
    setCanon(c);
    setSessions(s);
  }, [campaignId]);

  useEffect(() => {
    refresh();
    loadSide();
  }, [refresh, loadSide]);

  if (!notes) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Finding your place…" />
      </div>
    );
  }

  const selected = notes.find(n => n.id === selectedId) ?? notes[0] ?? null;

  const add = async () => {
    const res = await createNoteAction(campaignId, { title });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTitle('');
    setSelectedId(res.data.id);
    await refresh();
  };

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <SectionCard title="Open a page">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            size="sm"
            label="Title"
            placeholder="The reeve of Duskwater"
            value={title}
            onValueChange={setTitle}
            className="min-w-40 flex-1"
          />
          <Button
            size="sm"
            color="primary"
            isDisabled={!title.trim()}
            onPress={add}
          >
            Start it
          </Button>
        </div>
      </SectionCard>

      {notes.length === 0 ? (
        <EmptyState
          scene={<QuietDeskScene />}
          title="A clean desk"
          description="Prep that is not a session, a quest or an NPC goes here — and any line of it can be handed to the party later."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <nav className="flex flex-col gap-1">
            {notes.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selected?.id === n.id
                    ? 'border-gold bg-gold/10 text-ink'
                    : 'border-line text-ink-muted hover:border-gold/50 hover:text-ink'
                }`}
              >
                {n.pinned && (
                  <Glyph name="key" size={13} className="shrink-0 text-gold" />
                )}
                <span className="flex-1 truncate">{n.title || 'Untitled'}</span>
                {n.visibility === 'shared' && (
                  <Glyph
                    name="person"
                    size={13}
                    className="shrink-0 text-ink-subtle"
                    label="The table reads this page"
                  />
                )}
              </button>
            ))}
          </nav>

          <div>
            {selected && (
              <NotePage
                key={selected.id}
                campaignId={campaignId}
                note={selected}
                members={members}
                canon={canon}
                sessions={sessions}
                refresh={refresh}
                onError={setError}
                onRevealed={async () => {
                  await refresh();
                  await onRevealed?.();
                }}
              />
            )}
          </div>
        </div>
      )}

      <Marginalia dash>
        highlight a line, then hand over exactly that much
      </Marginalia>
    </div>
  );
}

/**
 * The pages the DM has opened to the table, read-only.
 *
 * A shared page is a different thing from a reveal: a reveal is a line the
 * party was told at a moment, a shared page is a document they can consult —
 * the house rules for a heist, the roster of a guild. Both belong on this tab
 * and neither replaces the other.
 */
export function SharedNotes({ campaignId }: { campaignId: string }) {
  const [notes, setNotes] = useState<NoteRow[] | null>(null);

  useEffect(() => {
    listNotesAction(campaignId)
      .then(setNotes)
      .catch(() => setNotes([]));
  }, [campaignId]);

  if (!notes) {
    return (
      <div className="flex justify-center py-8">
        <DiceSpinner label="Finding your place…" />
      </div>
    );
  }
  if (notes.length === 0) return null;

  return (
    <div className="space-y-3">
      {notes.map(n => (
        <SectionCard key={n.id} title={n.title || 'Untitled'}>
          <p className="whitespace-pre-wrap font-hand text-[1.1875rem] leading-relaxed text-ink-muted">
            {n.body}
          </p>
        </SectionCard>
      ))}
    </div>
  );
}
