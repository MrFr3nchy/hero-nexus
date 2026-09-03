'use client';

import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  ChronicleScene,
  DiceSpinner,
  EmptyState,
  Marginalia,
  Pill,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { AttendanceStatus, SessionRow } from '@/server/campaign-sessions';
import {
  createSessionAction,
  deleteSessionAction,
  listSessionsAction,
  markSessionPlayedAction,
  setAttendanceAction,
  setRecapVisibilityAction,
  updateSessionAction,
} from '../chronicle-actions';

const ATTENDANCE: { key: AttendanceStatus; label: string }[] = [
  { key: 'present', label: 'There' },
  { key: 'late', label: 'Late' },
  { key: 'absent', label: 'Missed it' },
];

const LINK_LABEL: Record<string, string> = {
  encounter: 'Fight',
  handout: 'Handout',
  downtime: 'Downtime',
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

/** ISO calendar date for a `<input type="date">`, from a stored value. */
function dateInputValue(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/* --- one sitting ---------------------------------------------------- */

function SessionEntry({
  campaignId,
  session,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  session: SessionRow;
  isStaff: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(session.title);
  const [scheduledFor, setScheduledFor] = useState(
    dateInputValue(session.scheduledFor)
  );
  const [playedOn, setPlayedOn] = useState(dateInputValue(session.playedOn));
  const [prep, setPrep] = useState(session.prepBody ?? '');
  const [recap, setRecap] = useState(session.recapBody ?? '');
  const [saving, setSaving] = useState(false);
  const { confirm, dialog } = useConfirm();

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const save = async () => {
    setSaving(true);
    await act(
      updateSessionAction(campaignId, session.id, {
        title,
        scheduledFor,
        playedOn,
        prepBody: prep,
        recapBody: recap,
      })
    );
    setSaving(false);
    setEditing(false);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Strike session ${session.number} from the chronicle?`,
      body: 'The recap, the prep and the attendance record go with it. Anything filed under it stays, unfiled.',
      confirmLabel: 'Strike it',
      destructive: true,
    });
    if (!ok) return;
    await act(deleteSessionAction(campaignId, session.id));
  };

  const dateLine =
    session.status === 'played'
      ? formatDate(session.playedOn) || 'Played, date unrecorded'
      : session.scheduledFor
        ? formatDate(session.scheduledFor)
        : 'No date set';

  const present = session.attendance.filter(a => a.status !== 'absent');

  return (
    <article className="relative rounded-[var(--radius-card)] border border-line bg-surface p-4 [box-shadow:var(--shadow-card)]">
      {dialog}

      {/* The spine number: a chronicle is numbered, and the number is how the
          table refers to an evening a year later. */}
      <div className="flex gap-4">
        <div className="flex w-12 shrink-0 flex-col items-center border-r border-line pr-3 pt-0.5">
          <span className="font-display-alt text-[0.55rem] uppercase tracking-[0.16em] text-ink-subtle">
            No.
          </span>
          <span className="font-display text-2xl tabular-nums text-gold">
            {session.number}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-lg text-ink">
                {session.title || `Session ${session.number}`}
              </h3>
              <p className="text-xs text-ink-subtle">{dateLine}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {session.status === 'planned' && <Pill tone="gold">Planned</Pill>}
              {session.status === 'cancelled' && <Pill>Cancelled</Pill>}
              {session.status === 'played' && (
                <Pill tone="success">Played</Pill>
              )}
              {isStaff && session.recapVisibility === 'dm' && (
                <Pill tone="warning">Recap unsent</Pill>
              )}
            </div>
          </div>

          {editing ? (
            <div className="mt-3 space-y-3">
              <Input
                size="sm"
                label="Title"
                placeholder="The bridge at Duskwater"
                value={title}
                onValueChange={setTitle}
              />
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  size="sm"
                  type="date"
                  label="Planned for"
                  value={scheduledFor}
                  onValueChange={setScheduledFor}
                  className="flex-1"
                />
                <Input
                  size="sm"
                  type="date"
                  label="Played on"
                  value={playedOn}
                  onValueChange={setPlayedOn}
                  className="flex-1"
                />
              </div>
              <Textarea
                size="sm"
                label="Your prep"
                description="Private. The party never sees this."
                placeholder="Rooms, statblocks, the thing behind the door…"
                value={prep}
                onValueChange={setPrep}
                minRows={3}
              />
              <Textarea
                size="sm"
                label="Recap for the party"
                description="Shared once you hand it over."
                placeholder="What the table will remember…"
                value={recap}
                onValueChange={setRecap}
                minRows={3}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  color="primary"
                  isLoading={saving}
                  onPress={save}
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
            <div className="mt-3 space-y-3">
              {session.recapBody ? (
                <div>
                  <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                    Recap
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                    {session.recapBody}
                  </p>
                </div>
              ) : (
                <Marginalia dash>
                  {isStaff
                    ? 'nothing written down yet'
                    : 'the DM has not written this one up'}
                </Marginalia>
              )}

              {isStaff && session.prepBody && (
                <details className="group rounded-md border border-gold/40 bg-gold/[0.05] px-3 py-2">
                  <summary className="cursor-pointer list-none font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-gold-strong dark:text-gold">
                    <span className="group-open:hidden">Your prep</span>
                    <span className="hidden group-open:inline">
                      Hide your prep
                    </span>
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                    {session.prepBody}
                  </p>
                </details>
              )}

              {session.links.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {session.links.map(l => (
                    <li key={`${l.kind}-${l.id}`}>
                      <Pill
                        tone={l.kind === 'encounter' ? 'warning' : 'default'}
                      >
                        {LINK_LABEL[l.kind]} · {l.label}
                      </Pill>
                    </li>
                  ))}
                </ul>
              )}

              {present.length > 0 && (
                <p className="text-xs text-ink-subtle">
                  At the table:{' '}
                  {present
                    .map(a => a.characterName || a.name || 'Someone')
                    .join(', ')}
                </p>
              )}
            </div>
          )}

          {isStaff && !editing && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button size="sm" variant="flat" onPress={() => setEditing(true)}>
                Write
              </Button>
              {session.status !== 'played' && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() =>
                    act(markSessionPlayedAction(campaignId, session.id))
                  }
                >
                  Mark played
                </Button>
              )}
              <Button
                size="sm"
                color={
                  session.recapVisibility === 'shared' ? 'default' : 'primary'
                }
                variant={
                  session.recapVisibility === 'shared' ? 'flat' : 'solid'
                }
                onPress={() =>
                  act(
                    setRecapVisibilityAction(
                      campaignId,
                      session.id,
                      session.recapVisibility === 'shared' ? 'dm' : 'shared'
                    )
                  )
                }
              >
                {session.recapVisibility === 'shared'
                  ? 'Take the recap back'
                  : 'Hand the recap over'}
              </Button>
              <Button
                size="sm"
                variant="light"
                className="ml-auto text-ink-muted data-[hover=true]:text-danger"
                onPress={remove}
              >
                Strike
              </Button>
            </div>
          )}

          {isStaff && session.attendance.length > 0 && !editing && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-3">
              <p className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                Who was there
              </p>
              {session.attendance.map(a => (
                <div
                  key={a.userId}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {a.characterName || a.name || 'Someone'}
                  </span>
                  <div className="flex gap-1">
                    {ATTENDANCE.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          act(
                            setAttendanceAction(
                              campaignId,
                              session.id,
                              a.userId,
                              opt.key
                            )
                          )
                        }
                        className={`rounded-sm border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] transition-colors ${
                          a.status === opt.key
                            ? 'border-gold/60 bg-gold/10 text-gold-strong dark:text-gold'
                            : 'border-line text-ink-subtle hover:text-ink'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* --- panel ---------------------------------------------------------- */

export function ChroniclePanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerRole: CampaignRole;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'planned' | 'played'>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [opening, setOpening] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setSessions(await listSessionsAction(campaignId));
    } catch {
      setError('Failed to open the chronicle.');
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = async () => {
    setOpening(true);
    const res = await createSessionAction(campaignId, {
      title: newTitle,
      scheduledFor: newDate,
    });
    setOpening(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewTitle('');
    setNewDate('');
    await refresh();
  };

  if (!sessions) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Turning back the pages…" />
      </div>
    );
  }

  const shown = sessions.filter(s =>
    filter === 'all' ? true : s.status === filter
  );

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isStaff && (
        <SectionCard
          title="Open the next sitting"
          description="Number it now, write it up after."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              size="sm"
              label="Title"
              placeholder="The bridge at Duskwater"
              value={newTitle}
              onValueChange={setNewTitle}
              className="flex-1"
            />
            <Input
              size="sm"
              type="date"
              label="Planned for"
              value={newDate}
              onValueChange={setNewDate}
              className="sm:w-48"
            />
            <Button
              size="sm"
              color="primary"
              isLoading={opening}
              onPress={open}
            >
              Open session
            </Button>
          </div>
        </SectionCard>
      )}

      {sessions.length === 0 ? (
        <EmptyState
          scene={<ChronicleScene />}
          title="The chronicle is blank"
          description={
            isStaff
              ? 'Open the first sitting and the campaign starts keeping a record of itself.'
              : 'Your DM has not opened a session yet.'
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Select
              aria-label="Which sittings to show"
              size="sm"
              className="w-44"
              selectedKeys={[filter]}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                if (key) setFilter(String(key) as typeof filter);
              }}
            >
              <SelectItem key="all" textValue="Every sitting">
                Every sitting
              </SelectItem>
              <SelectItem key="planned" textValue="Still to come">
                Still to come
              </SelectItem>
              <SelectItem key="played" textValue="Already played">
                Already played
              </SelectItem>
            </Select>
            <Marginalia>
              {sessions.filter(s => s.status === 'played').length} evenings
              behind you
            </Marginalia>
          </div>

          <div className="space-y-3">
            {shown.map(s => (
              <SessionEntry
                key={s.id}
                campaignId={campaignId}
                session={s}
                isStaff={isStaff}
                refresh={refresh}
                onError={setError}
              />
            ))}
            {shown.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-subtle">
                Nothing filed under that.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
