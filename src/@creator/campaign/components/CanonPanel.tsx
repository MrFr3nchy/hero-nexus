'use client';

import {
  Button,
  Checkbox,
  Chip,
  Input,
  Select,
  SelectItem,
  Switch,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { DiceSpinner, EmptyState, SectionCard } from '@/@shared/components/ui';
import type { CampaignRole, CampaignMemberRow } from '@/server/campaigns';
import {
  CANON_KINDS,
  type CanonEntryRow,
  type CanonKind,
} from '@/@creator/campaign/lib/canon';
import { listMembersAction } from '../actions';
import {
  createCanonAction,
  deleteCanonAction,
  linkCanonAction,
  listCanonAction,
  revealCanonAction,
  setCanonVisibilityAction,
  unlinkCanonAction,
  unrevealCanonAction,
  updateCanonAction,
} from '../canon-actions';

const KIND_LABEL: Record<CanonKind, string> = {
  npc: 'NPC',
  location: 'Location',
  item: 'Item',
  faction: 'Faction',
  lore: 'Lore',
};

const emptyDraft = {
  kind: 'npc' as CanonKind,
  title: '',
  dmBody: '',
  partyBody: '',
};

type Draft = typeof emptyDraft;

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
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const list = await listCanonAction(campaignId);
      setEntries(list);
      if (isStaff) setMembers(await listMembersAction(campaignId));
    } catch {
      setError('Failed to load the canon.');
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

  const submitNew = async () => {
    if (!newDraft.title.trim()) return;
    const res = await createCanonAction(campaignId, newDraft);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewDraft(emptyDraft);
    setCreating(false);
    await refresh();
  };

  const startEdit = (e: CanonEntryRow) => {
    setEditingId(e.id);
    setEditDraft({
      kind: e.kind,
      title: e.title,
      dmBody: e.dmBody ?? '',
      partyBody: e.partyBody,
    });
  };

  const saveEdit = async (id: string) => {
    const res = await updateCanonAction(campaignId, id, editDraft);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditingId(null);
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Opening the archive…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isStaff && (
        <SectionCard title="Add to the canon">
          {creating ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <Select
                  aria-label="Kind"
                  selectedKeys={[newDraft.kind]}
                  onSelectionChange={keys =>
                    setNewDraft(d => ({
                      ...d,
                      kind: (Array.from(keys)[0] as CanonKind) ?? d.kind,
                    }))
                  }
                >
                  {CANON_KINDS.map(k => (
                    <SelectItem key={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </Select>
                <Input
                  aria-label="Title"
                  placeholder="Name of the NPC, place, faction…"
                  value={newDraft.title}
                  onValueChange={v => setNewDraft(d => ({ ...d, title: v }))}
                />
              </div>
              <Textarea
                label="DM notes (private)"
                minRows={3}
                value={newDraft.dmBody}
                onValueChange={v => setNewDraft(d => ({ ...d, dmBody: v }))}
              />
              <Textarea
                label="What the party knows"
                minRows={3}
                value={newDraft.partyBody}
                onValueChange={v => setNewDraft(d => ({ ...d, partyBody: v }))}
              />
              <div className="flex gap-2">
                <Button color="primary" size="sm" onPress={submitNew}>
                  Create
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => {
                    setCreating(false);
                    setNewDraft(emptyDraft);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="flat" onPress={() => setCreating(true)}>
              New entry
            </Button>
          )}
        </SectionCard>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon="📖"
          title="Nothing written down yet"
          description={
            isStaff
              ? 'Add NPCs, places and lore. Each entry has private notes and a separate party-facing version you reveal when the party learns it.'
              : 'The DM has not shared any canon with the party yet.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {entries.map(e => (
            <li key={e.id}>
              <SectionCard
                title={
                  <span className="flex items-center gap-2">
                    <Chip size="sm" variant="flat">
                      {KIND_LABEL[e.kind]}
                    </Chip>
                    <span>{e.title}</span>
                    {e.visibility === 'shared' ? (
                      <Chip size="sm" color="success" variant="flat">
                        Shared
                      </Chip>
                    ) : e.revealedToMe ? (
                      <Chip size="sm" color="warning" variant="flat">
                        Revealed to you
                      </Chip>
                    ) : null}
                  </span>
                }
              >
                {editingId === e.id ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                      <Select
                        aria-label="Kind"
                        selectedKeys={[editDraft.kind]}
                        onSelectionChange={keys =>
                          setEditDraft(d => ({
                            ...d,
                            kind: (Array.from(keys)[0] as CanonKind) ?? d.kind,
                          }))
                        }
                      >
                        {CANON_KINDS.map(k => (
                          <SelectItem key={k}>{KIND_LABEL[k]}</SelectItem>
                        ))}
                      </Select>
                      <Input
                        aria-label="Title"
                        value={editDraft.title}
                        onValueChange={v =>
                          setEditDraft(d => ({ ...d, title: v }))
                        }
                      />
                    </div>
                    <Textarea
                      label="DM notes (private)"
                      minRows={3}
                      value={editDraft.dmBody}
                      onValueChange={v =>
                        setEditDraft(d => ({ ...d, dmBody: v }))
                      }
                    />
                    <Textarea
                      label="What the party knows"
                      minRows={3}
                      value={editDraft.partyBody}
                      onValueChange={v =>
                        setEditDraft(d => ({ ...d, partyBody: v }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        color="primary"
                        onPress={() => saveEdit(e.id)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    {isStaff && (
                      <div>
                        <p className="text-[0.7rem] uppercase tracking-[0.1em] text-ink-subtle">
                          DM notes
                        </p>
                        <p className="whitespace-pre-wrap text-ink-muted">
                          {e.dmBody?.trim() || '—'}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[0.7rem] uppercase tracking-[0.1em] text-ink-subtle">
                        {isStaff ? 'Party text' : 'What the party knows'}
                      </p>
                      <p className="whitespace-pre-wrap text-ink-muted">
                        {e.partyBody.trim() || '—'}
                      </p>
                    </div>

                    {e.links.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.7rem] uppercase tracking-[0.1em] text-ink-subtle">
                          Related
                        </span>
                        {e.links.map(l => (
                          <Chip key={l.id} size="sm" variant="flat">
                            {l.title}
                            {isStaff && (
                              <button
                                type="button"
                                className="ml-1 text-ink-subtle hover:text-danger"
                                onClick={() =>
                                  act(unlinkCanonAction(campaignId, e.id, l.id))
                                }
                              >
                                ×
                              </button>
                            )}
                          </Chip>
                        ))}
                      </div>
                    )}

                    {isStaff && (
                      <CanonStaffControls
                        campaignId={campaignId}
                        entry={e}
                        entries={entries}
                        members={members}
                        act={act}
                        onEdit={() => startEdit(e)}
                      />
                    )}
                  </div>
                )}
              </SectionCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CanonStaffControls({
  campaignId,
  entry,
  entries,
  members,
  act,
  onEdit,
}: {
  campaignId: string;
  entry: CanonEntryRow;
  entries: CanonEntryRow[];
  members: CampaignMemberRow[];
  act: (_p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  onEdit: () => void;
}) {
  const linkable = entries.filter(
    o => o.id !== entry.id && !entry.links.some(l => l.id === o.id)
  );
  const revealedIds = new Set(entry.revealedTo.map(r => r.userId));

  return (
    <div className="space-y-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          size="sm"
          isSelected={entry.visibility === 'shared'}
          onValueChange={v =>
            act(
              setCanonVisibilityAction(
                campaignId,
                entry.id,
                v ? 'shared' : 'dm'
              )
            )
          }
        >
          Shared with the whole party
        </Switch>
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
      </div>

      {linkable.length > 0 && (
        <Select
          size="sm"
          aria-label="Link to another entry"
          placeholder="Link to another entry…"
          className="max-w-xs"
          selectedKeys={[]}
          onSelectionChange={keys => {
            const to = Array.from(keys)[0];
            if (to) act(linkCanonAction(campaignId, entry.id, String(to)));
          }}
        >
          {linkable.map(o => (
            <SelectItem key={o.id}>{o.title}</SelectItem>
          ))}
        </Select>
      )}

      {entry.visibility === 'dm' && (
        <div>
          <p className="mb-1 text-[0.7rem] uppercase tracking-[0.1em] text-ink-subtle">
            Reveal to specific people
          </p>
          <div className="flex flex-wrap gap-3">
            {members.map(m => (
              <Checkbox
                key={m.userId}
                size="sm"
                isSelected={revealedIds.has(m.userId)}
                onValueChange={v =>
                  act(
                    v
                      ? revealCanonAction(campaignId, entry.id, m.userId)
                      : unrevealCanonAction(campaignId, entry.id, m.userId)
                  )
                }
              >
                {m.name || m.email || 'User'}
              </Checkbox>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
