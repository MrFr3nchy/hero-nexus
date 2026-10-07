'use client';

import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  EntryCard,
  Glyph,
  isGlyphName,
  Pill,
  SectionCard,
  TomeScene,
  type GlyphName,
} from '@/@shared/components/ui';
import type { CampaignMemberRow, CampaignRole } from '@/server/campaigns';
import {
  CANON_KINDS,
  CANON_KIND_FIELDS,
  STAT_KINDS,
  CANON_KIND_GLYPHS,
  CANON_KIND_LABELS,
  type CanonCollectionRow,
  type CanonEntryRow,
  type CanonKind,
} from '@/@creator/campaign/lib/canon';

import { listMembersAction } from '../actions';
import {
  createCanonAction,
  createCanonCollectionAction,
  deleteCanonAction,
  deleteCanonCollectionAction,
  linkCanonAction,
  listCanonAction,
  listCanonCollectionsAction,
  revealCanonAction,
  setCanonVisibilityAction,
  unlinkCanonAction,
  unrevealCanonAction,
  updateCanonAction,
  updateCanonCollectionAction,
} from '../canon-actions';
import { FactionStanding, NpcDepth } from './NpcDepth';
import { ImagePicker } from './ImagePicker';
import { PartyNotes } from './world/PartyNotes';
import { PlacePicker } from './world/PlacePicker';
import { pathLabel, placePath } from '../lib/world';

/**
 * Shelves used to store whatever emoji the DM typed. They store a glyph name
 * now; anything older falls back to the stack of books rather than being
 * migrated, since the old value was only ever decoration.
 */
function shelfGlyph(icon: string): GlyphName {
  return isGlyphName(icon) ? icon : 'books';
}

/** What a DM can put on a shelf spine. Kept short — this is a spine, not a set. */
const SHELF_GLYPHS: GlyphName[] = [
  'books',
  'tome',
  'dragon',
  'map',
  'person',
  'banner',
  'sword',
  'sparkle',
  'scroll',
  'notebook',
  'chest',
  'crown',
];

