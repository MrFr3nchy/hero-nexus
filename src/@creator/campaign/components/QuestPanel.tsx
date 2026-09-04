'use client';

import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  Marginalia,
  Pill,
  QuestScene,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { ObjectiveRow, QuestRow, QuestStatus } from '@/server/quests';
import {
  addObjectiveAction,
  createQuestAction,
  deleteObjectiveAction,
  deleteQuestAction,
  listQuestsAction,
  setObjectiveDoneAction,
  setObjectiveVisibilityAction,
  updateQuestAction,
} from '../quest-actions';

const STATUS: {
  key: QuestStatus;
  label: string;
  tone: 'gold' | 'default' | 'success' | 'warning';
}[] = [
  { key: 'rumour', label: 'Rumour', tone: 'default' },
  { key: 'active', label: 'In hand', tone: 'gold' },
  { key: 'done', label: 'Done', tone: 'success' },
  { key: 'failed', label: 'Failed', tone: 'warning' },
];

const STATUS_BY_KEY = Object.fromEntries(STATUS.map(s => [s.key, s]));

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/* --- objectives ------------------------------------------------------ */

/**
 * The ticked lines, in the margin voice (design language: quest log).
 * A gold ※ for open, a verdigris ✓ and a strike for done.
 */
function Objectives({
  objectives,
  isStaff,
  act,
}: {
  objectives: ObjectiveRow[];
  isStaff: boolean;
  act: Act;
}) {
  if (objectives.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1">
      {objectives.map(o => (
        <li key={o.id} className="group flex items-start gap-2">
          <button
            type="button"
            disabled={!isStaff}
            aria-label={o.done ? 'Mark not done' : 'Mark done'}
            onClick={() => act(setObjectiveDoneAction(o.id, !o.done))}
            className={`mt-0.5 shrink-0 text-sm ${
              o.done ? 'text-success' : 'text-gold'
            } ${isStaff ? 'hover:opacity-70' : 'cursor-default'}`}
          >
            {o.done ? '✓' : '※'}
          </button>
          <span
            className={`flex-1 font-hand text-[1.1875rem] leading-snug ${
              o.done ? 'text-ink-subtle line-through' : 'text-ink-muted'
            }`}
          >
            {o.body}
          </span>
          {isStaff && (
            <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() =>
                  act(
                    setObjectiveVisibilityAction(
                      o.id,
                      o.visibility === 'shared' ? 'dm' : 'shared'
                    )
                  )
                }
                className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-ink"
              >
                {o.visibility === 'shared' ? 'shared' : 'yours'}
              </button>
              <button
                type="button"
                aria-label="Remove objective"
                onClick={() => act(deleteObjectiveAction(o.id))}
                className="text-ink-subtle hover:text-danger"
              >
                ✕
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/* --- one quest -------------------------------------------------------- */

function QuestEntry({
  campaignId,
  quest,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  quest: QuestRow;
  isStaff: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: quest.title,
    summary: quest.summary,
    dmNotes: quest.dmNotes ?? '',
    giver: quest.giver,
    reward: quest.reward,
  });
  const [objective, setObjective] = useState('');
  const { confirm, dialog } = useConfirm();

  const act: Act = async p => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Drop “${quest.title || 'this quest'}”?`,
      body: 'Its objectives go with it.',
      confirmLabel: 'Drop it',
      destructive: true,
    });
    if (ok) await act(deleteQuestAction(campaignId, quest.id));
  };

  const status = STATUS_BY_KEY[quest.status];
  const open = quest.objectives.filter(o => !o.done).length;

  return (
    <article
      className={`rounded-[var(--radius-card)] border bg-surface p-4 [box-shadow:var(--shadow-card)] ${
        quest.status === 'done'
          ? 'border-line opacity-80'
          : quest.status === 'failed'
            ? 'border-warning/40'
            : 'border-line'
      }`}
    >
      {dialog}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg text-ink">
            {quest.title || 'Untitled thread'}
          </h3>
          {(quest.giver || quest.reward) && (
            <p className="text-xs text-ink-subtle">
              {quest.giver && <>From {quest.giver}</>}
              {quest.giver && quest.reward && ' · '}
              {quest.reward && <>for {quest.reward}</>}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Pill tone={status.tone}>{status.label}</Pill>
          {isStaff && quest.visibility === 'dm' && (
            <Pill tone="warning">Yours alone</Pill>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <Input
            size="sm"
            label="Title"
            value={draft.title}
            onValueChange={v => setDraft(d => ({ ...d, title: v }))}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              size="sm"
              label="Given by"
              placeholder="Mother Aldys"
              value={draft.giver}
              onValueChange={v => setDraft(d => ({ ...d, giver: v }))}
              className="flex-1"
            />
            <Input
              size="sm"
              label="Reward"
              placeholder="200 gp and a favour"
              value={draft.reward}
              onValueChange={v => setDraft(d => ({ ...d, reward: v }))}
              className="flex-1"
            />
          </div>
          <Textarea
            size="sm"
            label="What the party has been told"
            value={draft.summary}
            onValueChange={v => setDraft(d => ({ ...d, summary: v }))}
            minRows={2}
          />
          <Textarea
            size="sm"
            label="What is actually going on"
            description="Yours. The party never sees this."
            value={draft.dmNotes}
            onValueChange={v => setDraft(d => ({ ...d, dmNotes: v }))}
            minRows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              color="primary"
              onPress={async () => {
                await act(updateQuestAction(campaignId, quest.id, draft));
                setEditing(false);
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {quest.summary && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
              {quest.summary}
            </p>
          )}

          <Objectives
            objectives={quest.objectives}
            isStaff={isStaff}
            act={act}
          />

          {isStaff && quest.dmNotes && (
            <details className="group mt-3 rounded-md border border-gold/40 bg-gold/[0.05] px-3 py-2">
              <summary className="cursor-pointer list-none font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-gold-strong dark:text-gold">
                <span className="group-open:hidden">
                  What is really going on
                </span>
                <span className="hidden group-open:inline">Hide</span>
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                {quest.dmNotes}
              </p>
            </details>
          )}
        </>
      )}

      {isStaff && !editing && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-end gap-2">
            <Input
              size="sm"
              placeholder="Add an objective…"
              value={objective}
              onValueChange={setObjective}
              className="min-w-40 flex-1"
              onKeyDown={async e => {
                if (e.key === 'Enter' && objective.trim()) {
                  await act(addObjectiveAction(quest.id, objective, 'shared'));
                  setObjective('');
                }
              }}
            />
            <Button
              size="sm"
              variant="flat"
              isDisabled={!objective.trim()}
              onPress={async () => {
                await act(addObjectiveAction(quest.id, objective, 'shared'));
                setObjective('');
              }}
            >
              Add
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Status"
              size="sm"
              className="w-32"
              selectedKeys={[quest.status]}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                if (key) {
                  act(
                    updateQuestAction(campaignId, quest.id, {
                      status: String(key) as QuestStatus,
                    })
                  );
                }
              }}
            >
              {STATUS.map(s => (
                <SelectItem key={s.key} textValue={s.label}>
                  {s.label}
                </SelectItem>
              ))}
            </Select>
            <Button size="sm" variant="flat" onPress={() => setEditing(true)}>
              Write
            </Button>
            <Button
              size="sm"
              color={quest.visibility === 'shared' ? 'default' : 'primary'}
              variant={quest.visibility === 'shared' ? 'flat' : 'solid'}
              onPress={() =>
                act(
                  updateQuestAction(campaignId, quest.id, {
                    visibility: quest.visibility === 'shared' ? 'dm' : 'shared',
                  })
                )
              }
            >
              {quest.visibility === 'shared'
                ? 'Take it back'
                : 'Tell the party'}
            </Button>
            <Button
              size="sm"
              variant="light"
              className="ml-auto text-ink-muted data-[hover=true]:text-danger"
              onPress={remove}
            >
              Drop
            </Button>
          </div>
        </div>
      )}

      {!isStaff && open > 0 && (
        <Marginalia className="mt-2">{open} still open</Marginalia>
      )}
    </article>
  );
}

/* --- panel ------------------------------------------------------------ */

export function QuestPanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerRole: CampaignRole;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [quests, setQuests] = useState<QuestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [title, setTitle] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setQuests(await listQuestsAction(campaignId));
    } catch {
      setError('Failed to open the quest log.');
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!quests) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Reading the notice board…" />
      </div>
    );
  }

  const closed = quests.filter(
    q => q.status === 'done' || q.status === 'failed'
  );
  const live = quests.filter(q => !closed.includes(q));
  const shown = showClosed ? closed : live;

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isStaff && (
        <SectionCard title="Pin up a thread">
          <div className="flex flex-wrap items-end gap-2">
            <Input
              size="sm"
              label="Title"
              placeholder="The miller's missing daughter"
              value={title}
              onValueChange={setTitle}
              className="min-w-40 flex-1"
            />
            <Button
              size="sm"
              color="primary"
              isDisabled={!title.trim()}
              onPress={async () => {
                const res = await createQuestAction(campaignId, { title });
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setTitle('');
                await refresh();
              }}
            >
              Pin it
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-subtle">
            Starts as yours alone. Hand it to the party when they hear about it.
          </p>
        </SectionCard>
      )}

      {quests.length === 0 ? (
        <EmptyState
          scene={<QuestScene />}
          title="The board is bare"
          description={
            isStaff
              ? 'Pin up the first thread and the party has something to pull on.'
              : 'Nothing has been asked of you yet.'
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => setShowClosed(false)}
                className={`rounded px-3 py-1 text-xs transition-colors ${
                  !showClosed
                    ? 'bg-gold font-medium text-bg'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                In hand ({live.length})
              </button>
              <button
                type="button"
                onClick={() => setShowClosed(true)}
                className={`rounded px-3 py-1 text-xs transition-colors ${
                  showClosed
                    ? 'bg-gold font-medium text-bg'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Behind you ({closed.length})
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {shown.map(q => (
              <QuestEntry
                key={q.id}
                campaignId={campaignId}
                quest={q}
                isStaff={isStaff}
                refresh={refresh}
                onError={setError}
              />
            ))}
            {shown.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-subtle">
                {showClosed
                  ? 'Nothing finished yet.'
                  : 'Nothing in hand right now.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
