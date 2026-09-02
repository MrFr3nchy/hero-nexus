'use client';

import {
  Button,
  Chip,
  Input,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { listCharactersAction } from '@/@creator/character/actions';
import { DiceSpinner, EmptyState, SectionCard } from '@/@shared/components/ui';
import type { CharacterRow } from '@/server/characters';
import type { CampaignRole } from '@/server/campaigns';
import {
  DOWNTIME_KINDS,
  DOWNTIME_KIND_LABELS,
  type DowntimeActionRow,
  type DowntimeKind,
  type DowntimePeriodRow,
} from '@/@creator/campaign/lib/downtime';
import {
  deleteDowntimePeriodAction,
  listDowntimeAction,
  openDowntimeAction,
  resolveDowntimeActionAction,
  setDowntimePeriodStatusAction,
  submitDowntimeActionAction,
  updateDowntimeActionAction,
  withdrawDowntimeActionAction,
} from '../downtime-actions';

const STATUS_CHIP: Record<
  DowntimeActionRow['status'],
  { label: string; color: 'default' | 'success' | 'danger' | 'warning' }
> = {
  submitted: { label: 'Awaiting the DM', color: 'warning' },
  resolved: { label: 'Resolved', color: 'success' },
  rejected: { label: 'Rejected', color: 'danger' },
};

export function DowntimePanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerId: string;
  viewerRole: CampaignRole;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [periods, setPeriods] = useState<DowntimePeriodRow[]>([]);
  const [myCharacters, setMyCharacters] = useState<CharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [newOpens, setNewOpens] = useState('');
  const [newCloses, setNewCloses] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [list, chars] = await Promise.all([
        listDowntimeAction(campaignId),
        listCharactersAction(),
      ]);
      setPeriods(list);
      setMyCharacters(chars);
    } catch {
      setError('Failed to load downtime.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) setError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const openWindow = async () => {
    const res = await openDowntimeAction(campaignId, {
      label: newLabel,
      opensAt: newOpens || null,
      closesAt: newCloses || null,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNewLabel('');
    setNewOpens('');
    setNewCloses('');
    await refresh();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Checking the ledger…" />
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
        <SectionCard title="Open a downtime window">
          <div className="space-y-3">
            <Input
              label="Label"
              placeholder="e.g. The month before the siege"
              value={newLabel}
              onValueChange={setNewLabel}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                type="date"
                label="Opens (optional)"
                value={newOpens}
                onValueChange={setNewOpens}
              />
              <Input
                type="date"
                label="Closes (optional)"
                value={newCloses}
                onValueChange={setNewCloses}
              />
            </div>
            <Button size="sm" color="primary" onPress={openWindow}>
              Open window
            </Button>
          </div>
        </SectionCard>
      )}

      {periods.length === 0 ? (
        <EmptyState
          icon="🕰️"
          title="No downtime windows yet"
          description={
            isStaff
              ? 'Open a window between sessions and your players can submit what their characters get up to.'
              : 'The DM has not opened a downtime window yet.'
          }
        />
      ) : (
        <ul className="space-y-4">
          {periods.map(period => (
            <li key={period.id}>
              <PeriodCard
                campaignId={campaignId}
                period={period}
                isStaff={isStaff}
                myCharacters={myCharacters}
                act={act}
                setError={setError}
                refresh={refresh}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PeriodCard({
  campaignId,
  period,
  isStaff,
  myCharacters,
  act,
  setError,
  refresh,
}: {
  campaignId: string;
  period: DowntimePeriodRow;
  isStaff: boolean;
  myCharacters: CharacterRow[];
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  setError: (s: string | null) => void;
  refresh: () => Promise<void>;
}) {
  const [kind, setKind] = useState<DowntimeKind>('other');
  const [characterId, setCharacterId] = useState<string>('');
  const [body, setBody] = useState('');

  const submit = async () => {
    const res = await submitDowntimeActionAction(campaignId, period.id, {
      characterId: characterId || null,
      kind,
      body,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setBody('');
    setKind('other');
    setCharacterId('');
    await refresh();
  };

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <span>{period.label || 'Downtime'}</span>
          <Chip
            size="sm"
            variant="flat"
            color={period.status === 'open' ? 'success' : 'default'}
          >
            {period.status === 'open' ? 'Open' : 'Closed'}
          </Chip>
        </span>
      }
      description={
        [period.opensAt, period.closesAt].some(Boolean)
          ? `${period.opensAt ?? '…'} → ${period.closesAt ?? '…'}`
          : undefined
      }
    >
      <div className="space-y-4">
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="light"
              onPress={() =>
                act(
                  setDowntimePeriodStatusAction(
                    campaignId,
                    period.id,
                    period.status === 'open' ? 'closed' : 'open'
                  )
                )
              }
            >
              {period.status === 'open' ? 'Close window' : 'Reopen window'}
            </Button>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted data-[hover=true]:text-danger"
              onPress={() =>
                act(deleteDowntimePeriodAction(campaignId, period.id))
              }
            >
              Delete
            </Button>
          </div>
        )}

        {period.status === 'open' && (
          <div className="space-y-3 rounded-md border border-line bg-surface-2 p-3">
            <p className="text-sm font-medium text-ink">Submit an action</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                aria-label="Kind"
                selectedKeys={[kind]}
                onSelectionChange={keys =>
                  setKind((Array.from(keys)[0] as DowntimeKind) ?? kind)
                }
              >
                {DOWNTIME_KINDS.map(k => (
                  <SelectItem key={k}>{DOWNTIME_KIND_LABELS[k]}</SelectItem>
                ))}
              </Select>
              <Select
                aria-label="Character"
                placeholder="No character"
                selectedKeys={characterId ? [characterId] : []}
                onSelectionChange={keys =>
                  setCharacterId(String(Array.from(keys)[0] ?? ''))
                }
              >
                {myCharacters.map(c => (
                  <SelectItem key={c.id}>{c.name || 'Unnamed'}</SelectItem>
                ))}
              </Select>
            </div>
            <Textarea
              aria-label="What the character does"
              minRows={2}
              placeholder="What does your character spend the downtime doing?"
              value={body}
              onValueChange={setBody}
            />
            <Button
              size="sm"
              color="primary"
              isDisabled={!body.trim()}
              onPress={submit}
            >
              Submit
            </Button>
          </div>
        )}

        {period.actions.length === 0 ? (
          <p className="text-sm text-ink-subtle">No actions yet.</p>
        ) : (
          <ul className="space-y-3">
            {period.actions.map(a => (
              <li key={a.id}>
                <ActionRow
                  campaignId={campaignId}
                  action={a}
                  isStaff={isStaff}
                  act={act}
                  setError={setError}
                  refresh={refresh}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

function ActionRow({
  campaignId,
  action,
  isStaff,
  act,
  setError,
  refresh,
}: {
  campaignId: string;
  action: DowntimeActionRow;
  isStaff: boolean;
  act: (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;
  setError: (s: string | null) => void;
  refresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(action.body);
  const [editKind, setEditKind] = useState<DowntimeKind>(
    (action.kind as DowntimeKind) ?? 'other'
  );
  const [response, setResponse] = useState('');

  const chip = STATUS_CHIP[action.status];

  const saveEdit = async () => {
    const res = await updateDowntimeActionAction(campaignId, action.id, {
      body: editBody,
      kind: editKind,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditing(false);
    await refresh();
  };

  const resolve = async (status: 'resolved' | 'rejected') => {
    if (status === 'rejected' && !response.trim()) {
      setError('Add a note explaining the rejection.');
      return;
    }
    const res = await resolveDowntimeActionAction(
      campaignId,
      action.id,
      status,
      response
    );
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResponse('');
    await refresh();
  };

  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="flat">
          {DOWNTIME_KIND_LABELS[action.kind as DowntimeKind] ?? action.kind}
        </Chip>
        <span className="text-ink-muted">
          {action.characterName || action.actorName || 'A player'}
        </span>
        <Chip size="sm" variant="flat" color={chip.color}>
          {chip.label}
        </Chip>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Select
            aria-label="Kind"
            size="sm"
            className="max-w-xs"
            selectedKeys={[editKind]}
            onSelectionChange={keys =>
              setEditKind((Array.from(keys)[0] as DowntimeKind) ?? editKind)
            }
          >
            {DOWNTIME_KINDS.map(k => (
              <SelectItem key={k}>{DOWNTIME_KIND_LABELS[k]}</SelectItem>
            ))}
          </Select>
          <Textarea
            aria-label="Edit body"
            minRows={2}
            value={editBody}
            onValueChange={setEditBody}
          />
          <div className="flex gap-2">
            <Button size="sm" color="primary" onPress={saveEdit}>
              Save
            </Button>
            <Button size="sm" variant="light" onPress={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-ink-muted">{action.body}</p>
      )}

      {action.dmResponse && (
        <p className="mt-2 rounded border border-gold/30 bg-gold/5 px-2 py-1.5 text-ink-muted">
          <span className="text-[0.7rem] uppercase tracking-[0.1em] text-ink-subtle">
            DM
            {action.resolvedByName ? ` · ${action.resolvedByName}` : ''}
          </span>
          <br />
          {action.dmResponse}
        </p>
      )}

      {action.mine && action.status === 'submitted' && !editing && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="light" onPress={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="light"
            className="text-ink-muted data-[hover=true]:text-danger"
            onPress={() =>
              act(withdrawDowntimeActionAction(campaignId, action.id))
            }
          >
            Withdraw
          </Button>
        </div>
      )}

      {isStaff && action.status === 'submitted' && (
        <div className="mt-2 space-y-2">
          <Textarea
            aria-label="DM response"
            minRows={2}
            placeholder="Your response to the player…"
            value={response}
            onValueChange={setResponse}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              color="primary"
              isDisabled={!response.trim()}
              onPress={() => resolve('resolved')}
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="flat"
              color="danger"
              isDisabled={!response.trim()}
              onPress={() => resolve('rejected')}
            >
              Reject
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">
            A rejection needs a written reason.
          </p>
        </div>
      )}
    </div>
  );
}
