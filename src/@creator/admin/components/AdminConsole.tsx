'use client';

import { Button, Input, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiceSpinner,
  Glyph,
  Ribbon,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type {
  AdminBreakdown,
  AdminOverview,
  AdminSeries,
  AdminUserRow,
} from '@/server/admin';
import {
  adminOverviewAction,
  listUsersAction,
  setUserDisabledAction,
  setUserSuperAdminAction,
  verifyUserEmailAction,
} from '../actions';

/* --- reading numbers ----------------------------------------------------- */

/** "1.4 GB" — a size a person can read without counting zeroes. */
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

/** Thousands separated, so 12480 does not read as 1248. */
const num = (n: number) => n.toLocaleString();

/**
 * "1 piece" / "3 pieces". The unit is given plural because that is how it
 * reads in the data, and a trailing "s" is stripped for the one case.
 */
function plural(n: number, unit: string): string {
  return `${num(n)} ${n === 1 ? unit.replace(/s$/, '') : unit}`;
}

/** "3d ago" / "just now". `never` for an account that has done nothing. */
function ago(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'never';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

/* --- charts -------------------------------------------------------------- */

/*
 * One data hue for every chart on this page.
 *
 * Every chart here is a single series — a count per bucket, a count per named
 * thing — so there is no categorical palette to keep apart, and nothing to
 * validate for colour-vision separation. Gold is the app's own data colour and
 * clears 3:1 against both surfaces. The status colours (`--danger`,
 * `--warning`, `--success`) stay reserved for state and never appear as a bar
 * fill, which is what keeps "that number is red" meaning something.
 */

/**
 * A count per bucket, as bars.
 *
 * Bars rather than a line because the buckets are discrete and often zero: a
 * line through "no rolls on Tuesday" draws a slope between Monday and
 * Wednesday that did not happen. Every bucket is drawn, including the empty
 * ones, so thirty bars always mean thirty days.
 *
 * Labels are selective by design — the first bucket, the peak and the last.
 * A number over every bar is the fastest way to make thirty of them
 * unreadable; the hover readout is where the rest live.
 */
function BarSeries({ series }: { series: AdminSeries }) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...series.points.map(p => p.value));
  const peakAt = series.points.findIndex(p => p.value === peak);
  const total = series.points.reduce((n, p) => n + p.value, 0);
  const shown = hover !== null ? series.points[hover] : null;

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-ink">{series.title}</span>
        {/* The hover readout replaces the summary rather than appearing
            beside it, so nothing on the row moves when the pointer does. */}
        <span className="text-xs tabular-nums text-ink-muted">
          {shown
            ? `${shown.full} · ${plural(shown.value, series.unit)}`
            : `${plural(total, series.unit)} · peak ${num(peak)}`}
        </span>
      </figcaption>

      <div
        className="flex h-24 items-end gap-[2px]"
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${series.title}: ${plural(total, series.unit)} across ${series.points.length} buckets, peaking at ${num(peak)}.`}
      >
        {series.points.map((p, i) => (
          <div
            key={p.full}
            onPointerEnter={() => setHover(i)}
            className="relative flex h-full flex-1 cursor-default flex-col justify-end"
          >
            {/* A full-height hit target: a 3px bar is not something a
                pointer can be asked to find. */}
            <span
              aria-hidden="true"
              className={`absolute inset-0 rounded-sm ${
                hover === i ? 'bg-ink/[0.06]' : ''
              }`}
            />
            <span
              aria-hidden="true"
              className="relative rounded-t-[3px] bg-gold"
              style={{
                height: `${Math.max(p.value > 0 ? 3 : 1, (p.value / peak) * 100)}%`,
                opacity: p.value === 0 ? 0.22 : hover === i ? 1 : 0.85,
              }}
            />
          </div>
        ))}
      </div>

      {/* The axis: the first bucket, the peak and the last. Thirty labels
          under thirty 8px bars is a smear. */}
      <div className="mt-1 flex gap-[2px]">
        {series.points.map((p, i) => (
          <span
            key={p.full}
            className="flex-1 text-center text-[0.55rem] tabular-nums text-ink-subtle"
          >
            {i === 0 ||
            i === series.points.length - 1 ||
            (i === peakAt && total > 0)
              ? p.label
              : ' '}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-subtle">{series.line}</p>
    </figure>
  );
}

/**
 * A magnitude comparison of named things, as a horizontal bar list.
 *
 * Horizontal because the labels are words — "background", "Level 12" — and a
 * word under a vertical bar has to be rotated or truncated. The number is
 * direct-labelled on every row because there are ten of them, not thirty, and
 * the row carries its own name: no legend, and identity is never colour
 * alone. The list is the table view.
 */
function BreakdownBars({ breakdown }: { breakdown: AdminBreakdown }) {
  const peak = Math.max(1, ...breakdown.rows.map(r => r.value));
  const total = breakdown.rows.reduce((n, r) => n + r.value, 0);

  if (breakdown.rows.length === 0) {
    return (
      <SectionCard title={breakdown.title} description={breakdown.line}>
        <p className="text-sm text-ink-subtle">Nothing yet.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title={breakdown.title}
      description={`${breakdown.line} ${plural(total, breakdown.unit)} in all.`}
    >
      <ul className="space-y-1.5">
        {breakdown.rows.map(row => (
          <li key={row.label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-xs capitalize text-ink-muted">
              {row.label}
            </span>
            <span className="h-2.5 min-w-0 flex-1 rounded-sm bg-surface-2">
              <span
                aria-hidden="true"
                className="block h-full rounded-sm bg-gold"
                style={{ width: `${Math.max(2, (row.value / peak) * 100)}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink">
              {num(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/* --- people -------------------------------------------------------------- */

/** One account, and the three things an operator can do to it. */
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
          {user.isSuperAdmin && <Ribbon tone="gold">Super admin</Ribbon>}
          {off && (
            <span className="rounded-sm border border-danger/50 px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-danger">
              disabled
            </span>
          )}
          {!user.verified && (
            <span className="rounded-sm border border-warning/50 px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-warning">
              unverified
            </span>
          )}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {user.email} · joined {user.createdAt.slice(0, 10)} · last activity{' '}
          {ago(user.lastSeen)}
        </p>
        <p className="truncate text-xs text-ink-subtle">
          {plural(user.characters, 'characters')} ·{' '}
          {plural(user.campaigns, 'campaigns')} · {num(user.runs)} owned ·{' '}
          {plural(user.forged, 'homebrew pieces')}
        </p>
      </div>

      {!user.verified && (
        <Button size="sm" variant="flat" isDisabled={busy} onPress={onVerify}>
          Verify email
        </Button>
      )}
      <Button
        size="sm"
        variant="light"
        isDisabled={busy}
        onPress={() => onAdmin(!user.isSuperAdmin)}
      >
        {user.isSuperAdmin ? 'Remove super admin' : 'Make super admin'}
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
        {off ? 'Enable' : 'Disable'}
      </Button>
    </li>
  );
}

/* --- the page ------------------------------------------------------------ */

/**
 * The admin console.
 *
 * Plain language throughout, unlike the rest of the app, and deliberately
 * outside the naming document's in-world vocabulary: this page is read while
 * something is going wrong, by the person who owns the machine.
 *
 * Deliberately narrow. Counts, sizes, signups and accounts — nothing that
 * reads a campaign's canon, a DM's notebook or anybody's sheet. Running the
 * machine and playing at a table are different jobs, and this is the first.
 */
export function AdminConsole() {
  const [overview, setOverview] = useState<AdminOverview | null | undefined>(
    undefined
  );
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const loadUsers = useCallback(async (q: string) => {
    setUsers(await listUsersAction(q));
  }, []);

  const loadOverview = useCallback(async () => {
    setOverview(await adminOverviewAction());
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(query), 250);
    return () => clearTimeout(timer);
  }, [query, loadUsers]);

  const act = async <T,>(
    p: Promise<{ ok: boolean; error?: string; data?: T }>
  ) => {
    setBusy(true);
    setError(null);
    const res = await p;
    if (!res.ok) setError(res.error ?? 'That did not work.');
    await loadUsers(query);
    await loadOverview();
    setBusy(false);
    return res;
  };

  /** The four numbers worth reading before anything else. */
  const headline = useMemo(() => {
    if (!overview) return [];
    const find = (group: string, metric: string) =>
      overview.groups
        .find(g => g.key === group)
        ?.metrics.find(m => m.key === metric)?.value ?? 0;
    return [
      { one: 'account', many: 'accounts', value: find('people', 'accounts') },
      {
        one: 'active in 30 days',
        many: 'active in 30 days',
        value: find('people', 'active30'),
      },
      { one: 'campaign', many: 'campaigns', value: find('campaigns', 'total') },
      {
        one: 'session played',
        many: 'sessions played',
        value: find('play', 'played'),
      },
    ];
  }, [overview]);

  if (overview === undefined) {
    return (
      <div className="flex justify-center py-16">
        <DiceSpinner label="Reading the database…" />
      </div>
    );
  }

  if (overview === null) {
    return (
      <SectionCard title="Not available">
        <p className="text-sm text-ink-muted">
          This page belongs to whoever runs this install. If that is you, put
          your address in <code className="text-ink">ADMIN_EMAILS</code> and
          sign in again.
        </p>
      </SectionCard>
    );
  }

  const storedBytes = overview.storage.kinds.reduce((n, k) => n + k.bytes, 0);

  return (
    <div className="space-y-6">
      {dialog}
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink-muted">
          {notice}
        </p>
      )}

      {/* The headline four. A readout, which an operating surface is allowed:
          numbers set beside their own words, not a grid of tiles. */}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 border-b border-line pb-4">
        {headline.map(h => (
          <span key={h.many} className="flex items-baseline gap-2">
            <span className="font-display text-3xl tabular-nums text-ink">
              {num(h.value)}
            </span>
            <span className="text-sm text-ink-muted">
              {h.value === 1 ? h.one : h.many}
            </span>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-subtle">
          Read at {new Date(overview.generatedAt).toLocaleTimeString()}
          <Button
            size="sm"
            variant="light"
            className="h-6 min-w-0 px-2 text-xs"
            isDisabled={busy}
            onPress={() => loadOverview()}
          >
            Refresh
          </Button>
        </span>
      </div>

      {/* Over time. Three single-series charts, one hue, no legend. */}
      <SectionCard
        title="Over time"
        description="Every bucket is drawn, including the empty ones. Hover a bar for its number."
      >
        <div className="grid gap-6 lg:grid-cols-3">
          {overview.series.map(s => (
            <BarSeries key={s.key} series={s} />
          ))}
        </div>
      </SectionCard>

      {/* The counts, grouped. */}
      <div className="grid gap-5 lg:grid-cols-2">
        {overview.groups.map(group => (
          <SectionCard
            key={group.key}
            title={group.title}
            description={group.line}
          >
            <ul className="divide-y divide-line">
              {group.metrics.map(m => (
                <li
                  key={m.key}
                  className="flex flex-wrap items-baseline gap-x-3 py-1.5"
                >
                  <span
                    className={`w-16 shrink-0 text-right font-display text-xl tabular-nums ${
                      m.tone === 'bad'
                        ? 'text-danger'
                        : m.tone === 'warn'
                          ? 'text-warning'
                          : 'text-ink'
                    }`}
                  >
                    {num(m.value)}
                  </span>
                  <span className="text-sm text-ink-muted">{m.label}</span>
                  {m.hint && (
                    <span className="basis-full pl-[4.75rem] text-xs text-ink-subtle">
                      {m.hint}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
      </div>

      {/* Breakdowns. */}
      <div className="grid gap-5 lg:grid-cols-2">
        {overview.breakdowns.map(b => (
          <BreakdownBars key={b.key} breakdown={b} />
        ))}
      </div>

      {/* Disk. */}
      <SectionCard
        title="Disk"
        description="Uploads live beside the database, not inside it."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <ul className="space-y-1.5">
            {overview.storage.kinds.map(k => (
              <li key={k.label} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-xs text-ink-muted">
                  {k.label}
                </span>
                <span className="h-2.5 min-w-0 flex-1 rounded-sm bg-surface-2">
                  <span
                    aria-hidden="true"
                    className="block h-full rounded-sm bg-gold"
                    style={{
                      width: `${
                        storedBytes > 0
                          ? Math.max(2, (k.bytes / storedBytes) * 100)
                          : 2
                      }%`,
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink">
                  {bytesWords(k.bytes)}
                </span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-subtle">
                  {num(k.files)}
                </span>
              </li>
            ))}
          </ul>

          <ul className="divide-y divide-line self-start">
            <li className="flex items-baseline gap-3 py-1.5">
              <span className="w-24 shrink-0 text-right font-display text-xl tabular-nums text-ink">
                {bytesWords(overview.storage.onDisk.bytes)}
              </span>
              <span className="text-sm text-ink-muted">
                on disk, across {plural(overview.storage.onDisk.files, 'files')}
              </span>
            </li>
            <li className="flex items-baseline gap-3 py-1.5">
              <span className="w-24 shrink-0 text-right font-display text-xl tabular-nums text-ink">
                {bytesWords(overview.storage.database)}
              </span>
              <span className="text-sm text-ink-muted">
                the SQLite database
              </span>
            </li>
            {overview.storage.onDisk.bytes !== storedBytes && (
              <li className="py-1.5 text-xs text-ink-subtle">
                The rows account for {bytesWords(storedBytes)}. The difference
                is files nothing points at any more.
              </li>
            )}
          </ul>
        </div>
      </SectionCard>

      {/* Busiest campaigns. Names only. */}
      {overview.busiestCampaigns.length > 0 && (
        <SectionCard
          title="Busiest campaigns"
          description="By sessions played. Names only — what is in them is theirs."
        >
          <ul className="divide-y divide-line">
            {overview.busiestCampaigns.map(c => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline gap-x-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-ink">
                  {c.name}
                </span>
                <span className="tabular-nums text-ink-muted">
                  {num(c.sessions)} played
                </span>
                <span className="tabular-nums text-ink-subtle">
                  {plural(c.rolls, 'rolls')}
                </span>
                <span className="tabular-nums text-ink-subtle">
                  {plural(c.members, 'seats')}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* Accounts. */}
      <SectionCard
        title="Accounts"
        description="Verify an address by hand, grant or revoke super admin, or disable an account. Never a password — the reset flow is the only way to one of those."
      >
        <Input
          size="sm"
          aria-label="Find an account"
          placeholder="Find by name or address"
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
            <DiceSpinner label="Reading accounts…" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-6 text-sm text-ink-subtle">No account matches.</p>
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
                      ? `Make ${u.email} a super admin?`
                      : `Remove super admin from ${u.email}?`,
                    body: isAdmin
                      ? 'They will see this page and everything on it, and be able to disable accounts — including yours.'
                      : 'They lose this page. Their account is otherwise untouched.',
                    confirmLabel: isAdmin ? 'Grant it' : 'Revoke it',
                  });
                  if (!ok) return;
                  setNotice(null);
                  const res = await act(setUserSuperAdminAction(u.id, isAdmin));
                  /*
                   * Revoking does not stick for an address ADMIN_EMAILS names
                   * — the environment grants it back on the next check. Say
                   * so, rather than appearing to have done nothing.
                   */
                  if (res.ok && res.data?.overriddenByEnv) {
                    setNotice(
                      `${u.email} is named in ADMIN_EMAILS, so super admin was granted straight back. Remove it from the environment and restart to revoke for good.`
                    );
                  }
                }}
                onDisable={async disabled => {
                  if (!disabled) {
                    await act(setUserDisabledAction(u.id, false));
                    return;
                  }
                  const ok = await confirm({
                    title: `Disable ${u.email}?`,
                    body:
                      u.runs > 0
                        ? `They own ${u.runs} ${u.runs === 1 ? 'campaign' : 'campaigns'}. Those stay, and nobody at them can start a session until somebody else does. Nothing is deleted and this can be undone.`
                        : 'They cannot sign in until this is undone. Nothing they made is deleted.',
                    confirmLabel: 'Disable',
                    destructive: true,
                  });
                  if (!ok) return;
                  await act(setUserDisabledAction(u.id, true));
                }}
              />
            ))}
          </ul>
        )}

        <Tooltip content="Checked at sign-in and again on every token read, so an open tab is dropped on its next request rather than lasting out its three-day JWT.">
          <p className="mt-3 inline-block text-xs text-ink-subtle">
            Disabling takes effect at once, including for somebody already
            signed in.
          </p>
        </Tooltip>
      </SectionCard>
    </div>
  );
}
