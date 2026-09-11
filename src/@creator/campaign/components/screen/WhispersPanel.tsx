'use client';

import { Button, Input, Select, SelectItem } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Glyph, Marginalia } from '@/@shared/components/ui';
import { useTable } from '@/@shared/table';
import type { CampaignMemberRow } from '@/server/campaigns';
import type { LiveState } from '@/server/session';
import type { WhisperRow } from '@/server/whispers';
import { listMembersAction } from '../../actions';
import { sendWhisperAction } from '../../whisper-actions';

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** How many whispers at a table this reader has not looked at. */
export function unreadWhispers(
  whispers: WhisperRow[],
  readAt: string | undefined
): number {
  return whispers.filter(w => !w.mine && (!readAt || w.createdAt > readAt))
    .length;
}

/** One line of the thread. */
function Line({
  whisper,
  viewerId,
}: {
  whisper: WhisperRow;
  viewerId: string;
}) {
  const from = whisper.mine
    ? 'You'
    : (whisper.fromCharacterName ?? whisper.fromName);
  // The reader is "you" wherever they appear, and everybody else is named —
  // so a DM overhearing "Rurik → Kessa" reads both ends, and Kessa reads
  // "Rurik → you".
  const to = whisper.targets
    .map(t => (t.userId === viewerId ? 'you' : (t.characterName ?? t.name)))
    .sort((a, b) => (a === 'you' ? -1 : b === 'you' ? 1 : 0))
    .join(', ');
  return (
    <li
      className={`rounded-md px-2 py-1 ${
        whisper.toMe ? 'bg-arcane/10' : whisper.mine ? 'bg-surface-2' : ''
      }`}
    >
      <div className="flex items-baseline gap-1.5 text-[0.65rem] text-ink-subtle">
        <span className={whisper.toMe ? 'text-arcane' : 'text-ink-muted'}>
          {from}
        </span>
        <Glyph name="arrow-right" size={9} className="shrink-0 self-center" />
        <span className="min-w-0 truncate">{to}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          {clock(whisper.createdAt)}
        </span>
      </div>
      <p className="text-sm leading-snug text-ink">{whisper.body}</p>
    </li>
  );
}

/**
 * Notes passed under the table.
 *
 * Reads as a thread — oldest at the top, newest at the bottom, the reader's
 * own lines on one wash and the ones said to them on another — and composes
 * to one or more people at the table. A player's compose opens addressed to
 * the DM, because "I pocket the key" is the commonest whisper there is; the
 * DM's opens addressed to nobody, because theirs is always a choice.
 *
 * Staff read everything here, and the thread says so where it matters: a
 * line between two players shows both names, not "you".
 *
 * Marks the table's whispers read while it is on screen, by writing the
 * newest `createdAt` into the reader's table preferences — the same place
 * mute lives, for the same reason. The folded shelf's badge reads that mark.
 */
export function WhispersPanel({
  campaignId,
  state,
  viewerId,
  isStaff,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  viewerId: string;
  isStaff: boolean;
  onError: (message: string) => void;
}) {
  const { preferences, setPreferences } = useTable();
  const [members, setMembers] = useState<CampaignMemberRow[]>([]);
  const [to, setTo] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLUListElement>(null);

  const whispers = state.whispers;
  const newest = whispers.length > 0 ? whispers[whispers.length - 1] : null;

  /* --- who can be told ------------------------------------------------ */

  const load = useCallback(async () => {
    const list = await listMembersAction(campaignId).catch(
      () => [] as CampaignMemberRow[]
    );
    setMembers(
      list.filter(m => m.userId !== viewerId && m.status === 'active')
    );
  }, [campaignId, viewerId]);

  useEffect(() => {
    load();
  }, [load]);

  // A player's note is to the DM until they say otherwise.
  useEffect(() => {
    if (isStaff || to.length > 0) return;
    const gm = members.find(m => m.role === 'gm');
    if (gm) setTo([gm.userId]);
    // Only on first load of the list: re-addressing a note the reader has
    // already re-addressed would be the app arguing with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, isStaff]);

  /* --- read marker ------------------------------------------------------ */

  const readAt = preferences.whispersReadAt[campaignId];
  useEffect(() => {
    if (!newest) return;
    if (readAt && readAt >= newest.createdAt) return;
    setPreferences({
      ...preferences,
      whispersReadAt: {
        ...preferences.whispersReadAt,
        [campaignId]: newest.createdAt,
      },
    });
    // `preferences` is read, not depended on: the write above is idempotent
    // and re-running it on every preference change would loop through the
    // provider for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, newest?.createdAt, readAt, setPreferences]);

  // Keep the newest line in view, inside this box rather than by scrolling
  // the shelf it sits in.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest?.id]);

  /* --- saying ----------------------------------------------------------- */

  const send = async () => {
    if (!body.trim() || to.length === 0) return;
    setBusy(true);
    const res = await sendWhisperAction(campaignId, {
      body,
      targetUserIds: to,
    });
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setBody('');
  };

  const nameOf = (m: CampaignMemberRow) =>
    m.characterName ??
    m.name?.trim() ??
    m.email?.split('@')[0] ??
    (m.role === 'gm' ? 'The DM' : 'Somebody');

  const label = useMemo(
    () =>
      to
        .map(id => members.find(m => m.userId === id))
        .filter((m): m is CampaignMemberRow => !!m)
        .map(m => (m.role === 'gm' ? 'the DM' : nameOf(m)))
        .join(', '),
    [to, members]
  );

  /* --- render ----------------------------------------------------------- */

  return (
    <div className="space-y-2">
      {whispers.length === 0 ? (
        <Marginalia dash>nothing passed under the table yet</Marginalia>
      ) : (
        <ul
          ref={threadRef}
          className="max-h-64 space-y-0.5 overflow-y-auto"
          aria-label="Whispers"
        >
          {whispers.map(w => (
            <Line key={w.id} whisper={w} viewerId={viewerId} />
          ))}
        </ul>
      )}

      {members.length === 0 ? (
        <p className="text-xs text-ink-subtle">Nobody else is at this table.</p>
      ) : (
        <div className="flex flex-col gap-1.5 border-t border-line pt-2">
          <Select
            aria-label="Who is told"
            size="sm"
            selectionMode="multiple"
            placeholder="To whom"
            classNames={{ trigger: 'h-8 min-h-8' }}
            selectedKeys={new Set(to)}
            onSelectionChange={keys => setTo(Array.from(keys).map(String))}
            renderValue={() => (
              <span className="text-xs text-ink">to {label}</span>
            )}
          >
            {members.map(m => (
              <SelectItem key={m.userId} textValue={nameOf(m)}>
                {m.role === 'gm' ? `${nameOf(m)} · the DM` : nameOf(m)}
              </SelectItem>
            ))}
          </Select>
          <div className="flex items-center gap-1.5">
            <Input
              size="sm"
              aria-label="What to whisper"
              placeholder="I pocket the key"
              classNames={{ inputWrapper: 'h-8 min-h-8' }}
              value={body}
              onValueChange={setBody}
              maxLength={500}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button
              size="sm"
              color="primary"
              className="h-8 min-w-0 px-2.5 text-xs"
              isDisabled={busy || !body.trim() || to.length === 0}
              isLoading={busy}
              onPress={send}
            >
              Whisper
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
