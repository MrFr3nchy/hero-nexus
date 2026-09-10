'use client';

import {
  Button,
  Input,
  Select,
  SelectItem,
  Switch,
  Tooltip,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_KEYS,
  SKILL_LABELS,
} from '@/@creator/character/schema';
import {
  EmptyState,
  Glyph,
  Marginalia,
  QuestScene,
  SectionCard,
} from '@/@shared/components/ui';
import type { CampaignMemberRow } from '@/server/campaigns';
import { listMembersAction } from '../../actions';
import type { CheckRow, CheckTargetRow } from '@/server/checks';
import type { LiveState } from '@/server/session';
import {
  answerCheckAction,
  cancelCheckAction,
  dismissCheckAction,
  requestCheckAction,
} from '../../check-actions';

const MODES = ['disadvantage', 'straight', 'advantage'] as const;
type Mode = (typeof MODES)[number];

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** One person's line under an ask: asked, rolled, and how it went. */
function TargetLine({
  target,
  dcHidden,
}: {
  target: CheckTargetRow;
  dcHidden: boolean;
}) {
  const tone =
    target.outcome === 'pass'
      ? 'text-success'
      : target.outcome === 'fail'
        ? 'text-danger'
        : 'text-ink';

  return (
    <li className="flex items-baseline gap-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate text-ink-muted">
        {target.characterName || target.name}
      </span>
      {target.status === 'waiting' && (
        <span className="text-xs text-ink-subtle">waiting</span>
      )}
      {target.status === 'dismissed' && (
        <span className="text-xs text-ink-subtle">set aside</span>
      )}
      {target.status === 'rolled' && (
        <>
          <span className={`font-display text-lg tabular-nums ${tone}`}>
            {target.total}
          </span>
          {target.modifier !== null && target.modifier !== 0 && (
            <span className="text-[0.65rem] tabular-nums text-ink-subtle">
              {fmt(target.modifier)}
            </span>
          )}
          {/* No verdict where the DC was hidden — for the reader, there is
              nothing to be right about yet. */}
          {target.outcome && (
            <span className={`text-xs ${tone}`}>
              {target.outcome === 'pass' ? 'passes' : 'fails'}
            </span>
          )}
          {!target.outcome && dcHidden && (
            <span className="text-xs text-ink-subtle">—</span>
          )}
        </>
      )}
    </li>
  );
}

/**
 * One ask.
 *
 * The reader's own row carries the controls; everyone else's is a record.
 *
 * The roll is made on the server, from the modifier on their own sheet, and
 * lands in the shared log like any other — there is not a second dice log for
 * checks, and the browser never sends a total.
 */
