'use client';

import { Button, Chip, Spinner, Textarea } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, SectionCard } from '@/@shared/components/ui';
import type { ApprovalRow, ApprovalStatus } from '@/server/approvals';
import { listApprovalsAction, reviewApprovalAction } from '../actions';

const statusColor: Record<ApprovalStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  denied: 'danger',
};

const typeIcon: Record<string, string> = {
  class: '⚔️',
  spell: '🔮',
  item: '🛡️',
};

function ApprovalCard({
  approval,
  campaignId,
  onDone,
}: {
  approval: ApprovalRow;
  campaignId: string;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: 'approved' | 'denied') => {
    setBusy(true);
    setError(null);
    const res = await reviewApprovalAction(
      campaignId,
      approval.id,
      status,
      note
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone();
  };

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            {typeIcon[approval.homebrewType] ?? '📄'} {approval.homebrewName}
          </p>
          <p className="text-xs text-ink-muted">
            {approval.homebrewType} · from{' '}
            {approval.requestedByName ?? 'a player'}
          </p>
        </div>
        <Chip size="sm" variant="flat" color={statusColor[approval.status]}>
          {approval.status}
        </Chip>
      </div>

      {approval.homebrewDescription && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">
          {approval.homebrewDescription}
        </p>
      )}

      {approval.status !== 'pending' && approval.reviewNotes && (
        <p className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">Note: </span>
          {approval.reviewNotes}
        </p>
      )}

      {approval.status === 'pending' && (
        <div className="mt-4 space-y-3">
          <Textarea
            size="sm"
            label="Note (required to deny)"
            value={note}
            onValueChange={setNote}
            minRows={2}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              color="success"
              variant="flat"
              isLoading={busy}
              onPress={() => decide('approved')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              color="danger"
              variant="flat"
              isDisabled={busy}
              onPress={() => decide('denied')}
            >
              Deny
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HomebrewApprovalPanel({
  campaignId,
  isGM,
}: {
  campaignId: string;
  isGM: boolean;
}) {
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setApprovals(await listApprovalsAction(campaignId));
    } catch {
      setError('Failed to load homebrew submissions.');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (isGM) refresh();
    else setLoading(false);
  }, [isGM, refresh]);

  if (!isGM) {
    return (
      <SectionCard title="Homebrew review">
        <p className="text-sm text-ink-muted">
          Only the DM and co-DMs review homebrew submissions.
        </p>
      </SectionCard>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner color="primary" />
      </div>
    );
  }

  const pending = approvals.filter(a => a.status === 'pending');
  const decided = approvals.filter(a => a.status !== 'pending');

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-danger">{error}</p>}

      <SectionCard title={`Pending (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Nothing to review"
            description="Player homebrew submitted to this campaign shows up here."
          />
        ) : (
          <div className="space-y-3">
            {pending.map(a => (
              <ApprovalCard
                key={a.id}
                approval={a}
                campaignId={campaignId}
                onDone={refresh}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {decided.length > 0 && (
        <SectionCard title="Reviewed">
          <div className="space-y-3">
            {decided.map(a => (
              <ApprovalCard
                key={a.id}
                approval={a}
                campaignId={campaignId}
                onDone={refresh}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
