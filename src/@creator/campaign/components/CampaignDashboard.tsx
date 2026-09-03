'use client';

import { Button, Link } from '@heroui/react';
import { useEffect, useState } from 'react';

import { campaignService } from '@/@creator/campaign/services';
import {
  DiceSpinner,
  EmptyState,
  PageHeader,
  PageShell,
  Ribbon,
  SealedLetterScene,
} from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';
import { PendingInvites } from './PendingInvites';

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString();
}

function statusTone(status: CampaignRow['status']) {
  switch (status) {
    case 'active':
      return 'success' as const;
    case 'paused':
      return 'warning' as const;
    case 'archived':
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export function CampaignDashboard() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setCampaigns(await campaignService.getCampaigns());
      } catch (err) {
        console.error('Error loading campaigns:', err);
        setError('Failed to load campaigns');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageShell width="full">
      <PageHeader
        title="Campaigns"
        description="Run games as a DM and join your friends' tables."
        actions={
          <>
            <Button as={Link} href="/campaigns/join" size="sm" variant="flat">
              Join
            </Button>
            <Button
              as={Link}
              href="/campaigns/create"
              color="primary"
              size="sm"
            >
              New campaign
            </Button>
          </>
        }
      />

      <PendingInvites />

      {loading ? (
        <div className="flex justify-center py-16">
          <DiceSpinner label="Consulting the ledger…" />
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          scene={<SealedLetterScene />}
          title="No table to your name yet"
          description="Start a campaign and hand out the join code, or wait for an invitation to land."
          action={
            <Button as={Link} href="/campaigns/create" color="primary">
              Start a campaign
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(c => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface p-4 [box-shadow:var(--shadow-card)] transition-colors hover:border-gold/40"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-gold/70"
              />
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg text-ink">
                    {c.name}
                  </h3>
                  <p className="text-sm text-ink-muted">
                    {c.role === 'gm'
                      ? 'You run this'
                      : c.role === 'co-gm'
                        ? 'You co-run this'
                        : 'You play here'}{' '}
                    · {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                  </p>
                </div>
                <Ribbon tone={statusTone(c.status)}>{c.status}</Ribbon>
              </div>
              <p className="line-clamp-3 text-sm text-ink-muted">
                {c.description || 'No description yet.'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