/** A row of glyph swatches — picking one beats typing an emoji into a box. */
function ShelfGlyphPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (glyph: GlyphName) => void;
}) {
  const current = shelfGlyph(value);
  return (
    <div
      role="radiogroup"
      aria-label="Shelf glyph"
      className="flex flex-wrap gap-1.5"
    >
      {SHELF_GLYPHS.map(g => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={current === g}
          aria-label={g.replace(/-/g, ' ')}
          onClick={() => onChange(g)}
          className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
            current === g
              ? 'border-gold bg-gold/15 text-gold-strong dark:text-gold'
              : 'border-line text-ink-subtle hover:border-gold/60 hover:text-ink'
          }`}
        >
          <Glyph name={g} size={18} />
        </button>
      ))}
    </div>
  );
}
import { RevealControls } from './RevealControls';

/**
 * The campaign archive.
 *
 * Entries are shelved into collections — a bestiary, a spellbook, somebody's
 * notebook — and each one carries a picture and a few facts belonging to its
 * kind, so a shelf can be read at a glance instead of unfolded paragraph by
 * paragraph. Reveals stay per entry: a shelf is never secret, its contents are.
 */

export type Draft = {
  kind: CanonKind;
  title: string;
  dmBody: string;
  partyBody: string;
  collectionId: string | null;
  imageId: string | null;
  fields: Record<string, string>;
  placeId: string | null;
};

export const emptyDraft: Draft = {
  kind: 'npc',
  title: '',
  dmBody: '',
  partyBody: '',
  collectionId: null,
  imageId: null,
  fields: {},
  placeId: null,
};

/** A draft of an entry as it stands, for the editor. */
export function draftOf(entry: CanonEntryRow): Draft {
  return {
    kind: entry.kind,
    title: entry.title,
    dmBody: entry.dmBody ?? '',
    partyBody: entry.partyBody,
    collectionId: entry.collectionId,
    imageId: entry.imageId,
    fields: entry.fields,
    placeId: entry.placeId,
  };
}

/** What "where it is" means, for each kind. */
export const PLACE_LABEL: Record<CanonKind, string> = {
  npc: 'Lives in',
  creature: 'Found in',
  location: 'Inside',
  faction: 'Seat',
  item: 'Lies in',
  spell: 'Where',
  lore: 'Where',
  note: 'Where',
};

const LOOSE = '__loose__';

export function CanonPanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [entries, setEntries] = useState<CanonEntryRow[]>([]);
  const [shelves, setShelves] = useState<CanonCollectionRow[]>([]);
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<CanonKind | 'all'>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [shelfDraft, setShelfDraft] = useState<{
    title: string;
    blurb: string;
    icon: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [list, collections] = await Promise.all([
        listCanonAction(campaignId),
        listCanonCollectionsAction(campaignId),
      ]);
      setEntries(list);
      setShelves(collections);
      if (isStaff) setMembers(await listMembersAction(campaignId));
    } catch {
      setError('Failed to load the archive.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, isStaff]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const save = async () => {
    if (!draft?.title.trim()) return;
    const res = editingId
      ? await updateCanonAction(campaignId, editingId, draft)
      : await createCanonAction(campaignId, draft);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDraft(null);
    setEditingId(null);
    await refresh();
  };

  const saveShelf = async () => {
    if (!shelfDraft?.title.trim()) return;
    const res = await createCanonCollectionAction(campaignId, shelfDraft);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setShelfDraft(null);
    await refresh();
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(e => {
      if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
      if (!needle) return true;
      return (
        e.title.toLowerCase().includes(needle) ||
        e.partyBody.toLowerCase().includes(needle) ||
        (e.dmBody ?? '').toLowerCase().includes(needle)
      );
    });
  }, [entries, kindFilter, query]);

  const byShelf = useMemo(() => {
    const map = new Map<string, CanonEntryRow[]>();
    for (const entry of visible) {
      const key = entry.collectionId ?? LOOSE;
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return map;
  }, [visible]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Opening the archive…" />
      </div>
    );
  }

  const kindsInUse = [...new Set(entries.map(e => e.kind))];

  const renderEntries = (rows: CanonEntryRow[]) => (
    <div className="grid gap-3 lg:grid-cols-2">
      {rows.map(entry => (
        <CanonCard
          key={entry.id}
          campaignId={campaignId}
          entry={entry}
          entries={entries}
          shelves={shelves}
          members={members}
          isStaff={isStaff}
          act={act}
          onEdit={() => {
            setEditingId(entry.id);
            setDraft(draftOf(entry));
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* ---- what the DM can add ---- */}
      {isStaff && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            color="primary"
            onPress={() => {
              setEditingId(null);
              setDraft(emptyDraft);
            }}
          >
            New entry
          </Button>
          <Button
            size="sm"
            variant="bordered"
            className="border-line text-ink"
            onPress={() =>
              setShelfDraft({ title: '', blurb: '', icon: 'books' })
            }
          >
            New shelf
          </Button>
        </div>
      )}

      {shelfDraft && (
        <SectionCard title="A new shelf">
          <Input
            aria-label="Name"
            placeholder="Bestiary, Spellbook, The party's notebook…"
            value={shelfDraft.title}
            onValueChange={v => setShelfDraft(d => d && { ...d, title: v })}
          />
          <div className="mt-3">
            <p className="mb-1.5 font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
              Spine
            </p>
            <ShelfGlyphPicker
              value={shelfDraft.icon}
              onChange={icon => setShelfDraft(d => d && { ...d, icon })}
            />
          </div>
          <Textarea
            className="mt-3"
            label="What lives on it"
            minRows={2}
            value={shelfDraft.blurb}
            onValueChange={v => setShelfDraft(d => d && { ...d, blurb: v })}
          />
          <div className="mt-3 flex gap-2">
            <Button size="sm" color="primary" onPress={saveShelf}>
              Make the shelf
            </Button>
            <Button
              size="sm"
              variant="light"
              onPress={() => setShelfDraft(null)}
            >
              Cancel
            </Button>
          </div>
        </SectionCard>
      )}

      {draft && (
        <EntryEditor
          campaignId={campaignId}
          draft={draft}
          shelves={shelves}
          entries={entries}
          entryId={editingId}
          editing={Boolean(editingId)}
          onChange={setDraft}
          onSave={save}
          onCancel={() => {
            setDraft(null);
            setEditingId(null);
          }}
        />
      )}

      {/* ---- finding things ---- */}
      {entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            size="sm"
            aria-label="Search the archive"
            placeholder="Search…"
            value={query}
            onValueChange={setQuery}
            className="max-w-xs"
            classNames={{ inputWrapper: 'bg-surface-2 border-line' }}
          />
          <button
            type="button"
            onClick={() => setKindFilter('all')}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              kindFilter === 'all'
                ? 'border-gold bg-gold/15 text-ink'
                : 'border-line text-ink-muted hover:border-gold/60'
            }`}
          >
            Everything
          </button>
          {kindsInUse.map(kind => (
            <button
              key={kind}
              type="button"
              onClick={() => setKindFilter(kind)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                kindFilter === kind
                  ? 'border-gold bg-gold/15 text-ink'
                  : 'border-line text-ink-muted hover:border-gold/60'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Glyph name={CANON_KIND_GLYPHS[kind]} size={14} />
                {CANON_KIND_LABELS[kind]}
              </span>
            </button>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          scene={<TomeScene />}
          title="Nothing written down yet"
          description={
            isStaff
              ? 'Make a shelf — a bestiary, a spellbook, the party notebook — and file NPCs, places and lore onto it. Every entry keeps private notes beside the version the party is allowed to read.'
              : 'The DM has not shared any of the archive with the party yet.'
          }
        />
      ) : (
        <div className="space-y-5">
          {shelves.map(shelf => {
            const rows = byShelf.get(shelf.id) ?? [];
            return (
              <SectionCard
                key={shelf.id}
                title={
                  <span className="flex items-center gap-2">
                    <Glyph
                      name={shelfGlyph(shelf.icon)}
                      size={18}
                      className="text-gold"
                    />
                    <span>{shelf.title}</span>
                    <span className="font-sans text-sm text-ink-subtle">
                      ({rows.length})
                    </span>
                  </span>
                }
                description={shelf.blurb || undefined}
                actions={
                  isStaff ? (
                    <ShelfControls
                      campaignId={campaignId}
                      shelf={shelf}
                      act={act}
                    />
                  ) : undefined
                }
              >
                {rows.length === 0 ? (
                  <p className="text-sm text-ink-subtle">
                    {isStaff
                      ? 'Nothing filed here yet.'
                      : 'Nothing you have learned yet.'}
                  </p>
                ) : (
                  renderEntries(rows)
                )}
              </SectionCard>
            );
          })}

          {(byShelf.get(LOOSE)?.length ?? 0) > 0 && (
            <SectionCard
              title={
                <span className="flex items-center gap-2">
                  <Glyph name="quill" size={18} className="text-ink-subtle" />
                  <span>Loose pages</span>
                  <span className="font-sans text-sm text-ink-subtle">
                    ({byShelf.get(LOOSE)?.length})
                  </span>
                </span>
              }
              description="Entries not filed on a shelf."
            >
              {renderEntries(byShelf.get(LOOSE) ?? [])}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

/* --- one entry ----------------------------------------------------------- */

export function CanonCard({
  campaignId,
  entry,
  entries,
  shelves,
  members,
  isStaff,
  act,
  onEdit,
  onOpenPlace,
  defaultOpen,
  extra,
}: {
  campaignId: string;
  entry: CanonEntryRow;
  entries: CanonEntryRow[];
  shelves: CanonCollectionRow[];
  members: CampaignMemberRow[];
  isStaff: boolean;
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  onEdit: () => void;
  /** Open a place in the World: the "where" line becomes a way there. */
  onOpenPlace?: (placeId: string) => void;
  defaultOpen?: boolean;
  /** More, under the facts: the shop an NPC keeps. */
  extra?: React.ReactNode;
}) {
  // Short facts are the line under the name; a sentence is its own row.
  const defs = CANON_KIND_FIELDS[entry.kind];
  const facts = defs
    .filter(f => !f.long)
    .map(f => (entry.fields[f.key] ? `${f.label}: ${entry.fields[f.key]}` : ''))
    .filter(Boolean);
  const sentences = defs.filter(f => f.long && entry.fields[f.key]);
  const byId = new Map(entries.map(e => [e.id, e]));
  const where = entry.placeId ? placePath(entry.placeId, byId) : [];

  const linkable = entries.filter(
    o => o.id !== entry.id && !entry.links.some(l => l.id === o.id)
  );

  return (
    <EntryCard
      title={entry.title || 'Untitled'}
      kind={
        <span className="flex items-center gap-1.5">
          <Glyph name={CANON_KIND_GLYPHS[entry.kind]} size={13} />
          {CANON_KIND_LABELS[entry.kind]}
        </span>
      }
      imageUrl={
        entry.imageId
          ? `/api/campaigns/${campaignId}/images/${entry.imageId}`
          : null
      }
      imageAlt={entry.title}
      tone={entry.visibility === 'shared' ? 'gold' : 'arcane'}
      defaultOpen={defaultOpen}
      meta={
        facts.length > 0 || where.length > 0 ? (
          <>
            {where.length > 0 && (
              <span className="mr-2 inline-flex items-center gap-1">
                <Glyph name="compass" size={11} />
                {onOpenPlace ? (
                  <button
                    type="button"
                    className="underline-offset-2 hover:text-ink hover:underline"
                    onClick={() => onOpenPlace(entry.placeId!)}
                  >
                    {pathLabel(where)}
                  </button>
                ) : (
                  pathLabel(where)
                )}
              </span>
            )}
            {facts.join(' · ')}
          </>
        ) : undefined
      }
      badges={
        entry.visibility === 'shared' ? (
          <Pill tone="gold">Party knows</Pill>
        ) : entry.revealedToMe ? (
          <Pill tone="arcane">Told to you</Pill>
        ) : (
          isStaff &&
          (entry.revealedTo.length > 0 ? (
            <Pill tone="arcane">
              Told to{' '}
              {entry.revealedTo.map(r => r.name || 'a player').join(', ')}
            </Pill>
          ) : (
            <Pill tone="warning">
              {entry.kind === 'npc' ? 'Not met yet' : 'DM only'}
            </Pill>
          ))
        )
      }
      summary={
        entry.partyBody.trim()
          ? entry.partyBody.trim().split('\n')[0].slice(0, 160)
          : isStaff
            ? 'No party-facing text yet.'
            : undefined
      }
    >
      <div className="space-y-3 text-sm">
        {sentences.length > 0 && (
          <dl className="space-y-1">
            {sentences.map(f => (
              <div key={f.key}>
                <dt className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
                  {f.label}
                </dt>
                <dd className="text-ink-muted">{entry.fields[f.key]}</dd>
              </div>
            ))}
          </dl>
        )}

        {entry.partyBody.trim() && (
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
              {isStaff ? 'Party text' : 'What you know'}
            </p>
            <p className="whitespace-pre-wrap text-ink-muted">
              {entry.partyBody}
            </p>
          </div>
        )}

        {isStaff && (
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
              DM notes
            </p>
            <p className="whitespace-pre-wrap text-ink-muted">
              {entry.dmBody?.trim() || '—'}
            </p>
          </div>
        )}

        {entry.links.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
              Related
            </span>
            {entry.links.map(l => (
              <span
                key={l.id}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-muted"
              >
                <Glyph
                  name={CANON_KIND_GLYPHS[l.kind]}
                  size={12}
                  className="mr-1 align-[-1px]"
                />
                {l.title}
                {isStaff && (
                  <button
                    type="button"
                    className="ml-1 text-ink-subtle hover:text-danger"
                    onClick={() =>
                      act(unlinkCanonAction(campaignId, entry.id, l.id))
                    }
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {isStaff && STAT_KINDS.includes(entry.kind) && (
          <NpcDepth campaignId={campaignId} entry={entry} act={act} />
        )}

        {entry.kind === 'faction' && (
          <FactionStanding entry={entry} isStaff={isStaff} act={act} />
        )}

        {extra}

        {(entry.kind === 'npc' || entry.kind === 'location') && (
          <PartyNotes
            campaignId={campaignId}
            entryId={entry.id}
            notes={entry.partyNotes}
            act={act}
            place={entry.kind === 'location'}
          />
        )}

        {isStaff && (
          <div className="space-y-3 border-t border-line pt-3">
            <RevealControls
              levels={[
                {
                  key: 'dm',
                  label: 'Kept back',
                  hint: 'Only you and your co-DMs can read this.',
                },
                {
                  key: 'shared',
                  label: 'The whole party',
                  hint: 'Every player sees the party text.',
                },
              ]}
              value={entry.visibility}
              onSet={next =>
                act(setCanonVisibilityAction(campaignId, entry.id, next))
              }
              members={
                entry.visibility === 'dm'
                  ? members
                      .filter(m => m.role === 'player')
                      .map(m => ({
                        userId: m.userId,
                        name: m.name || m.email || 'Player',
                      }))
                  : undefined
              }
              revealedTo={entry.revealedTo.map(r => r.userId)}
              onToggleMember={(userId, next) =>
                act(
                  next
                    ? revealCanonAction(campaignId, entry.id, userId)
                    : unrevealCanonAction(campaignId, entry.id, userId)
                )
              }
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="light" onPress={onEdit}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="light"
                className="text-ink-muted data-[hover=true]:text-danger"
                onPress={() => act(deleteCanonAction(campaignId, entry.id))}
              >
                Delete
              </Button>
              {linkable.length > 0 && (
                <Select
                  size="sm"
                  aria-label="Link to another entry"
                  placeholder="Link to…"
                  className="max-w-[12rem]"
                  selectedKeys={[]}
                  onSelectionChange={keys => {
                    const to = Array.from(keys)[0];
                    if (to)
                      act(linkCanonAction(campaignId, entry.id, String(to)));
                  }}
                >
                  {linkable.map(o => (
                    <SelectItem key={o.id}>{o.title}</SelectItem>
                  ))}
                </Select>
              )}
              {shelves.length > 0 && (
                <Select
                  size="sm"
                  aria-label="Shelf"
                  placeholder="File on…"
                  className="max-w-[12rem]"
                  selectedKeys={entry.collectionId ? [entry.collectionId] : []}
                  onSelectionChange={keys => {
                    const to = Array.from(keys)[0];
                    act(
                      updateCanonAction(campaignId, entry.id, {
                        collectionId: to ? String(to) : null,
                      })
                    );
                  }}
                >
                  {shelves.map(s => (
                    <SelectItem key={s.id} textValue={s.title}>
                      <span className="flex items-center gap-2">
                        <Glyph name={shelfGlyph(s.icon)} size={15} />
                        {s.title}
                      </span>
                    </SelectItem>
                  ))}
                </Select>
              )}
            </div>
          </div>
        )}
      </div>
    </EntryCard>
  );
}

function ShelfControls({
  campaignId,
  shelf,
  act,
}: {
  campaignId: string;
  shelf: CanonCollectionRow;
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(shelf.title);

  if (renaming) {
    return (
      <div className="flex items-center gap-2">
        <Input
          size="sm"
          aria-label="Shelf name"
          value={title}
          onValueChange={setTitle}
          className="w-48"
        />
        <Button
          size="sm"
          color="primary"
          onPress={async () => {
            await act(
              updateCanonCollectionAction(campaignId, shelf.id, { title })
            );
            setRenaming(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="light" onPress={() => setRenaming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="light" onPress={() => setRenaming(true)}>
        Rename
      </Button>
      <Button
        size="sm"
        variant="light"
        className="text-ink-muted data-[hover=true]:text-danger"
        onPress={() => act(deleteCanonCollectionAction(campaignId, shelf.id))}
      >
        Remove shelf
      </Button>
    </div>
  );
}

/* --- the editor ---------------------------------------------------------- */

export function EntryEditor({
  campaignId,
  draft,
  shelves,
  entries,
  entryId = null,
  editing,
  onChange,
  onSave,
  onCancel,
  extra,
}: {
  campaignId: string;
  draft: Draft;
  shelves: CanonCollectionRow[];
  /** Every entry, for the "where" picker. */
  entries: CanonEntryRow[];
  /** The entry being edited — kept off its own "where" list. */
  entryId?: string | null;
  editing: boolean;
  onChange: (next: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  /** More controls beside the name: a die that rolls one. */
  extra?: React.ReactNode;
}) {
  const fields = CANON_KIND_FIELDS[draft.kind];
  const short = fields.filter(f => !f.long);
  const long = fields.filter(f => f.long);

  return (
    <SectionCard
      framed
      title={editing ? 'Edit this entry' : 'A new entry'}
      bodyClassName="border-t-2 border-t-arcane/50"
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Select
          aria-label="Kind"
          selectedKeys={[draft.kind]}
          onSelectionChange={keys => {
            const kind = (Array.from(keys)[0] as CanonKind) ?? draft.kind;
            // Facts belong to a kind; changing kind starts them fresh.
            onChange({ ...draft, kind, fields: {} });
          }}
        >
          {CANON_KINDS.map(k => (
            <SelectItem key={k} textValue={CANON_KIND_LABELS[k]}>
              <span className="flex items-center gap-2">
                <Glyph name={CANON_KIND_GLYPHS[k]} size={15} />
                {CANON_KIND_LABELS[k]}
              </span>
            </SelectItem>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Title"
            placeholder="Name of the NPC, place, spell…"
            value={draft.title}
            onValueChange={v => onChange({ ...draft, title: v })}
            className="flex-1"
          />
          {extra}
        </div>
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-[auto_1fr]">
        <ImagePicker
          campaignId={campaignId}
          value={draft.imageId}
          onChange={imageId => onChange({ ...draft, imageId })}
        />

        <div className="space-y-3">
          {shelves.length > 0 && (
            <Select
              aria-label="Shelf"
              label="Shelf"
              placeholder="Loose page"
              selectedKeys={draft.collectionId ? [draft.collectionId] : []}
              onSelectionChange={keys => {
                const id = Array.from(keys)[0];
                onChange({
                  ...draft,
                  collectionId: id ? String(id) : null,
                });
              }}
            >
              {shelves.map(s => (
                <SelectItem key={s.id} textValue={s.title}>
                  <span className="flex items-center gap-2">
                    <Glyph name={shelfGlyph(s.icon)} size={15} />
                    {s.title}
                  </span>
                </SelectItem>
              ))}
            </Select>
          )}

          <PlacePicker
            entries={entries}
            value={draft.placeId}
            within={draft.kind === 'location' ? entryId : null}
            label={PLACE_LABEL[draft.kind]}
            onChange={placeId => onChange({ ...draft, placeId })}
          />

          {short.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {short.map(field => (
                <Input
                  key={field.key}
                  size="sm"
                  label={field.label}
                  placeholder={field.placeholder}
                  value={draft.fields[field.key] ?? ''}
                  onValueChange={v =>
                    onChange({
                      ...draft,
                      fields: { ...draft.fields, [field.key]: v },
                    })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {long.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {long.map(field => (
            <Textarea
              key={field.key}
              size="sm"
              minRows={2}
              label={field.label}
              placeholder={field.placeholder}
              value={draft.fields[field.key] ?? ''}
              onValueChange={v =>
                onChange({
                  ...draft,
                  fields: { ...draft.fields, [field.key]: v },
                })
              }
            />
          ))}
        </div>
      )}

      <Textarea
        className="mt-3"
        label="DM notes (private)"
        minRows={3}
        value={draft.dmBody}
        onValueChange={v => onChange({ ...draft, dmBody: v })}
      />
      <Textarea
        className="mt-3"
        label="What the party knows"
        minRows={3}
        value={draft.partyBody}
        onValueChange={v => onChange({ ...draft, partyBody: v })}
      />

      <div className="mt-3 flex gap-2">
        <Button size="sm" color="primary" onPress={onSave}>
          {editing ? 'Save' : 'Add to the archive'}
        </Button>
        <Button size="sm" variant="light" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </SectionCard>
  );
}
