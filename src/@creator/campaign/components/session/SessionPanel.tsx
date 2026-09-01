'use client';

import {
  Button,
  Chip,
  Image as HeroImage,
  Input,
  NumberInput,
  Switch,
  Textarea,
} from '@heroui/react';
import { useRef, useState } from 'react';

import { motion } from '@/@shared/components/motion';
import { DiceSpinner, EmptyState, SectionCard } from '@/@shared/components/ui';
import { useCampaignLive } from '@/@shared/hooks/useCampaignLive';
import type { EntryRow, HandoutRow, LiveState } from '@/server/session';
import {
  addEntryAction,
  addPartyAction,
  advanceTurnAction,
  createEncounterAction,
  createNoteAction,
  deleteHandoutAction,
  endEncounterAction,
  removeEntryAction,
  setHandoutVisibilityAction,
  updateEntryAction,
} from '../../actions';

function hpWord(cur: number | null, max: number | null): string {
  if (cur == null || max == null || max <= 0) return '—';
  const pct = cur / max;
  if (cur <= 0) return 'Down';
  if (pct <= 0.5) return 'Bloodied';
  return 'Healthy';
}

/* --- initiative ---------------------------------------------------- */

function InitiativeTracker({
  state,
  isStaff,
  refresh,
}: {
  state: LiveState;
  isStaff: boolean;
  refresh: () => void;
}) {
  const enc = state.encounter;
  const [newLabel, setNewLabel] = useState('');
  const [newInit, setNewInit] = useState(10);

  const act = async (p: Promise<{ ok: boolean }>) => {
    await p;
    refresh();
  };

  if (!enc) {
    if (isStaff) return null; // SessionPanel shows the "start" card
    return (
      <SectionCard title="Initiative">
        <EmptyState
          icon="⚔️"
          title="No encounter running"
          description="The DM hasn't started one yet."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={enc.name}
      description={`Round ${enc.round}`}
      actions={
        isStaff && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="flat"
              onPress={() => act(advanceTurnAction(enc.id, -1))}
            >
              Prev
            </Button>
            <motion.div whileTap={{ rotate: [0, -6, 6, -3, 0] }}>
              <Button
                size="sm"
                color="primary"
                onPress={() => act(advanceTurnAction(enc.id, 1))}
              >
                Next turn
              </Button>
            </motion.div>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() => act(endEncounterAction(enc.id))}
            >
              End
            </Button>
          </div>
        )
      }
    >
      <ol className="divide-y divide-line">
        {state.entries.map((e: EntryRow, i) => {
          const current = i === enc.turnIndex;
          return (
            <li
              key={e.id}
              className={`flex flex-wrap items-center gap-3 py-2.5 ${
                current ? 'rounded-md bg-surface-2 px-2' : ''
              }`}
            >
              <span className="w-8 text-center font-display text-lg tabular-nums text-ink">
                {e.initiative}
              </span>
              <span className="flex-1 text-sm text-ink">
                {current && <span className="mr-1 text-gold">▶</span>}
                {e.label}
                {e.conditions && (
                  <Chip size="sm" variant="flat" className="ml-2 bg-surface-2">
                    {e.conditions}
                  </Chip>
                )}
              </span>

              {isStaff ? (
                <>
                  <NumberInput
                    aria-label="HP"
                    size="sm"
                    className="w-20"
                    value={e.hpCurrent ?? 0}
                    onValueChange={v =>
                      act(
                        updateEntryAction(e.id, { hpCurrent: Number(v) || 0 })
                      )
                    }
                  />
                  <Input
                    aria-label="Conditions"
                    size="sm"
                    placeholder="conditions"
                    className="w-32"
                    defaultValue={e.conditions}
                    onBlur={ev =>
                      act(
                        updateEntryAction(e.id, {
                          conditions: ev.target.value,
                        })
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="light"
                    className="text-ink-muted data-[hover=true]:text-danger"
                    onPress={() => act(removeEntryAction(e.id))}
                  >
                    ✕
                  </Button>
                </>
              ) : (
                <span className="text-xs text-ink-muted">
                  {hpWord(e.hpCurrent, e.hpMax)}
                </span>
              )}
            </li>
          );
        })}
        {state.entries.length === 0 && (
          <li className="py-3 text-sm text-ink-subtle">No combatants yet.</li>
        )}
      </ol>

      {isStaff && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <Input
            size="sm"
            label="Add combatant"
            placeholder="Goblin"
            value={newLabel}
            onValueChange={setNewLabel}
            className="flex-1"
          />
          <NumberInput
            size="sm"
            label="Init"
            className="w-20"
            value={newInit}
            onValueChange={v => setNewInit(Number(v) || 0)}
          />
          <Button
            size="sm"
            color="primary"
            isDisabled={!newLabel.trim()}
            onPress={() => {
              act(
                addEntryAction(enc.id, {
                  label: newLabel,
                  initiative: newInit,
                })
              );
              setNewLabel('');
            }}
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="flat"
            onPress={() => act(addPartyAction(enc.id))}
          >
            Add party
          </Button>
        </div>
      )}
    </SectionCard>
  );
}

/* --- handouts ---------------------------------------------------- */

function HandoutsPanel({
  campaignId,
  state,
  isStaff,
  refresh,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', file.name);
    const res = await fetch(`/api/campaigns/${campaignId}/handouts`, {
      method: 'POST',
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? 'Upload failed.');
      return;
    }
    refresh();
  };

  const act = async (p: Promise<{ ok: boolean }>) => {
    await p;
    refresh();
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
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}

      {state.handouts.length === 0 ? (
        <EmptyState
          icon="📜"
          title="No handouts"
          description={
            isStaff
              ? 'Upload an image or write a note, then share it.'
              : 'The DM hasn’t shared anything yet.'
          }
        />
      ) : (
        <div className="space-y-3">
          {state.handouts.map((h: HandoutRow) => (
            <div
              key={h.id}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">
                  {h.title || (h.kind === 'image' ? 'Image' : 'Note')}
                </span>
                {isStaff && (
                  <div className="flex items-center gap-2">
                    <Switch
                      size="sm"
                      isSelected={h.visibility === 'shared'}
                      onValueChange={v =>
                        act(
                          setHandoutVisibilityAction(h.id, v ? 'shared' : 'dm')
                        )
                      }
                    >
                      <span className="text-xs text-ink-muted">Shared</span>
                    </Switch>
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

/* --- panel ---------------------------------------------------- */

export function SessionPanel({ campaignId }: { campaignId: string }) {
  const { state, error, refresh } = useCampaignLive(campaignId);
  const [name, setName] = useState('');

  if (!state) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Rolling initiative…" />
      </div>
    );
  }

  const isStaff = state.role === 'gm' || state.role === 'co-gm';

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      {isStaff && !state.encounter && (
        <SectionCard title="Start an encounter">
          <div className="flex gap-2">
            <Input
              size="sm"
              placeholder="Encounter name"
              value={name}
              onValueChange={setName}
              className="flex-1"
            />
            <Button
              size="sm"
              color="primary"
              onPress={async () => {
                await createEncounterAction(campaignId, name);
                setName('');
                refresh();
              }}
            >
              Start
            </Button>
          </div>
        </SectionCard>
      )}

      <InitiativeTracker state={state} isStaff={isStaff} refresh={refresh} />
      <HandoutsPanel
        campaignId={campaignId}
        state={state}
        isStaff={isStaff}
        refresh={refresh}
      />
    </div>
  );
}
