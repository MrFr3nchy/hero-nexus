'use client';

import { Button, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import {
  DiceSpinner,
  EmptyState,
  HourglassScene,
  Marginalia,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { CampaignRole } from '@/server/campaigns';
import type { ClockRow } from '@/server/clocks';
import { CLOCK_SEGMENTS } from '../lib/clocks';
import {
  createClockAction,
  deleteClockAction,
  listClocksAction,
  tickClockAction,
  updateClockAction,
} from '../clock-actions';

/**
 * The clock face.
 *
 * Ornament with state behind it (design rule 6): the ring *is* the number, and
 * a filled segment is the only thing on this panel that says how close
 * something is. Drawn rather than counted in text because "5/8" is a fact you
 * read and a three-quarters-full ring is one you feel, which is the entire
 * reason a table uses clocks instead of a tally.
 */
function ClockFace({
  segments,
  filled,
  done,
}: {
  segments: number;
  filled: number;
  done: boolean;
}) {
  const size = 56;
  const r = 22;
  const c = size / 2;
  const gap = 3; // degrees of hairline between segments

  const wedge = (index: number): string => {
    const step = 360 / segments;
    const start = index * step - 90 + gap / 2;
    const end = (index + 1) * step - 90 - gap / 2;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const x1 = c + r * Math.cos(rad(start));
    const y1 = c + r * Math.sin(rad(start));
    const x2 = c + r * Math.cos(rad(end));
    const y2 = c + r * Math.sin(rad(end));
    const large = end - start > 180 ? 1 : 0;
    return `M ${c} ${c} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${filled} of ${segments} segments filled`}
      className="shrink-0"
    >
      {Array.from({ length: segments }, (_, i) => (
        <path
          key={i}
          d={wedge(i)}
          className={
            i < filled
              ? done
                ? 'fill-danger/80'
                : 'fill-gold/80'
              : 'fill-transparent'
          }
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

function Clock({
  campaignId,
  clock,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  clock: ClockRow;
  isStaff: boolean;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [note, setNote] = useState(clock.dmNote ?? '');
  const [dirty, setDirty] = useState(false);
  const { confirm, dialog } = useConfirm();

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  return (
    <div className="flex gap-4 border-b border-line py-3 last:border-0">
      {dialog}

      <ClockFace
        segments={clock.segments}
        filled={clock.filled}
        done={clock.status === 'done'}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm text-ink">{clock.title || 'Untitled'}</span>
          <span className="font-display-alt text-[0.6rem] uppercase tracking-[0.14em] text-ink-subtle tabular-nums">
            {clock.filled}/{clock.segments}
          </span>
          {clock.status === 'done' && (
            <span className="text-xs text-danger">gone off</span>
          )}
          {isStaff && clock.visibility === 'shared' && (
            <span className="text-xs text-ink-subtle">the party sees this</span>
          )}
        </div>

        {isStaff && (
          <>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant="light"
                className="min-w-0 px-2 text-ink-muted"
                isDisabled={clock.filled >= clock.segments}
                onPress={() => act(tickClockAction(campaignId, clock.id, 1))}
              >
                tick
              </Button>
              <Button
                size="sm"
                variant="light"
                className="min-w-0 px-2 text-ink-subtle"
                isDisabled={clock.filled === 0}
                onPress={() => act(tickClockAction(campaignId, clock.id, -1))}
              >
                back
              </Button>
              <button
                type="button"
                onClick={() =>
                  act(
                    updateClockAction(campaignId, clock.id, {
                      visibility:
                        clock.visibility === 'shared' ? 'dm' : 'shared',
                    })
                  )
                }
                className="ml-1 text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-ink"
              >
                {clock.visibility === 'shared' ? 'hide it' : 'show them'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const yes = await confirm({
                    title: 'Stop this clock?',
                    body: 'It goes entirely, including where it had got to.',
                    confirmLabel: 'Stop it',
                    destructive: true,
                  });
                  if (!yes) return;
                  await act(deleteClockAction(campaignId, clock.id));
                }}
                className="text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle hover:text-danger"
              >
                stop
              </button>
            </div>

            <Textarea
              aria-label="What happens when it fills"
              size="sm"
              minRows={1}
              placeholder="What happens at the last segment…"
              className="mt-2"
              value={note}
              onValueChange={v => {
                setNote(v);
                setDirty(true);
              }}
              onBlur={() => {
                if (!dirty) return;
                setDirty(false);
                act(updateClockAction(campaignId, clock.id, { dmNote: note }));
              }}
              classNames={{ input: 'font-hand text-[1.1875rem] leading-snug' }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The things happening whether or not the party turns up.
 *
 * A DM keeps these on paper beside the app, which is why they stop getting
 * ticked around session four. The party can be shown a clock without being
 * shown what it means — watching the ritual reach five-eighths is the pressure;
 * knowing what happens at eight is the reveal, and they are not the same.
 */
export function ClocksPanel({
  campaignId,
  viewerRole,
}: {
  campaignId: string;
  viewerRole: CampaignRole;
}) {
  const isStaff = viewerRole === 'gm' || viewerRole === 'co-gm';

  const [clocks, setClocks] = useState<ClockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [segments, setSegments] = useState(6);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setClocks(await listClocksAction(campaignId));
    } catch {
      setError('Failed to read the clocks.');
    }
  }, [campaignId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!clocks) {
    return (
      <div className="flex justify-center py-10">
        <DiceSpinner label="Winding them up…" />
      </div>
    );
  }

  return (
    <SectionCard
      title="Clocks"
      description={
        isStaff
          ? 'What is happening anyway. Tick one when the party spends time elsewhere.'
          : 'What you can see coming.'
      }
    >
      {error && (
        <p className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {isStaff && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Input
            size="sm"
            label="A new clock"
            placeholder="The ritual at Duskwater"
            value={title}
            onValueChange={setTitle}
            className="min-w-40 flex-1"
          />
          <Select
            aria-label="Segments"
            size="sm"
            className="w-28"
            selectedKeys={[String(segments)]}
            onSelectionChange={keys => {
              const key = Array.from(keys)[0];
              if (key) setSegments(Number(key));
            }}
          >
            {CLOCK_SEGMENTS.map(s => (
              <SelectItem key={String(s)} textValue={`${s} segments`}>
                {s} segments
              </SelectItem>
            ))}
          </Select>
          <Button
            size="sm"
            color="primary"
            isDisabled={!title.trim()}
            onPress={async () => {
              const res = await createClockAction(campaignId, {
                title,
                segments,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setTitle('');
              await refresh();
            }}
          >
            Wind it
          </Button>
        </div>
      )}

      {clocks.length === 0 ? (
        <EmptyState
          scene={<HourglassScene />}
          title={isStaff ? 'Nothing is closing in' : 'Nothing you can see'}
          description={
            isStaff
              ? 'A clock is the part of your world that moves while the party is somewhere else. Wind one and tick it when they spend a day.'
              : 'If something is closing in, you will see it here before it arrives.'
          }
        />
      ) : (
        <div>
          {clocks.map(c => (
            <Clock
              key={c.id}
              campaignId={campaignId}
              clock={c}
              isStaff={isStaff}
              refresh={refresh}
              onError={setError}
            />
          ))}
        </div>
      )}

      {isStaff && clocks.length > 0 && (
        <Marginalia className="mt-3" dash>
          show them the face, never the note
        </Marginalia>
      )}
    </SectionCard>
  );
}
