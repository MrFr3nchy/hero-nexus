'use client';

import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { useState } from 'react';

import {
  ControlRow,
  Glyph,
  Marginalia,
  Pill,
  useConfirm,
} from '@/@shared/components/ui';
import type {
  FeedbackAnswers,
  FeedbackFormRow,
  FeedbackQuestion,
  FeedbackQuestionKind,
} from '@/server/session-feedback';
import {
  DEFAULT_FEEDBACK_QUESTIONS,
  QUESTION_KIND_LABEL,
  newQuestionId,
} from '../lib/feedback';
import {
  deleteFeedbackFormAction,
  lastFeedbackQuestionsAction,
  saveFeedbackFormAction,
  setFeedbackFormStatusAction,
  submitFeedbackAction,
} from '../scheduling-actions';

/*
 * How did it go?
 *
 * Under a played sitting the DM can write a few questions; each player
 * answers on their own, if they want to; the DM reads the answers back
 * under the same sitting. A player only ever sees their own.
 */

type Result = { ok: boolean; error?: string };

const KINDS: FeedbackQuestionKind[] = ['text', 'scale', 'choice'];

/* --- the builder ------------------------------------------------------- */

function FormBuilder({
  campaignId,
  sessionId,
  initial,
  onDone,
  onCancel,
  onError,
}: {
  campaignId: string;
  sessionId: string;
  initial: FeedbackQuestion[] | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [questions, setQuestions] = useState<FeedbackQuestion[]>(
    initial ??
      DEFAULT_FEEDBACK_QUESTIONS.map(q => ({ ...q, id: newQuestionId() }))
  );
  const [saving, setSaving] = useState(false);
  const [loadingLast, setLoadingLast] = useState(false);

  const patch = (id: string, p: Partial<FeedbackQuestion>) =>
    setQuestions(prev => prev.map(q => (q.id === id ? { ...q, ...p } : q)));

  const save = async () => {
    setSaving(true);
    const res = await saveFeedbackFormAction(campaignId, sessionId, questions);
    setSaving(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await onDone();
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <li
            key={q.id}
            className="rounded-md border border-line bg-surface-2/40 p-3"
          >
            <ControlRow size="sm">
              <Input
                size="sm"
                aria-label={`Question ${i + 1}`}
                placeholder="What did you make of…"
                value={q.prompt}
                onValueChange={v => patch(q.id, { prompt: v })}
                className="flex-1"
              />
              <Select
                size="sm"
                aria-label="Kind of answer"
                selectedKeys={[q.kind]}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  if (!key) return;
                  const kind = String(key) as FeedbackQuestionKind;
                  patch(q.id, {
                    kind,
                    options:
                      kind === 'choice'
                        ? q.options?.length
                          ? q.options
                          : ['Yes', 'No']
                        : undefined,
                  });
                }}
                className="sm:w-40"
              >
                {KINDS.map(k => (
                  <SelectItem key={k} textValue={QUESTION_KIND_LABEL[k]}>
                    {QUESTION_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </Select>
              <Button
                size="sm"
                variant="light"
                isIconOnly
                aria-label="Remove question"
                className="text-ink-muted data-[hover=true]:text-danger"
                onPress={() =>
                  setQuestions(prev => prev.filter(x => x.id !== q.id))
                }
              >
                <Glyph name="x" size={14} />
              </Button>
            </ControlRow>
            {q.kind === 'choice' && (
              <Input
                size="sm"
                className="mt-2"
                label="Choices"
                description="Comma-separated."
                value={(q.options ?? []).join(', ')}
                onValueChange={v =>
                  patch(q.id, {
                    options: v.split(',').map(o => o.trimStart()),
                  })
                }
              />
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="flat"
          onPress={() =>
            setQuestions(prev => [
              ...prev,
              { id: newQuestionId(), prompt: '', kind: 'text' },
            ])
          }
        >
          Another question
        </Button>
        <Button
          size="sm"
          variant="light"
          className="text-ink-muted"
          isLoading={loadingLast}
          onPress={async () => {
            setLoadingLast(true);
            const last = await lastFeedbackQuestionsAction(campaignId);
            setLoadingLast(false);
            if (!last) {
              onError('You have not asked this table anything before.');
              return;
            }
            setQuestions(last.map(q => ({ ...q, id: newQuestionId() })));
          }}
        >
          Ask what I asked last time
        </Button>
      </div>

      <div className="flex gap-2">
        <Button size="sm" color="primary" isLoading={saving} onPress={save}>
          {initial ? 'Save the questions' : 'Send it to the table'}
        </Button>
        <Button
          size="sm"
          variant="light"
          className="text-ink-muted"
          onPress={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* --- answering ----------------------------------------------------------- */

function AnswerForm({
  form,
  mine,
  onDone,
  onError,
}: {
  form: FeedbackFormRow;
  mine: FeedbackAnswers | null;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [answers, setAnswers] = useState<FeedbackAnswers>(mine ?? {});
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(mine === null);

  const set = (id: string, v: string | number) =>
    setAnswers(prev => ({ ...prev, [id]: v }));

  if (!editing && mine) {
    return (
      <div className="space-y-2">
        <dl className="space-y-1.5">
          {form.questions.map(q => (
            <div key={q.id}>
              <dt className="text-xs text-ink-subtle">{q.prompt}</dt>
              <dd className="whitespace-pre-wrap text-sm text-ink-muted">
                {mine[q.id] === undefined ? (
                  <span className="text-ink-subtle">—</span>
                ) : q.kind === 'scale' ? (
                  `${mine[q.id]} / 5`
                ) : (
                  String(mine[q.id])
                )}
              </dd>
            </div>
          ))}
        </dl>
        {form.status === 'open' && (
          <Button size="sm" variant="flat" onPress={() => setEditing(true)}>
            Change an answer
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {form.questions.map(q => {
        if (q.kind === 'text') {
          return (
            <Textarea
              key={q.id}
              size="sm"
              label={q.prompt}
              minRows={2}
              value={String(answers[q.id] ?? '')}
              onValueChange={v => set(q.id, v)}
            />
          );
        }
        const choices =
          q.kind === 'scale' ? ['1', '2', '3', '4', '5'] : (q.options ?? []);
        return (
          <div key={q.id}>
            <p className="text-sm text-ink">{q.prompt}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {choices.map(c => {
                const value = q.kind === 'scale' ? Number(c) : c;
                const picked = answers[q.id] === value;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set(q.id, value)}
                    className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                      picked
                        ? 'border-gold bg-gold/15 text-ink'
                        : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button
          size="sm"
          color="primary"
          isLoading={sending}
          onPress={async () => {
            setSending(true);
            const res = await submitFeedbackAction(form.id, answers);
            setSending(false);
            if (!res.ok) {
              onError(res.error ?? 'Something went wrong.');
              return;
            }
            setEditing(false);
            await onDone();
          }}
        >
          {mine ? 'Save' : 'Send it'}
        </Button>
        {mine && (
          <Button
            size="sm"
            variant="light"
            className="text-ink-muted"
            onPress={() => {
              setAnswers(mine);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

/* --- reading the answers back ---------------------------------------- */

function Responses({ form }: { form: FeedbackFormRow }) {
  if (form.responses.length === 0) {
    return <Marginalia dash>nobody has answered yet</Marginalia>;
  }
  return (
    <div className="space-y-3">
      {form.questions.map(q => {
        const answered = form.responses.filter(
          r => r.answers[q.id] !== undefined
        );
        const scale =
          q.kind === 'scale' && answered.length > 0
            ? (
                answered.reduce((s, r) => s + Number(r.answers[q.id]), 0) /
                answered.length
              ).toFixed(1)
            : null;
        return (
          <div key={q.id}>
            <p className="text-sm text-ink">
              {q.prompt}
              {scale && (
                <span className="ml-2 text-xs tabular-nums text-ink-subtle">
                  averages {scale} / 5
                </span>
              )}
            </p>
            {answered.length === 0 ? (
              <p className="text-xs text-ink-subtle">—</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {answered.map(r => (
                  <li key={r.userId} className="text-sm text-ink-muted">
                    <span className="text-xs text-ink-subtle">
                      {r.name ?? 'Someone'} ·{' '}
                    </span>
                    <span className="whitespace-pre-wrap">
                      {q.kind === 'scale'
                        ? `${r.answers[q.id]} / 5`
                        : String(r.answers[q.id])}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* --- the block on a sitting ------------------------------------------- */

export function SessionFeedback({
  campaignId,
  sessionId,
  viewerId,
  form,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  sessionId: string;
  viewerId: string;
  form: FeedbackFormRow | null;
  isStaff: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [building, setBuilding] = useState(false);
  const [reading, setReading] = useState(false);
  const { confirm, dialog } = useConfirm();

  const act = async (p: Promise<Result>) => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const head = (
    <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
      How did it go?
    </span>
  );

  if (building) {
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2">{head}</div>
        <FormBuilder
          campaignId={campaignId}
          sessionId={sessionId}
          initial={form?.questions ?? null}
          onDone={async () => {
            setBuilding(false);
            await refresh();
          }}
          onCancel={() => setBuilding(false)}
          onError={onError}
        />
      </div>
    );
  }

  if (!form) {
    if (!isStaff) return null;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
        {head}
        <Button
          size="sm"
          variant="flat"
          className="ml-auto"
          onPress={() => setBuilding(true)}
        >
          Ask the table
        </Button>
      </div>
    );
  }

  const mine = form.responses.find(r => r.userId === viewerId) ?? null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      {dialog}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {head}
        {form.status === 'open' ? (
          <Pill tone="gold">Open</Pill>
        ) : (
          <Pill>Closed</Pill>
        )}
        <span className="text-xs tabular-nums text-ink-subtle">
          {form.answered === 0
            ? 'nobody has answered'
            : form.answered === 1
              ? 'one answer in'
              : `${form.answered} answers in`}
        </span>
        {isStaff && (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="flat"
              onPress={() => setReading(r => !r)}
            >
              {reading ? 'Fold the answers' : 'Read the answers'}
            </Button>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() => setBuilding(true)}
            >
              Reword
            </Button>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() =>
                act(
                  setFeedbackFormStatusAction(
                    campaignId,
                    form.id,
                    form.status === 'open' ? 'closed' : 'open'
                  )
                )
              }
            >
              {form.status === 'open' ? 'Close it' : 'Reopen'}
            </Button>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted data-[hover=true]:text-danger"
              onPress={async () => {
                const ok = await confirm({
                  title: 'Tear up this form?',
                  body: 'The questions and every answer under them go with it.',
                  confirmLabel: 'Tear it up',
                  destructive: true,
                });
                if (!ok) return;
                await act(deleteFeedbackFormAction(campaignId, form.id));
              }}
            >
              Tear up
            </Button>
          </div>
        )}
      </div>

      {isStaff && reading && (
        <div className="mt-3">
          <Responses form={form} />
        </div>
      )}

      {/* Staff answer too — a co-DM was at the table — but the DM's own form
          is not the thing to lead with, so it folds under the answers. */}
      {(!isStaff || reading) && (form.status === 'open' || mine) && (
        <div className="mt-3">
          {isStaff && (
            <p className="mb-1 text-xs text-ink-subtle">Your own answer</p>
          )}
          <AnswerForm
            form={form}
            mine={mine?.answers ?? null}
            onDone={refresh}
            onError={onError}
          />
        </div>
      )}
      {!isStaff && form.status === 'closed' && !mine && (
        <Marginalia dash>the DM has closed this one</Marginalia>
      )}
    </div>
  );
}
