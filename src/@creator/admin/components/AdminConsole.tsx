'use client';

import { Button, Input } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  Glyph,
  Ledger,
  Marginalia,
  Ribbon,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { AdminOverview, AdminUserRow } from '@/server/admin';
import {
  adminOverviewAction,
  listUsersAction,
  setUserDisabledAction,
  setUserSuperAdminAction,
  verifyUserEmailAction,
} from '../actions';

/** "1.4 GB" — bytes a person can read without counting zeroes. */
function bytesWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * Signups over the last fortnight, as a row of bars.
 *
 * The one moving part on this page is nothing: the bars are drawn at their
 * height and hold still. It is a readout, which is what an operating surface
 * is allowed (design rule 9) — and this is one, because it is looked at
 * while something is going wrong.
 */
function SignupBars({ days }: { days: { day: string; count: number }[] }) {
  const peak = Math.max(1, ...days.map(d => d.count));
  return (
    <div>
      <ul className="flex items-end gap-1" aria-label="Signups by day">
        {days.map(d => (
          <li key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <span
              className="w-full rounded-sm bg-gold/60"
              style={{ height: `${Math.max(2, (d.count / peak) * 56)}px` }}
              title={`${d.day} · ${d.count}`}
            />
            <span className="text-[0.55rem] tabular-nums text-ink-subtle">
              {d.day.slice(8)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-ink-muted">
        {days.reduce((n, d) => n + d.count, 0)} new{' '}
        {days.reduce((n, d) => n + d.count, 0) === 1 ? 'account' : 'accounts'}{' '}
        in the last fortnight
        {peak > 1 ? `, ${peak} on the busiest day` : ''}.
      </p>
    </div>
  );
}

/** One account, and the handles an operator has on it. */
function UserRow({
  user,
  busy,
  onDisable,
  onAdmin,
  onVerify,
}: {
  user: AdminUserRow;
  busy: boolean;
  onDisable: (disabled: boolean) => void;
  onAdmin: (isAdmin: boolean) => void;
  onVerify: () => void;
}) {
  const off = user.disabledAt !== null;
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 ${
        off ? 'opacity-60' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="truncate font-medium">
            {user.name || user.email.split('@')[0]}
          </span>
          {user.isSuperAdmin && <Ribbon tone="gold">Runs the box</Ribbon>}
          {off && <Ribbon tone="neutral">Shut off</Ribbon>}
          {!user.verified && (
            <span className="rounded-sm border border-warning/50 px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-warning">
              unverified
            </span>
          )}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {user.email} · joined {user.createdAt.slice(0, 10)} ·{' '}
          {user.characters} {user.characters === 1 ? 'hero' : 'heroes'} ·{' '}
          {user.campaigns} {user.campaigns === 1 ? 'table' : 'tables'}
          {user.runs > 0 ? ` · runs ${user.runs}` : ''}
        </p>
      </div>

      {!user.verified && (
        <Button size="sm" variant="flat" isDisabled={busy} onPress={onVerify}>
          Verify the address
        </Button>
      )}
      <Button
        size="sm"
        variant="light"
        isDisabled={busy}
        onPress={() => onAdmin(!user.isSuperAdmin)}
      >
        {user.isSuperAdmin ? 'Take the keys back' : 'Hand them the keys'}
      </Button>
      <Button
        size="sm"
        variant="light"
        className={
          off
            ? 'text-ink-muted'
            : 'text-ink-muted data-[hover=true]:text-danger'
        }
        isDisabled={busy}
        onPress={() => onDisable(!off)}
      >
        {off ? 'Turn it back on' : 'Shut it off'}
      </Button>
    </li>
  );
}

/**
 * What the person who runs this box can see, and the few things they can do.
 *
 * Deliberately narrow. The counts, the disk, the signups and the accounts —
 * nothing that reads a campaign's canon, a DM's notebook or anybody's sheet.
 * Running the machine and playing at a table are different jobs, and the
 * operator gets the first one only.
 */
export function AdminConsole() {
  const [overview, setOverview] = useState<AdminOverview | null | undefined>(
    undefined
  );
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const loadUsers = useCallback(async (q: string) => {
    setUsers(await listUsersAction(q));
  }, []);

  useEffect(() => {
    adminOverviewAction().then(setOverview);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(query), 250);
    return () => clearTimeout(timer);
  }, [query, loadUsers]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await p;
    if (!res.ok) setError(res.error ?? 'That did not take.');
    await loadUsers(query);
    setOverview(await adminOverviewAction());
    setBusy(false);
  };

  if (overview === undefined) {
    return (
      <div className="flex justify-center py-16">
        <DiceSpinner label="Counting the house…" />
      </div>
    );
  }

  if (overview === null) {
    return (
      <SectionCard title="Not your box">
        <p className="text-sm text-ink-muted">
          This page belongs to whoever runs this install. If that is you, put
          your address in <code className="text-ink">ADMIN_EMAILS</code> and
          sign in again.
        </p>
      </SectionCard>
    );
  }

  const lead = overview.stats.filter(s =>
    ['accounts', 'tables', 'heroes', 'sessions'].includes(s.key)
  );
  const rest = overview.stats.filter(s => !lead.includes(s));

  return (
    <div className="space-y-6">
      {dialog}
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Ledger items={lead.map(s => ({ value: s.value, label: s.label }))} />

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <SectionCard
          title="Who has arrived"
          description="New accounts over the last fortnight."
        >
          <SignupBars days={overview.signups} />
        </SectionCard>

        <SectionCard
          title="What is on the disk"
          description="Everything anybody has uploaded: portraits, handouts, board pictures, sound."
        >
          <p className="font-display text-3xl text-ink">
            {bytesWords(overview.uploads.bytes)}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            across {overview.uploads.files}{' '}
            {overview.uploads.files === 1 ? 'file' : 'files'}
          </p>
          <Marginalia className="mt-2" dash>
            uploads live beside the database, not in it
          </Marginalia>
        </SectionCard>
      </div>

      <SectionCard
        title="The rest of it"
        description="Everything else this install is holding."
      >
        <ul className="divide-y divide-line">
          {rest.map(s => (
            <li
              key={s.key}
              className="flex flex-wrap items-baseline gap-x-3 py-2"
            >
              <span className="font-display text-xl tabular-nums text-ink">
                {s.value}
              </span>
              <span className="text-sm text-ink-muted">{s.label}</span>
              {s.note && (
                <span className="text-xs text-ink-subtle">{s.note}</span>
              )}
            </li>
          ))}
        </ul>
      </SectionCard>

      {overview.busiest.length > 0 && (
        <SectionCard
          title="The busiest tables"
          description="By sessions actually played. Names only — what is in them is theirs."
        >
          <ul className="divide-y divide-line">
            {overview.busiest.map(c => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {c.name}
                </span>
                <span className="tabular-nums text-ink-muted">
                  {c.sessions} played
                </span>
                <span className="tabular-nums text-ink-subtle">
                  {c.members} at the table
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title="The people"
        description="Verify an address by hand, hand somebody the keys, or shut an account off. Never a password — the reset flow is the only way in to one of those."
      >
        <Input
          size="sm"
          aria-label="Find an account"
          placeholder="Find an account by name or address"
          value={query}
          onValueChange={setQuery}
          isClearable
          onClear={() => setQuery('')}
          startContent={
            <Glyph name="magnifier" size={15} className="text-ink-subtle" />
          }
        />

        {users === null ? (
          <div className="flex justify-center py-8">
            <DiceSpinner label="Reading the register…" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-6 text-sm text-ink-subtle">Nobody by that name.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {users.map(u => (
              <UserRow
                key={u.id}
                user={u}
                busy={busy}
                onVerify={() => act(verifyUserEmailAction(u.id))}
                onAdmin={async isAdmin => {
                  const ok = await confirm({
                    title: isAdmin
                      ? `Hand ${u.name || u.email} the keys?`
                      : `Take the keys from ${u.name || u.email}?`,
                    body: isAdmin
                      ? 'They will see this page and everything on it, and be able to shut accounts off — including yours.'
                      : 'They lose this page. Their account is otherwise untouched.',
                    confirmLabel: isAdmin ? 'Hand them over' : 'Take them back',
                  });
                  if (!ok) return;
                  await act(setUserSuperAdminAction(u.id, isAdmin));
                }}
                onDisable={async disabled => {
                  if (!disabled) {
                    await act(setUserDisabledAction(u.id, false));
                    return;
                  }
                  const ok = await confirm({
                    title: `Shut off ${u.name || u.email}?`,
                    body:
                      u.runs > 0
                        ? `They run ${u.runs} ${u.runs === 1 ? 'table' : 'tables'}. Those tables stay, and nobody at them can start a session until somebody else does. Nothing is deleted and this can be undone.`
                        : 'They cannot sign in until this is undone. Nothing they made is deleted.',
                    confirmLabel: 'Shut it off',
                    destructive: true,
                  });
                  if (!ok) return;
                  await act(setUserDisabledAction(u.id, true));
                }}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      <Marginalia dash>
        nothing on this page reads a canon entry, a notebook or a sheet — on
        purpose
      </Marginalia>
    </div>
  );
}
