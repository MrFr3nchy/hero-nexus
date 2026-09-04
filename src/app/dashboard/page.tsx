'use client';

import { Button, Link } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/@auth/context';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import {
  CandleScene,
  DiceSpinner,
  EmptyState,
  Fleuron,
  HeroCard,
  Ledger,
  Marginalia,
  PageShell,
  Ribbon,
} from '@/@shared/components/ui';
import { getDashboardDataAction, type DashboardData } from './actions';

const PARTY_PREVIEW = 5;
const TILT = [
  'rotate-0',
  'rotate-[0.7deg]',
  '-rotate-[0.9deg]',
  'rotate-[0.5deg]',
];

const DIE_LINES: Record<number, string> = {
  20: 'nat 20 — the dice like you',
  1: "nat 1 — pretend that didn't happen",
};

function HeaderDie() {
  const [face, setFace] = useState(20);
  const [spin, setSpin] = useState(0);

  return (
    <div className="shrink-0 text-center">
      <button
        type="button"
        onClick={() => {
          setFace(1 + Math.floor(Math.random() * 20));
          setSpin(s => s + 1);
        }}
        key={spin}
        style={
          spin > 0 ? { animation: 'd20-tumble 0.7s ease-out both' } : undefined
        }
        className="d20-spin block transition-transform hover:-translate-y-0.5"
        aria-label="Roll a d20"
      >
        <svg width="88" height="88" viewBox="0 0 100 100">
          <polygon
            points="50,6 92,30 92,74 50,96 8,74 8,30"
            fill="var(--surface)"
            stroke="var(--gold)"
            strokeWidth="1.4"
          />
          <polygon
            points="50,6 92,30 50,44 8,30"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="0.8"
            opacity="0.45"
          />
          <polygon
            points="8,30 50,44 50,96 8,74"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="0.8"
            opacity="0.45"
          />
          <polygon
            points="92,30 92,74 50,96 50,44"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="0.8"
            opacity="0.45"
          />
          <text
            x="50"
            y="62"
            textAnchor="middle"
            className="font-display"
            style={{ fontSize: 26, fill: 'var(--gold-strong)' }}
          >
            {face}
          </text>
        </svg>
      </button>
      <Marginalia className="mt-0.5 !text-base">
        {DIE_LINES[face] ?? `you rolled a ${face}`}
      </Marginalia>
    </div>
  );
}

function Rail({ rail }: { rail: DashboardData['rail'] }) {
  const { recentlyForged, tablesYouRun } = rail;
  if (recentlyForged.length === 0 && tablesYouRun.length === 0) return null;

  return (
    <aside className="border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
      {recentlyForged.length > 0 && (
        <div className="mb-7">
          <h3 className="font-display text-lg text-ink">Recently forged</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {recentlyForged.map(h => (
              <Link key={h.id} href="/creator/homebrew">
                <Ribbon tone="arcane">
                  {h.name} · {h.type}
                </Ribbon>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tablesYouRun.length > 0 && (
        <div>
          <h3 className="font-display text-lg text-ink">Tables you run</h3>
          <ul className="mt-3 space-y-2">
            {tablesYouRun.map(c => (
              <li key={c.id}>
                <Link
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between gap-3 text-sm text-ink-muted transition-colors hover:text-ink"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-ink-subtle tabular-nums">
                    {c.memberCount} {c.memberCount === 1 ? 'player' : 'players'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function DashboardContent() {
  const { currentUser } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    getDashboardDataAction()
      .then(setData)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const firstName =
    currentUser?.name?.trim().split(/\s+/)[0] ||
    currentUser?.email?.split('@')[0] ||
    'traveller';

  const characters = data?.characters ?? [];

  return (
    <PageShell width="full">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl leading-tight text-ink">
            The table is set,{' '}
            <em className="not-italic text-gold-strong">{firstName}</em>
          </h1>
          {data && (
            <Marginalia className="mt-1.5">
              {characters.length > 0
                ? `${characters.length} ${characters.length === 1 ? 'hero waits' : 'heroes wait'} on your word.`
                : 'The candle is lit and the chairs are empty.'}
            </Marginalia>
          )}
          <div className="mt-3">
            {data ? (
              <Ledger
                items={[
                  { value: data.summary.characters, label: 'heroes' },
                  { value: data.summary.campaigns, label: 'campaigns' },
                  { value: data.summary.homebrew, label: 'homebrew' },
                  { value: data.summary.asDm, label: 'tables you run' },
                ]}
              />
            ) : (
              <span className="block h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
            )}
          </div>
        </div>
        <HeaderDie />
      </div>

      <div className="my-8">
        <Fleuron />
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px] lg:items-start">
        <section>
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-display text-2xl text-ink">Your party</h2>
            <Link
              href="/characters"
              className="border-b border-line text-sm text-ink-muted transition-colors hover:text-ink"
            >
              See the whole roster
            </Link>
          </div>

          {error ? (
            <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              <span>Couldn&apos;t reach the table.</span>
              <Button size="sm" variant="light" onPress={load}>
                Retry
              </Button>
            </div>
          ) : !data ? (
            <div className="flex justify-center py-12">
              <DiceSpinner label="Gathering your heroes…" />
            </div>
          ) : characters.length === 0 ? (
            <EmptyState
              scene={<CandleScene />}
              title="No one has pulled up a chair yet"
              description="The candle's lit and the dice are cold. Roll someone up and we'll get started."
              action={
                <Button as={Link} href="/creator/character" color="primary">
                  Create your first hero
                </Button>
              }
            />
          ) : (
            <div className="flex flex-wrap gap-5">
              {characters.slice(0, PARTY_PREVIEW).map((c, i) => (
                <div
                  key={c.id}
                  className={`w-48 ${TILT[i % TILT.length]} transition-transform hover:rotate-0`}
                >
                  <HeroCard
                    layout="stack"
                    href={`/creator/character?id=${c.id}`}
                    name={c.name || 'Unnamed character'}
                    charClass={c.class || undefined}
                    level={c.level}
                    species={c.species || undefined}
                    note={c.hasHomebrew ? 'homebrew in play' : undefined}
                  />
                </div>
              ))}
              <Link
                href="/creator/character"
                className="flex w-48 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line p-5 text-center transition-colors hover:border-gold hover:bg-gold/[0.04]"
              >
                <span className="text-2xl text-gold">✦</span>
                <Marginalia>Roll a new one</Marginalia>
              </Link>
            </div>
          )}
        </section>

        {data && <Rail rail={data.rail} />}
      </div>
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
