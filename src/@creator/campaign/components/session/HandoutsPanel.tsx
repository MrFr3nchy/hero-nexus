'use client';

import {
  Button,
  Image as HeroImage,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { EmptyState, HandoutScene, SectionCard } from '@/@shared/components/ui';
import type { CampaignMemberRow } from '@/server/campaigns';
import type { SessionRow } from '@/server/campaign-sessions';
import type { HandoutRow, LiveState } from '@/server/session';
import { fileUnderSessionAction } from '../../chronicle-actions';
import {
  createNoteAction,
  deleteHandoutAction,
  listMembersAction,
  setHandoutVisibilityAction,
} from '../../actions';

/**
 * The things a DM pushes at the table: a map, a letter, a name written down.
 *
 * Staff see everything and choose who sees what; a player receives what was
 * shared with the table plus anything addressed to them by name — the
 * filtering happens in `getLiveState`, not here, and the file route
 * authorises separately so a guessed id is refused the bytes. Each handout
 * can be filed under the sitting it was shown at, so the chronicle gathers
 * them instead of leaving a flat pile.
 */
export function HandoutsPanel({
  campaignId,
  state,
  isStaff,
  sessions,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  sessions: SessionRow[];
  refresh: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [uploading, setUploading] = useState(false);
  /** The handout whose audience is being chosen, if any. */
  const [addressing, setAddressing] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);

  const loadMembers = useCallback(async () => {
    if (!isStaff) return;
    setMembers(await listMembersAction(campaignId).catch(() => []));
  }, [campaignId, isStaff]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const upload = async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', file.name);
    const res = await fetch(`/api/campaigns/${campaignId}/handouts`, {
      method: 'POST',
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      onError(body.error ?? 'Upload failed.');
      return;
    }
    await refresh();
  };

  return (
    <SectionCard title="Handouts">
      {isStaff && (
        <div className="mb-4 space-y-3 border-b border-line pb-4">
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
            <Button
              size="sm"
              variant="flat"
              isLoading={uploading}
              onPress={() => fileRef.current?.click()}
            >
              Upload image
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              size="sm"
              placeholder="Note title"
              value={noteTitle}
              onValueChange={setNoteTitle}
              className="sm:w-48"
            />
            <Textarea
              size="sm"
              placeholder="Note for your players…"
              value={noteBody}
              onValueChange={setNoteBody}
              minRows={1}
              className="flex-1"
            />
            <Button
              size="sm"
              color="primary"
              isDisabled={!noteBody.trim()}
              onPress={() => {
                act(createNoteAction(campaignId, noteTitle, noteBody));
                setNoteTitle('');
                setNoteBody('');
              }}
            >
              Add note
            </Button>
          </div>
        </div>
      )}

      {state.handouts.length === 0 ? (
        <EmptyState
          scene={<HandoutScene />}
          title="Nothing has been passed across the table"
          description={
            isStaff
              ? 'Upload a map or write a note, then share it when the moment comes.'
              : 'The DM hasn’t shown you anything yet.'
          }
        />
      ) : (
        <div className="space-y-3">
          {state.handouts.map((h: HandoutRow) => (
            <div
              key={h.id}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">
                  {h.title || (h.kind === 'image' ? 'Image' : 'Note')}
                </span>
                {isStaff && (
                  <div className="flex flex-wrap items-center gap-2">
                    {sessions.length > 0 && (
                      <Select
                        aria-label="File under a session"
                        size="sm"
                        className="w-40"
                        placeholder="Unfiled"
                        onSelectionChange={keys => {
                          const key = Array.from(keys)[0];
                          act(
                            fileUnderSessionAction(
                              campaignId,
                              'handout',
                              h.id,
                              key ? String(key) : null
                            )
                          );
                        }}
                      >
                        {sessions.map(s => (
                          <SelectItem
                            key={s.id}
                            textValue={`Session ${s.number}`}
                          >
                            Session {s.number}
                            {s.title ? ` · ${s.title}` : ''}
                          </SelectItem>
                        ))}
                      </Select>
                    )}
                    {/* Three states, so a picker rather than a switch: to
                        the table, to particular people, or to nobody yet.
                        The middle one is what a clue meant for the character
                        who reads Infernal has always needed. */}
                    <Select
                      aria-label="Who sees this"
                      size="sm"
                      className="w-32"
                      selectedKeys={[h.visibility]}
                      onSelectionChange={keys => {
                        const key = String(Array.from(keys)[0] ?? 'dm');
                        if (key === 'selected') {
                          // Picking the people is a second decision, so the
                          // control for it opens rather than the visibility
                          // flipping to a state with nobody in it.
                          setAddressing(h.id);
                          return;
                        }
                        setAddressing(null);
                        act(
                          setHandoutVisibilityAction(
                            h.id,
                            key as 'dm' | 'shared'
                          )
                        );
                      }}
                    >
                      <SelectItem key="dm" textValue="Behind the screen">
                        Behind it
                      </SelectItem>
                      <SelectItem key="shared" textValue="The whole table">
                        The table
                      </SelectItem>
                      <SelectItem key="selected" textValue="Particular people">
                        Just some
                      </SelectItem>
                    </Select>
                    <Button
                      size="sm"
                      variant="light"
                      className="text-ink-muted data-[hover=true]:text-danger"
                      onPress={() => act(deleteHandoutAction(h.id))}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>

              {isStaff && h.visibility === 'selected' && (
                <p className="text-xs text-ink-subtle">
                  Shown to {h.targetNames.join(', ') || 'nobody'}
                </p>
              )}

              {isStaff && addressing === h.id && (
                <div className="flex flex-wrap items-end gap-2 rounded-md border border-arcane/40 bg-arcane/5 px-2.5 py-2">
                  <Select
                    aria-label="Who sees this handout"
                    size="sm"
                    selectionMode="multiple"
                    className="min-w-44 flex-1"
                    placeholder="Choose who"
                    selectedKeys={new Set(chosen)}
                    onSelectionChange={keys =>
                      setChosen(Array.from(keys).map(String))
                    }
                  >
                    {members.map(m => (
                      <SelectItem
                        key={m.userId}
                        textValue={m.name ?? m.email ?? 'Somebody'}
                      >
                        {m.characterName ?? m.name ?? m.email ?? 'Somebody'}
                      </SelectItem>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    color="primary"
                    isDisabled={chosen.length === 0}
                    onPress={() => {
                      act(setHandoutVisibilityAction(h.id, 'selected', chosen));
                      setAddressing(null);
                      setChosen([]);
                    }}
                  >
                    Slide it across
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    className="text-ink-subtle"
                    onPress={() => setAddressing(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {h.kind === 'image' ? (
                <HeroImage
                  alt={h.title}
                  src={`/api/campaigns/${campaignId}/handouts/${h.id}`}
                  className="max-h-96 w-auto rounded-md"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-ink-muted">
                  {h.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
