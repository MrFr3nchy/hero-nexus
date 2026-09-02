'use client';

import { Button, Link } from '@heroui/react';
import { useEffect, useState } from 'react';

import { CharactersList } from '@/@creator/character/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import {
  PageHeader,
  PageShell,
  SectionCard,
  Stat,
} from '@/@shared/components/ui';
import { getDashboardSummaryAction, type DashboardSummary } from './actions';

function DashboardContent() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    getDashboardSummaryAction().then(setSummary).catch(console.error);
  }, []);

  return (
    <PageShell width="full">
      <PageHeader
        title="Dashboard"
        description="Your characters, homebrew and campaigns at a glance."
        actions={
          <Button as={Link} href="/creator/character" color="primary" size="sm">
            New character
          </Button>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Characters" value={summary?.characters ?? '—'} />
        <Stat label="Homebrew" value={summary?.homebrew ?? '—'} />
        <Stat label="Campaigns" value={summary?.campaigns ?? '—'} />
        <Stat label="As DM" value={summary?.asDm ?? '—'} />
      </div>

      <SectionCard
        title="Your characters"
        actions={
          <Button
            as={Link}
            href="/characters"
            size="sm"
            variant="light"
            className="text-ink-muted"
          >
            View all
          </Button>
        }
      >
        <CharactersList embedded />
      </SectionCard>
    </PageShell>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
