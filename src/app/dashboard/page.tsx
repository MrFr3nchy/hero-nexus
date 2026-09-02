'use client';

import { Button, Link } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { listCharactersAction } from '@/@creator/character/actions';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import {
  DiceSpinner,
  EmptyState,
  HeroCard,
  Ledger,
  PageHeader,
  PageShell,
  SectionCard,
} from '@/@shared/components/ui';
import type { CharacterRow } from '@/server/characters';
import { getDashboardSummaryAction, type DashboardSummary } from './actions';

const DASHBOARD_PREVIEW_COUNT = 4;

function LedgerRefreshDie({ onRoll }: { onRoll: () => void }) {
  const [spin, setSpin] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setSpin(s => s + 1);
        onRoll();
      }}
      key={spin}
      style={
        spin > 0 ? { animation: 'd20-tumble 0.6s ease-out both' } : undefined
      }
      className="d20-spin flex h-10 w-10 items-center justify-center rounded-md border border-gold/50 bg-surface-2 text-gold transition-colors hover:border-gold"
      aria-label="Re-tally the ledger"
    >
      <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 1 L14 4.5 L14 11.5 L8 15 L2 11.5 L2 4.5 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M8 1 L8 15 M2 4.5 L14 11.5 M14 4.5 L2 11.5"
          stroke="currentColor"
          strokeWidth="0.8"
          opacity="0.6"
        />
      </svg>
    </button>
  );
}

function DashboardHeroes() {
  const [characters, setCharacters] = useState<CharacterRow[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    listCharactersAction()
      .then(setCharacters)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
        <span>Couldn&apos;t reach the roster.</span>
        <Button size="sm" variant="light" onPress={load}>
          Retry
        </Button>
      </div>
    );
  }

  if (!characters) {
    return (
      <div className="flex justify-center py-10">
        <DiceSpinner label="Gathering your heroes…" />
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <EmptyState
        icon="🕯️"
        title="No one has pulled up a chair yet"
        description="Build your first character and the table starts to fill."
        action={
          <Button as={Link} href="/creator/character" color="primary">
            Forge a hero
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-3">
      {characters.slice(0, DASHBOARD_PREVIEW_COUNT).map(c => (
        <HeroCard
          key={c.id}
          href={`/creator/character?id=${c.id}`}
          name={c.name || 'Unnamed character'}
          charClass={c.class || undefined}
          level={c.level}
          species={c.species || undefined}
          note={c.hasHomebrew ? 'homebrew in play' : undefined}
        />
      ))}
    </div>
  );
}

function DashboardContent() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const loadSummary = useCallback(() => {
    getDashboardSummaryAction().then(setSummary).catch(console.error);
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return (
    <PageShell width="full">
      <PageHeader
        rule={false}
        title="Your table"
        actions={
          <Button as={Link} href="/creator/character" color="primary" size="sm">
            New character
          </Button>
        }
      />

      <div className="mb-8 flex items-center gap-4">
        <LedgerRefreshDie onRoll={loadSummary} />
        {summary ? (
          <Ledger
            items={[
              { value: summary.characters, label: 'heroes' },
              { value: summary.campaigns, label: 'campaigns' },
              { value: summary.homebrew, label: 'homebrew' },
              { value: summary.asDm, label: 'tables you run' },
            ]}
          />
        ) : (
          <span className="h-4 w-64 animate-pulse rounded bg-surface-2" />
        )}
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
        <DashboardHeroes />
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
