'use client';

import { Button, Chip, Link, Spinner } from '@heroui/react';
import { useEffect, useState } from 'react';

import { campaignService } from '@/@creator/campaign/services';
import {
  EmptyState,
  PageHeader,
  PageShell,
  SectionCard,
} from '@/@shared/components/ui';
import type { CampaignRow } from '@/server/campaigns';
import { PendingInvites } from './PendingInvites';

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleDateString();
}

function statusColor(status: CampaignRow['status']) {
  switch (status) {
    case 'active':
      return 'success' as const;
    case 'paused':
      return 'warning' as const;
    case 'completed':
      return 'default' as const;
    case 'archived':
      return 'secondary' as const;
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
        eyebrow="Table"
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
          <Spinner color="primary" label="Loading campaigns…" />
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon="🏰"
          title="No campaigns yet"
          description="Create your first campaign, or wait for an invitation."
          action={
            <Button as={Link} href="/campaigns/create" color="primary">
              Create a campaign
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(c => (
            <SectionCard key={c.id} bodyClassName="flex flex-col">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg text-ink">{c.name}</h3>
                  <p className="text-sm text-ink-muted">
                    {c.settings.rpgSystem} ·{' '}
                    {c.role === 'gm'
                      ? 'DM'
                      : c.role === 'co-gm'
                        ? 'Co-DM'
                        : 'Player'}{' '}
                    · {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                  </p>
                </div>
                <Chip color={statusColor(c.status)} variant="flat" size="sm">
                  {c.status}
                </Chip>
              </div>
              <p className="mb-3 line-clamp-3 text-sm text-ink-muted">
                {c.description || 'No description.'}
              </p>
              <div className="mt-auto flex gap-2 pt-2">
                <Button
                  as={Link}
                  href={`/campaigns/${c.id}`}
                  size="sm"
                  variant="flat"
                  className="flex-1"
                >
                  Open
                </Button>
                {(c.role === 'gm' || c.role === 'co-gm') && (
                  <Button
                    as={Link}
                    href={`/campaigns/${c.id}/manage`}
                    size="sm"
                    variant="light"
                    className="text-ink-muted"
                  >
                    Manage
                  </Button>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