function CheckCard({
  check,
  isStaff,
  refresh,
  onError,
}: {
  check: CheckRow;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('straight');
  const [busy, setBusy] = useState(false);

  const answer = async () => {
    setBusy(true);
    const res = await answerCheckAction(check.id, mode);
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    await refresh();
  };

  const settled = check.status !== 'open';

  return (
    <div
      className={`rounded-[var(--radius-card)] border bg-surface px-3 py-2.5 ${
        check.mine ? 'border-arcane/50' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Glyph
          name="target"
          size={14}
          className={check.mine ? 'text-arcane' : 'text-ink-subtle'}
        />
        <span className="text-sm font-medium text-ink">{check.ask}</span>
        {check.dc !== null && (
          <span className="text-xs tabular-nums text-ink-muted">
            DC {check.dc}
          </span>
        )}
        {check.dcHidden && (
          <Tooltip
            content={
              isStaff
                ? 'The party is not told what they need.'
                : 'The DM has not said what you need.'
            }
          >
            <span className="rounded-sm border border-line px-1 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle">
              DC withheld
            </span>
          </Tooltip>
        )}
        {settled && (
          <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
            {check.status === 'cancelled' ? 'withdrawn' : 'settled'}
          </span>
        )}
        {isStaff && !settled && (
          <Button
            size="sm"
            variant="light"
            className="ml-auto h-6 min-w-0 px-2 text-xs text-ink-subtle"
            onPress={async () => {
              const res = await cancelCheckAction(check.id);
              if (!res.ok) onError(res.error);
              await refresh();
            }}
          >
            Withdraw
          </Button>
        )}
      </div>

      {check.prompt && (
        <p className="mt-1 text-sm text-ink-muted">{check.prompt}</p>
      )}

      <ul className="mt-1.5 divide-y divide-line">
        {check.targets.map(t => (
          <TargetLine key={t.userId} target={t} dcHidden={check.dcHidden} />
        ))}
      </ul>

      {check.mine && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <div className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
            {MODES.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded px-2 py-0.5 text-xs capitalize transition-colors ${
                  mode === m
                    ? 'bg-gold font-medium text-bg'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {m === 'straight' ? 'straight' : m}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            color="primary"
            isDisabled={busy}
            isLoading={busy}
            onPress={answer}
          >
            Roll it
          </Button>
          <Tooltip content="The DM is told you set it aside.">
            <Button
              size="sm"
              variant="light"
              className="text-ink-subtle"
              isDisabled={busy}
              onPress={async () => {
                const res = await dismissCheckAction(check.id);
                if (!res.ok) onError(res.error);
                await refresh();
              }}
            >
              Not now
            </Button>
          </Tooltip>
          <Marginalia className="ml-auto" dash>
            rolled on your own numbers
          </Marginalia>
        </div>
      )}
    </div>
  );
}

/**
 * The DM's side: compose an ask.
 *
 * Loads the member list itself rather than taking it as a prop. Only staff
 * ever mount this, so a player never pays for a read they have no control to
 * spend it on — and the two surfaces that host this panel do not have to
 * remember to fetch something only one of their readers needs.
 */
function AskForm({
  campaignId,
  refresh,
  onError,
}: {
  campaignId: string;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);

  const load = useCallback(async () => {
    setMembers(await listMembersAction(campaignId).catch(() => []));
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const [what, setWhat] = useState<string>('perception');
  const [dc, setDc] = useState('');
  const [hidden, setHidden] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [who, setWho] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    const isSkill = (SKILL_KEYS as readonly string[]).includes(what);
    const isSave = what.startsWith('save:');
    const res = await requestCheckAction(campaignId, {
      kind: isSave ? 'save' : 'check',
      skill: isSkill ? what : null,
      ability: isSave ? what.slice(5) : null,
      prompt,
      dc: dc.trim() === '' ? null : Number(dc),
      dcVisibility: hidden ? 'hidden' : 'shown',
      targetUserIds: who,
    });
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setPrompt('');
    await refresh();
  };

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
      <Select
        aria-label="What to roll"
        size="sm"
        className="w-52"
        selectedKeys={[what]}
        onSelectionChange={keys => {
          const key = Array.from(keys)[0];
          if (key) setWhat(String(key));
        }}
      >
        <>
          {SKILL_KEYS.map(k => (
            <SelectItem key={k} textValue={SKILL_LABELS[k]}>
              {SKILL_LABELS[k]}
            </SelectItem>
          ))}
          {ABILITY_KEYS.map(k => (
            <SelectItem
              key={`save:${k}`}
              textValue={`${ABILITY_LABELS[k]} save`}
            >
              {ABILITY_LABELS[k]} save
            </SelectItem>
          ))}
        </>
      </Select>

      <Input
        size="sm"
        type="number"
        label="DC"
        placeholder="15"
        value={dc}
        onValueChange={setDc}
        className="w-20"
      />

      <Input
        size="sm"
        label="Against what"
        placeholder="past the dogs"
        value={prompt}
        onValueChange={setPrompt}
        className="min-w-40 flex-1"
      />

      <Select
        aria-label="Who is asked"
        size="sm"
        selectionMode="multiple"
        className="w-44"
        placeholder="Everyone"
        selectedKeys={new Set(who)}
        onSelectionChange={keys => setWho(Array.from(keys).map(String))}
      >
        {members.map(m => (
          <SelectItem
            key={m.userId}
            textValue={m.name ?? m.email ?? 'Somebody'}
          >
            {m.characterName ?? m.name ?? m.email ?? 'Somebody'}
          </SelectItem>
        ))}
      </Select>

      <Button size="sm" color="primary" isDisabled={busy} onPress={ask}>
        Ask
      </Button>

      <Tooltip content="They roll without knowing what they need. You see whether it was enough.">
        <div>
          <Switch size="sm" isSelected={hidden} onValueChange={setHidden}>
            <span className="text-xs text-ink-muted">Withhold the DC</span>
          </Switch>
        </div>
      </Tooltip>
    </div>
  );
}

/**
 * What the DM has asked for, and what came back.
 *
 * The one surface in this app where the table is asked a question rather than
 * told a thing. A player sees every ask made of anybody — a group check is a
 * shared moment, and hiding the other four rolls would make it five private
 * ones — but never a DC that was withheld, and never the verdict it decides.
 */
export function ChecksPanel({
  campaignId,
  state,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const checks = state.checks ?? [];
  const open = checks.filter(c => c.status === 'open');
  const settled = checks.filter(c => c.status !== 'open').slice(0, 5);

  return (
    <SectionCard
      title="The asking"
      description={
        isStaff
          ? 'Put a roll to the table, and watch what comes back.'
          : 'What the DM has asked of you.'
      }
      bodyClassName="space-y-2"
    >
      {checks.length === 0 ? (
        <EmptyState
          scene={<QuestScene />}
          title={isStaff ? 'Nothing asked' : 'Nothing is being asked of you'}
          description={
            isStaff
              ? 'Name a skill, set a number, and put it to whoever should sweat.'
              : 'When the DM wants a roll, it appears here and in the corner.'
          }
        />
      ) : (
        <>
          {open.map(c => (
            <CheckCard
              key={c.id}
              check={c}
              isStaff={isStaff}
              refresh={refresh}
              onError={onError}
            />
          ))}
          {settled.length > 0 && (
            <div className="space-y-2 pt-1 opacity-70">
              {settled.map(c => (
                <CheckCard
                  key={c.id}
                  check={c}
                  isStaff={isStaff}
                  refresh={refresh}
                  onError={onError}
                />
              ))}
            </div>
          )}
        </>
      )}

      {isStaff && (
        <AskForm campaignId={campaignId} refresh={refresh} onError={onError} />
      )}
    </SectionCard>
  );
}
