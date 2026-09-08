'use client';

import { Button, Input, NumberInput, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  HoardScene,
  Marginalia,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import { formatCalendarDate } from '@/@shared/lib/dates';
import type { AwardRow } from '@/server/awards';
import type { CampaignRole } from '@/server/campaigns';
import type { SessionRow } from '@/server/campaign-sessions';
import {
  awardExperienceAction,
  defaultRecipientsAction,
  deleteAwardAction,
  listAwardsAction,
} from '../award-actions';
import { listSessionsAction } from '../chronicle-actions';

/**
 * What the party got for the night.
 *
 * The sheets are the balance and this is the receipt: handing out experience
 * writes it onto every recipient's sheet through the normal character write
 * path, so it shows in the player's own change log. A panel that recorded an
 * award without moving the sheets would leave two places disagreeing about
 * what level somebody is.
 */
export function AwardsPanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerRole: CampaignRole;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [awards, setAwards] = useState<AwardRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [recipients, setRecipients] = useState<
    { characterId: string; name: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [kind, setKind] = useState<'xp' | 'milestone'>('xp');
  const [xp, setXp] = useState(0);
  const [levels, setLevels] = useState(1);
  const [note, setNote] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [chosen, setChosen] = useState<string[] | null>(null);
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setAwards(await listAwardsAction(campaignId));
    } catch {
      setError('Failed to read the awards.');
    }
  }, [campaignId]);

  const loadSide = useCallback(async () => {
    const [list, people] = await Promise.all([
      listSessionsAction(campaignId).catch(() => [] as SessionRow[]),
      defaultRecipientsAction(campaignId, sessionId || null).catch(() => []),
    ]);
    setSessions(list);
    setRecipients(people);
  }, [campaignId, sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    loadSide();
  }, [loadSide]);

  if (!awards) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Counting it up…" />
      </div>
    );
  }

  // Null means "whoever the register says" — the DM only names people when
  // they disagree with it, so the default is not a pre-ticked list of five.
  const receiving = chosen ?? recipients.map(r => r.characterId);

  const hand = async () => {
    const res = await awardExperienceAction(campaignId, {
      sessionId: sessionId || null,
      kind,
      xp: kind === 'xp' ? xp : undefined,
      levels: kind === 'milestone' ? levels : undefined,
      note,
      characterIds: chosen ?? undefined,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(
      res.data.skipped > 0
        ? `Handed to ${res.data.granted}. ${res.data.skipped} could not take it — check their sheets.`
        : `Handed to ${res.data.granted}.`
    );
    setXp(0);
    setNote('');
    setChosen(null);
    await refresh();
  };

  return (
    <div className="space-y-5">
      {dialog}

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      )}

      {isStaff && (
        <SectionCard
          title="Hand it out"
          description="It lands on their sheets, and on their own change log."
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <Select
                aria-label="What kind of award"
                size="sm"
                className="w-40"
                selectedKeys={[kind]}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  if (key) setKind(String(key) as 'xp' | 'milestone');
                }}
              >
                <SelectItem key="xp" textValue="Experience">
                  Experience
                </SelectItem>
                <SelectItem key="milestone" textValue="Milestone">
                  Milestone
                </SelectItem>
              </Select>

              {kind === 'xp' ? (
                <NumberInput
                  size="sm"
                  label="XP each"
                  minValue={0}
                  className="w-32"
                  value={xp}
                  onValueChange={v => setXp(Number(v) || 0)}
                />
              ) : (
                <NumberInput
                  size="sm"
                  label="Levels"
                  minValue={1}
                  maxValue={20}
                  className="w-28"
                  value={levels}
                  onValueChange={v => setLevels(Number(v) || 1)}
                />
              )}

              <Select
                aria-label="For which sitting"
                size="sm"
                className="w-44"
                placeholder="No sitting"
                selectedKeys={sessionId ? [sessionId] : []}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  setSessionId(key ? String(key) : '');
                  setChosen(null);
                }}
              >
                {sessions.map(s => (
                  <SelectItem key={s.id} textValue={`Session ${s.number}`}>
                    Session {s.number}
                    {s.title ? ` · ${s.title}` : ''}
                  </SelectItem>
                ))}
              </Select>

              <Input
                size="sm"
                label="What for"
                placeholder="The bridge, and not burning the mill"
                className="min-w-40 flex-1"
                value={note}
                onValueChange={setNote}
              />
            </div>

            {recipients.length > 0 && (
              <div>
                <div className="font-display-alt text-[0.6rem] uppercase tracking-[0.12em] text-ink-subtle">
                  Going to
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {recipients.map(r => {
                    const on = receiving.includes(r.characterId);
                    return (
                      <button
                        key={r.characterId}
                        type="button"
                        onClick={() =>
                          setChosen(
                            on
                              ? receiving.filter(id => id !== r.characterId)
                              : [...receiving, r.characterId]
                          )
                        }
                        className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                          on
                            ? 'border-gold bg-gold/15 text-ink'
                            : 'border-line text-ink-muted hover:border-gold/60 hover:text-ink'
                        }`}
                      >
                        {r.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-ink-subtle">
                  Starts from whoever the register says was there. Change it if
                  you disagree.
                </p>
              </div>
            )}

            <div>
              <Button
                size="sm"
                color="primary"
                isDisabled={
                  receiving.length === 0 || (kind === 'xp' && xp <= 0)
                }
                onPress={hand}
              >
                Hand it out
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {awards.length === 0 ? (
        <EmptyState
          scene={<HoardScene />}
          title="Nothing handed out yet"
          description={
            isStaff
              ? 'Experience or a milestone lands on every recipient’s sheet, and on their own change log.'
              : 'What you are given for a night’s work gets written down here.'
          }
        />
      ) : (
        <SectionCard title="What has been handed out">
          <ul className="divide-y divide-line">
            {awards.map(a => (
              <li key={a.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.16em] text-ink-subtle">
                  {formatCalendarDate(a.createdAt)}
                </span>
                <span className="text-sm text-ink">
                  {a.kind === 'xp'
                    ? `${a.xp.toLocaleString()} XP each`
                    : `${a.levels} level${a.levels === 1 ? '' : 's'}`}
                </span>
                {a.sessionNumber !== null && (
                  <span className="text-xs text-ink-subtle">
                    session {a.sessionNumber}
                  </span>
                )}
                <span className="min-w-0 flex-1 text-xs text-ink-subtle">
                  {a.grants.map(g => g.characterName).join(', ')}
                  {a.note ? ` — ${a.note}` : ''}
                </span>
                {isStaff && (
                  <button
                    type="button"
                    onClick={async () => {
                      const yes = await confirm({
                        title: 'Strike this award?',
                        body: 'The record goes. The experience stays on their sheets — unwinding it would mean guessing what else has happened since, so correct the sheet yourself if it needs it.',
                        confirmLabel: 'Strike it',
                        destructive: true,
                      });
                      if (!yes) return;
                      const res = await deleteAwardAction(campaignId, a.id);
                      if (!res.ok) setError(res.error);
                      await refresh();
                    }}
                    className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-danger"
                  >
                    strike
                  </button>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <Marginalia dash>it lands on the sheet, not just in a list</Marginalia>
    </div>
  );
}
