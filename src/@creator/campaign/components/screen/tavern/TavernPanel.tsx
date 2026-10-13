'use client';

import { Button, Select, SelectItem, Switch } from '@heroui/react';
import { useMemo, useState } from 'react';

import { SUIT_LABEL } from '@/@creator/campaign/lib/crowns';
import {
  countFace,
  lowestFace,
  nextBid,
} from '@/@creator/campaign/lib/liars-dice';
import {
  CHEAT_LABEL,
  GAMING_SET_LABEL,
  TAVERN_KIND_LABEL,
  bidWords,
  type CrownsRules,
  type LiarsDiceRules,
  type SheetMove,
  type TavernSeatView,
  type TavernView,
} from '@/@creator/campaign/lib/tavern';
import { cpWords } from '@/@creator/character/lib/coins';
import { useDiceTray } from '@/@shared/components/dice';
import {
  EmptyState,
  Marginalia,
  StatusMark,
  StatusWord,
  TavernScene,
  statusEdge,
  useConfirm,
} from '@/@shared/components/ui';
import type { NotationRoll } from '@/@shared/lib/dice';
import type { LiveState } from '@/server/session';
import {
  answerSeatAction,
  cheatAction,
  endTavernGameAction,
  readSeatAction,
  startRoundAction,
  tavernMoveAction,
} from '../../../tavern-actions';
import { OpenTavernGame } from './OpenTavernGame';
import {
  CardBack,
  HiddenDie,
  PipDie,
  PlayingCard,
  RaisePicker,
  raiseSteps,
} from './pieces';

type Result = { ok: true } | { ok: false; error: string };

/** Who is acting from this screen right now: your hero, or an NPC the DM plays. */
interface Actor {
  seatId: string;
  /** The NPC seat the DM plays, passed to the server; null for your own hero. */
  as: string | null;
  holdCp: number;
  /** What the purse holds; Infinity for an NPC, whose coin is notional. */
  purseCp: number;
  insight: number;
  sleight: number;
  proficient: boolean;
  used: SheetMove[];
}

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * Tavern games, on the session screen.
 *
 * The panel draws whatever `LiveState.tavern` says — already filtered for the
 * reader on the server, so a cup here is a cup this viewer may see — and
 * sends moves. A player plays their own hero's seat; the DM opens the game,
 * starts each round, and plays every NPC seat from the same controls.
 */
export function TavernPanel({
  campaignId,
  state,
  isStaff,
  refresh,
  onError,
}: {
  campaignId: string;
  state: LiveState;
  isStaff: boolean;
  refresh: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const t = state.tavern;
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const run = async (p: Promise<Result>): Promise<boolean> => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return false;
    }
    await refresh();
    return true;
  };

  if (opening && isStaff) {
    return (
      <OpenTavernGame
        campaignId={campaignId}
        onError={onError}
        onCancel={() => setOpening(false)}
        onDone={async () => {
          setOpening(false);
          await refresh();
        }}
      />
    );
  }

  if (!t) {
    return (
      <EmptyState
        scene={<TavernScene />}
        title="No tavern game running"
        description="the cups are stacked and the dice are cold"
        action={
          isStaff ? (
            <Button size="sm" color="primary" onPress={() => setOpening(true)}>
              Open a tavern game
            </Button>
          ) : undefined
        }
      />
    );
  }

  const seatOf = (id: string | null | undefined) =>
    t.seats.find(s => s.id === id) ?? null;
  const turnSeat = seatOf(t.turn);
  const npc = isStaff ? t.npcs.find(n => n.seatId === t.turn) : undefined;
  const actor: Actor | null =
    t.you && t.turn === t.you.seatId
      ? { ...t.you, as: null }
      : npc
        ? {
            ...npc,
            as: npc.seatId,
            purseCp: Number.POSITIVE_INFINITY,
            proficient: false,
          }
        : null;
  // Off-sheet moves in liar's dice are not tied to your turn: a player may
  // read or palm whenever they are still in the round.
  const youInRound =
    t.you &&
    t.inRound &&
    t.you.status === 'seated' &&
    !seatOf(t.you.seatId)?.folded &&
    (t.liars?.cups[t.you.seatId] !== undefined ||
      t.crowns?.hands[t.you.seatId] !== undefined);

  const subtitle = [
    TAVERN_KIND_LABEL[t.kind],
    t.round > 0 ? `round ${t.round}` : 'not started',
    t.kind === 'liars-dice'
      ? (t.rules as LiarsDiceRules).onesWild
        ? 'ones are wild'
        : 'ones are only ones'
      : `to ${(t.rules as CrownsRules).target}`,
  ].join(' · ');

  const endGame = async () => {
    const ok = await confirm({
      title: `End ${t.name}?`,
      body: t.inRound
        ? 'A round is being played. Every hero gets back what they put in this round.'
        : 'The seats stand up and the game goes into the record.',
      confirmLabel: 'End the tavern game',
      destructive: true,
    });
    if (ok) await run(endTavernGameAction(t.id));
  };

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-semibold leading-tight">
            {t.name}
          </div>
          <div className="text-xs text-ink-muted">{subtitle}</div>
        </div>
        {(t.inRound || t.potCp > 0) && t.status !== 'ended' && (
          <div className="text-right">
            <div className="font-display text-xl font-semibold tabular-nums text-gold-strong">
              {cpWords(t.potCp)}
            </div>
            <div className="text-[0.7rem] text-ink-muted">in the pot</div>
          </div>
        )}
      </div>

      {t.you?.status === 'invited' && t.status !== 'ended' && (
        <Invitation t={t} busy={busy} run={run} />
      )}

      <SeatList t={t} isStaff={isStaff} />

      {t.kind === 'liars-dice' && t.liars && (
        <LiarsDice
          t={t}
          isStaff={isStaff}
          actor={actor}
          youInRound={Boolean(youInRound)}
          busy={busy}
          run={run}
        />
      )}
      {t.kind === 'crowns' && t.crowns && (
        <Crowns t={t} isStaff={isStaff} actor={actor} busy={busy} run={run} />
      )}

      {!actor && t.inRound && turnSeat && (
        <p className="text-xs text-ink-muted">Waiting on {turnSeat.name}.</p>
      )}

      {t.result && !t.inRound && (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
          {t.result.line}
        </div>
      )}

      {t.status === 'ended' ? (
        <Ended t={t} isStaff={isStaff} onOpen={() => setOpening(true)} />
      ) : (
        !t.inRound &&
        !isStaff &&
        t.you?.status === 'seated' && (
          <p className="text-xs text-ink-muted">
            Waiting on the DM to{' '}
            {t.round === 0
              ? 'start the first round'
              : 'shake the cups for the next round'}
            .
          </p>
        )
      )}

      {isStaff && t.status !== 'ended' && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            color="primary"
            isDisabled={busy || t.inRound}
            onPress={async () => {
              setBusy(true);
              const res = await startRoundAction(t.id);
              setBusy(false);
              if (!res.ok) onError(res.error);
              else {
                if (!res.data.started) onError(res.data.line);
                await refresh();
              }
            }}
          >
            {t.round === 0 ? 'Start the first round' : 'Next round'}
          </Button>
          <Button size="sm" variant="light" isDisabled={busy} onPress={endGame}>
            End the tavern game
          </Button>
        </div>
      )}

      <MoveLog t={t} />
    </div>
  );
}

/* --- being asked to sit --------------------------------------------------- */

function Invitation({
  t,
  busy,
  run,
}: {
  t: TavernView;
  busy: boolean;
  run: (p: Promise<Result>) => Promise<boolean>;
}) {
  const you = t.you!;
  const name = t.seats.find(s => s.id === you.seatId)?.name;
  const others = t.seats.filter(
    s => s.id !== you.seatId && s.status !== 'declined'
  );
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg p-3 ${statusEdge('waiting')}`}
    >
      <div className="flex items-center gap-2">
        <StatusMark kind="waiting" />
        <span className="text-xs text-ink-muted">
          The DM asks {name} to sit
        </span>
        <StatusWord kind="waiting" className="ml-auto" />
      </div>
      {t.blurb && <p className="text-sm">{t.blurb}</p>}
      <p className="text-sm">
        {TAVERN_KIND_LABEL[t.kind]} with {others.map(s => s.name).join(', ')}.
      </p>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-ink-muted">
        {t.lines.map(l => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">
        It comes out of your purse: you have{' '}
        <strong className="tabular-nums text-ink">
          {cpWords(you.purseCp)}
        </strong>
        . {GAMING_SET_LABEL[t.kind]}:{' '}
        {you.proficient ? 'proficient' : 'not proficient'} · Insight{' '}
        {fmt(you.insight)} · Sleight of Hand {fmt(you.sleight)}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          color="primary"
          isDisabled={busy}
          onPress={() => run(answerSeatAction(t.id, true))}
        >
          Sit down
        </Button>
        <Button
          size="sm"
          variant="light"
          isDisabled={busy}
          onPress={() => run(answerSeatAction(t.id, false))}
        >
          Not this time
        </Button>
      </div>
    </div>
  );
}

/* --- the seats ------------------------------------------------------------ */

function seatNote(s: TavernSeatView, t: TavernView): string {
  if (s.status === 'invited') return 'asked';
  if (s.status === 'declined') return 'won’t play';
  if (s.status === 'out') return 'out';
  if (s.folded) return 'folded';
  if (t.turn === s.id) return 'to act';
  if (t.liars?.bid?.by === s.id)
    return `bid ${bidWords(t.liars.bid.count, t.liars.bid.face)}`;
  return '';
}

function SeatList({ t, isStaff }: { t: TavernView; isStaff: boolean }) {
  const seats = t.seats.filter(s => s.status !== 'declined');
  return (
    <ul className="flex flex-col">
      {seats.map(s => {
        const waiting = t.turn === s.id && (s.yours || (isStaff && s.npc));
        return (
          <li
            key={s.id}
            className={`flex items-center gap-2 border-b border-line px-2 py-1.5 text-sm ${
              s.yours ? statusEdge('yours') : ''
            } ${waiting ? statusEdge('waiting') : ''}`}
          >
            <span
              className={`min-w-0 flex-1 truncate ${s.yours ? 'font-semibold' : ''} ${
                s.status === 'out' || s.folded ? 'text-ink-muted' : ''
              }`}
            >
              {s.name}
            </span>
            {s.yours && <StatusWord kind="yours" />}
            {waiting && <StatusWord kind="waiting" />}
            {isStaff && s.attitude && (
              <span
                className={`rounded-full border px-1.5 text-[0.65rem] ${
                  s.attitude === 'hostile'
                    ? 'border-danger text-danger'
                    : 'border-line text-ink-muted'
                }`}
              >
                {s.attitude}
              </span>
            )}
            {isStaff && s.npc && (
              <span className="text-[0.65rem] text-ink-subtle">
                {s.statBlock ?? 'no stat block'}
              </span>
            )}
            {isStaff && !s.npc && s.passives && (
              <span className="text-[0.65rem] tabular-nums text-ink-subtle">
                PP {s.passives.perception} · Ins {s.passives.insight}
              </span>
            )}
            <span className="text-xs text-ink-muted">{seatNote(s, t)}</span>
            {s.dice !== null && (
              <span className="w-12 text-right text-xs tabular-nums text-ink-muted">
                {s.dice} {s.dice === 1 ? 'die' : 'dice'}
              </span>
            )}
            {t.inRound && (
              <span className="w-12 text-right text-xs tabular-nums">
                {s.inCp > 0 ? cpWords(s.inCp) : ''}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* --- off the sheet -------------------------------------------------------- */

function OffSheet({
  t,
  actor,
  busy,
  onRead,
  cheat,
}: {
  t: TavernView;
  actor: Actor;
  busy: boolean;
  onRead: (target: string) => void;
  cheat: React.ReactNode;
}) {
  const targets = t.seats.filter(
    s =>
      s.id !== actor.seatId &&
      s.status === 'seated' &&
      !s.folded &&
      (t.liars
        ? t.liars.cups[s.id] !== undefined
        : t.crowns?.hands[s.id] !== undefined)
  );
  const lastBidder =
    t.liars?.bid && t.liars.bid.by !== actor.seatId ? t.liars.bid.by : null;
  const [target, setTarget] = useState<string>(
    lastBidder ?? targets[0]?.id ?? ''
  );
  const readDone = actor.used.includes('read');
  const needsBid = t.kind === 'liars-dice' && !t.liars?.bid;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-semibold">
          Off {actor.as ? 'the stat block' : 'your sheet'}
        </span>
        <span className="text-xs text-ink-muted">
          once a round each
          {actor.as
            ? ''
            : ` · ${GAMING_SET_LABEL[t.kind]}: ${actor.proficient ? 'proficient, so advantage' : 'not proficient'}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          size="sm"
          aria-label="Who to read"
          className="w-36"
          selectedKeys={target ? [target] : []}
          onSelectionChange={k => setTarget(String(Array.from(k)[0] ?? ''))}
          isDisabled={readDone || targets.length === 0}
        >
          {targets.map(s => (
            <SelectItem key={s.id}>{s.name}</SelectItem>
          ))}
        </Select>
        <Button
          size="sm"
          variant="bordered"
          isDisabled={busy || readDone || !target || needsBid}
          onPress={() => onRead(target)}
        >
          {readDone
            ? 'Read this round'
            : `Read · Insight ${fmt(actor.insight)}`}
        </Button>
      </div>
      {needsBid && !readDone && (
        <p className="text-[0.7rem] text-ink-subtle">
          A read needs a bid to read against.
        </p>
      )}
      {cheat}
    </div>
  );
}

/** Reads and cheats go through the tray: the server rolled them, you caused them. */
function useSheetMoves(
  t: TavernView,
  run: (p: Promise<Result>) => Promise<boolean>
) {
  const tray = useDiceTray();
  const show = async (
    p: Promise<
      | { ok: true; data: { roll: NotationRoll; line: string } }
      | { ok: false; error: string }
    >,
    title: string
  ) => {
    let line: string | null = null;
    let roll: NotationRoll | null = null;
    const ok = await run(
      p.then(r => {
        if (r.ok) {
          line = r.data.line;
          roll = r.data.roll;
          return { ok: true as const };
        }
        return r;
      })
    );
    if (ok && roll) {
      await tray.showNotationRoll(roll, { title, hint: line ?? undefined });
    }
  };
  return {
    read: (actor: Actor, target: string) =>
      show(readSeatAction(t.id, target, actor.as), 'Insight'),
    cheat: (actor: Actor, input: { dieIndex?: number; face?: number }) =>
      show(cheatAction(t.id, input, actor.as), 'Sleight of Hand'),
  };
}

/* --- liar's dice ---------------------------------------------------------- */

function LiarsDice({
  t,
  isStaff,
  actor,
  youInRound,
  busy,
  run,
}: {
  t: TavernView;
  isStaff: boolean;
  actor: Actor | null;
  youInRound: boolean;
  busy: boolean;
  run: (p: Promise<Result>) => Promise<boolean>;
}) {
  const liars = t.liars!;
  const rules = t.rules as LiarsDiceRules;
  const [showHeroes, setShowHeroes] = useState(false);
  const moves = useSheetMoves(t, run);
  const bid = liars.bid;
  const lifted = !t.inRound && t.result !== null;
  const myCup = t.you ? liars.cups[t.you.seatId] : null;

  const isHit = (v: number) =>
    bid !== null &&
    (v === bid.face || (rules.onesWild && v === 1 && bid.face !== 1));
  const toneOf = (v: number) =>
    bid && isHit(v) ? 'hit' : rules.onesWild && v === 1 ? 'wild' : null;

  // You may palm a die whenever you are still in the round.
  const youActor: Actor | null =
    youInRound && t.you ? { ...t.you, as: null } : null;

  return (
    <div className="flex flex-col gap-3">
      {bid && (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-muted">
              {bid.by === t.you?.seatId
                ? 'You'
                : t.seats.find(s => s.id === bid.by)?.name}{' '}
              bid
            </div>
            <div className="font-display text-2xl font-semibold leading-tight">
              {bidWords(bid.count, bid.face)}
            </div>
          </div>
          <div className="text-right text-xs text-ink-muted">
            <div>
              stake{' '}
              <strong className="tabular-nums text-ink">
                {cpWords(t.stakeCp)}
              </strong>
            </div>
            <div>{liars.diceOut} dice out</div>
          </div>
        </div>
      )}

      {myCup && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold">Your cup</span>
            <span className="text-xs text-ink-muted">
              {lifted ? '' : 'only you see it'}
              {bid
                ? `${lifted ? '' : ' · '}${countFace([myCup], bid.face, rules.onesWild)} of the bid’s ${bid.face}s${rules.onesWild ? ', wild ones counted' : ''}`
                : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {myCup.map((v, i) => (
              <PipDie key={i} value={v} size={40} tone={toneOf(v)} />
            ))}
          </div>
        </div>
      )}

      {(lifted || isStaff) && (
        <div className="flex flex-col gap-1.5">
          {isStaff && !lifted && (
            <Switch
              size="sm"
              isSelected={showHeroes}
              onValueChange={setShowHeroes}
            >
              <span className="text-xs text-ink-muted">
                Show me the heroes’ cups
              </span>
            </Switch>
          )}
          {t.seats
            .filter(s => liars.cups[s.id] && s.id !== t.you?.seatId)
            .filter(s => lifted || s.npc || showHeroes)
            .map(s => (
              <div key={s.id} className="flex items-center gap-2">
                <span className="w-28 truncate text-xs">{s.name}</span>
                <div className="flex gap-1">
                  {liars.cups[s.id]!.map((v, i) => (
                    <PipDie key={i} value={v} size={24} tone={toneOf(v)} />
                  ))}
                </div>
                {!lifted && <StatusWord kind="hidden" className="ml-auto" />}
              </div>
            ))}
          {!lifted &&
            !isStaff &&
            t.seats
              .filter(s => liars.cups[s.id] === null)
              .map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-28 truncate text-xs text-ink-muted">
                    {s.name}
                  </span>
                  <div className="flex gap-1">
                    {Array.from({ length: s.dice ?? 0 }, (_, i) => (
                      <HiddenDie key={i} />
                    ))}
                  </div>
                </div>
              ))}
        </div>
      )}

      {actor && t.inRound && (
        <BidBox t={t} actor={actor} busy={busy} run={run} moves={moves} />
      )}
      {!actor && youActor && (
        <OffSheet
          t={t}
          actor={youActor}
          busy={busy}
          onRead={target => moves.read(youActor, target)}
          cheat={
            <PalmDie
              actor={youActor}
              cup={myCup ?? []}
              busy={busy}
              onPalm={i => moves.cheat(youActor, i)}
            />
          }
        />
      )}
    </div>
  );
}

function PalmDie({
  actor,
  cup,
  busy,
  onPalm,
}: {
  actor: Actor;
  cup: number[];
  busy: boolean;
  onPalm: (input: { dieIndex: number; face: number }) => void;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [face, setFace] = useState(6);
  const done = actor.used.includes('cheat');
  if (done) {
    return (
      <p className="text-xs text-ink-muted">
        You have tried your hands this round.
      </p>
    );
  }
  if (index === null) {
    return (
      <Button
        size="sm"
        variant="bordered"
        className="self-start"
        isDisabled={busy || cup.length === 0}
        onPress={() => setIndex(0)}
      >
        {CHEAT_LABEL['liars-dice']} · Sleight of Hand {fmt(actor.sleight)}
      </Button>
    );
  }
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg p-2.5 ${statusEdge('hidden')}`}
    >
      <div className="flex items-center gap-2">
        <StatusMark kind="hidden" />
        <span className="text-xs">
          Pick a die, and the face it should show.
        </span>
        <StatusWord kind="hidden" className="ml-auto" />
      </div>
      <div className="flex gap-1.5">
        {cup.map((v, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Your ${v}`}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            <PipDie value={v} size={30} tone={i === index ? 'chosen' : null} />
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5, 6].map(f => (
          <button
            key={f}
            type="button"
            aria-label={`Make it a ${f}`}
            aria-pressed={f === face}
            onClick={() => setFace(f)}
          >
            <PipDie value={f} size={24} tone={f === face ? 'chosen' : null} />
          </button>
        ))}
      </div>
      <p className="text-[0.7rem] text-ink-muted">
        Against the sharpest eye still in the round. Only you and the DM see
        this roll.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          color="primary"
          isDisabled={busy}
          onPress={() => onPalm({ dieIndex: index, face })}
        >
          Palm it
        </Button>
        <Button size="sm" variant="light" onPress={() => setIndex(null)}>
          Not now
        </Button>
      </div>
    </div>
  );
}

function BidBox({
  t,
  actor,
  busy,
  run,
  moves,
}: {
  t: TavernView;
  actor: Actor;
  busy: boolean;
  run: (p: Promise<Result>) => Promise<boolean>;
  moves: ReturnType<typeof useSheetMoves>;
}) {
  const liars = t.liars!;
  const rules = t.rules as LiarsDiceRules;
  const start = nextBid(liars.bid, rules);
  const [count, setCount] = useState(start.count);
  const [face, setFace] = useState(start.face);
  const [raise, setRaise] = useState(0);
  const key = `${liars.bid?.count}-${liars.bid?.face}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    // A new bid landed while this box was open: start from the next one up.
    setSeen(key);
    setCount(start.count);
    setFace(start.face);
    setRaise(0);
  }
  const beats =
    !liars.bid ||
    count > liars.bid.count ||
    (count === liars.bid.count && face > liars.bid.face);
  const legal = beats && count >= 1 && count <= liars.diceOut;
  const steps = raiseSteps(rules.raiseCapCp, rules.anteCp);
  const afford = actor.purseCp - actor.holdCp;
  const canHold = actor.holdCp <= actor.purseCp;
  const as = actor.as;
  const who = as ? t.seats.find(s => s.id === as)?.name : null;
  const cup = t.liars?.cups[actor.seatId] ?? [];

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg p-3 ${statusEdge('waiting')}`}
    >
      <div className="flex items-center gap-2">
        <StatusMark kind="waiting" />
        <span className="text-sm font-semibold">
          {who ? `${who} to act` : 'Your turn'}
        </span>
        <StatusWord kind="waiting" className="ml-auto" />
      </div>
      {actor.holdCp > 0 && (
        <p className="text-xs text-ink-muted">
          The stake is {cpWords(t.stakeCp)}. Bidding or calling holds:{' '}
          <strong className="text-ink">{cpWords(actor.holdCp)}</strong> more
          {Number.isFinite(actor.purseCp)
            ? ` (you have ${cpWords(actor.purseCp)})`
            : ''}
          .
        </p>
      )}
      <div className="flex items-center gap-2">
        <span className="w-12 text-xs text-ink-muted">Count</span>
        <Button
          size="sm"
          variant="bordered"
          className="min-w-8 px-0"
          aria-label="One fewer"
          onPress={() => setCount(c => Math.max(1, c - 1))}
        >
          −
        </Button>
        <span className="w-8 text-center font-display text-xl font-semibold tabular-nums">
          {count}
        </span>
        <Button
          size="sm"
          variant="bordered"
          className="min-w-8 px-0"
          aria-label="One more"
          onPress={() => setCount(c => Math.min(liars.diceOut, c + 1))}
        >
          +
        </Button>
        <span className="text-xs text-ink-muted">
          of {liars.diceOut} dice out
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-xs text-ink-muted">Face</span>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6]
            .filter(f => f >= lowestFace(rules))
            .map(f => (
              <button
                key={f}
                type="button"
                aria-label={`Bid on ${f}s`}
                aria-pressed={f === face}
                onClick={() => setFace(f)}
                className={`flex h-9 w-9 items-center justify-center rounded-md ${
                  f === face
                    ? 'border-2 border-gold bg-surface-2'
                    : 'border border-line'
                }`}
              >
                <PipDie value={f} size={22} />
              </button>
            ))}
        </div>
      </div>
      <RaisePicker
        steps={steps}
        value={raise}
        onChange={setRaise}
        affordCp={afford}
      />
      {!legal && (
        <p className="text-xs text-danger">
          A bid must beat{' '}
          {liars.bid ? bidWords(liars.bid.count, liars.bid.face) : 'nothing'}:
          more dice, or as many of a higher face.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          color="primary"
          isDisabled={busy || !legal || !canHold || raise > afford}
          onPress={() =>
            run(
              tavernMoveAction(
                t.id,
                { kind: 'bid', count, face, raiseCp: raise },
                as
              )
            )
          }
        >
          Bid {bidWords(count, face)}
        </Button>
        {liars.bid && liars.bid.by !== actor.seatId && (
          <Button
            size="sm"
            variant="bordered"
            className="border-gold text-gold-strong"
            isDisabled={busy || !canHold}
            onPress={() => run(tavernMoveAction(t.id, { kind: 'call' }, as))}
          >
            Liar!
          </Button>
        )}
        {rules.spotOn && liars.bid && liars.bid.by !== actor.seatId && (
          <Button
            size="sm"
            variant="bordered"
            isDisabled={busy || !canHold}
            onPress={() => run(tavernMoveAction(t.id, { kind: 'spot-on' }, as))}
          >
            Spot on
          </Button>
        )}
        <Button
          size="sm"
          variant="light"
          isDisabled={busy}
          onPress={() => run(tavernMoveAction(t.id, { kind: 'fold' }, as))}
        >
          Fold
        </Button>
      </div>
      {!canHold && (
        <p className="text-xs text-ink-muted">
          Your purse cannot cover the hold. Fold, or wait for the DM.
        </p>
      )}
      <OffSheet
        t={t}
        actor={actor}
        busy={busy}
        onRead={target => moves.read(actor, target)}
        cheat={
          <PalmDie
            actor={actor}
            cup={cup}
            busy={busy}
            onPalm={i => moves.cheat(actor, i)}
          />
        }
      />
    </div>
  );
}

/* --- Crowns --------------------------------------------------------------- */

function Crowns({
  t,
  isStaff,
  actor,
  busy,
  run,
}: {
  t: TavernView;
  isStaff: boolean;
  actor: Actor | null;
  busy: boolean;
  run: (p: Promise<Result>) => Promise<boolean>;
}) {
  const crowns = t.crowns!;
  const rules = t.rules as CrownsRules;
  const [showHeroes, setShowHeroes] = useState(false);
  const moves = useSheetMoves(t, run);
  const [raise, setRaise] = useState(0);
  const shown = !t.inRound && t.result !== null;
  const mine = t.you ? crowns.hands[t.you.seatId] : null;
  const crowned = (suit: string) => suit === crowns.crown.suit;
  const phaseWord = {
    bet1: 'first betting',
    draw: 'the draw',
    bet2: 'second betting',
    show: 'the show',
  }[crowns.phase];

  const others = useMemo(
    () =>
      t.seats.filter(
        s => crowns.hands[s.id] !== undefined && s.id !== t.you?.seatId
      ),
    [t.seats, crowns.hands, t.you?.seatId]
  );
  const actorHand = actor ? (crowns.hands[actor.seatId] ?? []) : [];
  const steps = raiseSteps(rules.raiseCapCp, rules.anteCp);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
        <PlayingCard
          card={crowns.crown}
          crowned
          multiplier={rules.crownMultiplier}
        />
        <div>
          <div className="text-xs text-ink-muted">The crown · {phaseWord}</div>
          <div className="font-display text-xl font-semibold">
            {SUIT_LABEL[crowns.crown.suit]} are crowned
          </div>
          <div className="text-xs text-ink-muted">
            they count {rules.crownMultiplier === 3 ? 'three times' : 'double'}{' '}
            this round
          </div>
        </div>
      </div>

      {mine && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">Your hand</span>
            {!shown && (
              <span className="text-xs text-ink-muted">only you see it</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mine.map((c, i) => (
              <PlayingCard
                key={i}
                card={c}
                crowned={crowned(c.suit)}
                multiplier={rules.crownMultiplier}
              />
            ))}
            <div className="ml-1">
              <div
                className={`font-display text-2xl font-semibold tabular-nums ${
                  (crowns.totals?.[t.you!.seatId] ?? 0) > rules.target
                    ? 'text-danger'
                    : ''
                }`}
              >
                {crowns.totals?.[t.you!.seatId] ?? 0}
              </div>
              <div className="text-xs text-ink-muted">
                {(crowns.totals?.[t.you!.seatId] ?? 0) > rules.target
                  ? 'bust'
                  : `of ${rules.target}`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {isStaff && !shown && (
          <Switch
            size="sm"
            isSelected={showHeroes}
            onValueChange={setShowHeroes}
          >
            <span className="text-xs text-ink-muted">
              Show me the heroes’ hands
            </span>
          </Switch>
        )}
        {others.map(s => {
          const hand = crowns.hands[s.id];
          const open = hand && (shown || s.npc || showHeroes);
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className={`w-24 truncate text-xs ${s.folded ? 'text-ink-muted' : ''}`}
              >
                {s.name}
              </span>
              <div className="flex gap-1">
                {open
                  ? hand!.map((c, i) => (
                      <PlayingCard
                        key={i}
                        card={c}
                        small
                        crowned={crowned(c.suit)}
                        multiplier={rules.crownMultiplier}
                      />
                    ))
                  : Array.from({ length: s.cards ?? 0 }, (_, i) => (
                      <CardBack key={i} />
                    ))}
              </div>
              {open && crowns.totals?.[s.id] !== undefined && (
                <span className="ml-auto text-sm font-semibold tabular-nums">
                  {crowns.totals[s.id]}
                </span>
              )}
              {open && !shown && <StatusWord kind="hidden" />}
            </div>
          );
        })}
      </div>

      {actor && t.inRound && (
        <div
          className={`flex flex-col gap-3 rounded-lg p-3 ${statusEdge('waiting')}`}
        >
          <div className="flex items-center gap-2">
            <StatusMark kind="waiting" />
            <span className="text-sm font-semibold">
              {actor.as
                ? `${t.seats.find(s => s.id === actor.as)?.name} to act`
                : 'Your turn'}
              {crowns.phase === 'draw' ? ' to draw' : ''}
            </span>
            <StatusWord kind="waiting" className="ml-auto" />
          </div>
          {crowns.phase === 'draw' ? (
            <>
              <p className="text-xs text-ink-muted">
                {actorHand.length} cards · {crowns.draws[actor.seatId] ?? 0} of{' '}
                {rules.maxDraws} draws taken
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={busy}
                  onPress={() =>
                    run(tavernMoveAction(t.id, { kind: 'draw' }, actor.as))
                  }
                >
                  Draw a card
                </Button>
                <Button
                  size="sm"
                  variant="bordered"
                  isDisabled={busy}
                  onPress={() =>
                    run(tavernMoveAction(t.id, { kind: 'stand' }, actor.as))
                  }
                >
                  Stand
                  {crowns.totals?.[actor.seatId] !== undefined
                    ? ` at ${crowns.totals[actor.seatId]}`
                    : ''}
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  isDisabled={busy}
                  onPress={() =>
                    run(tavernMoveAction(t.id, { kind: 'fold' }, actor.as))
                  }
                >
                  Fold
                </Button>
              </div>
            </>
          ) : (
            <>
              {actor.holdCp > 0 && (
                <p className="text-xs text-ink-muted">
                  The stake is {cpWords(t.stakeCp)}. Staying in holds{' '}
                  <strong className="text-ink">{cpWords(actor.holdCp)}</strong>{' '}
                  more.
                </p>
              )}
              <RaisePicker
                steps={steps}
                value={raise}
                onChange={setRaise}
                affordCp={actor.purseCp - actor.holdCp}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  color="primary"
                  isDisabled={busy || actor.holdCp + raise > actor.purseCp}
                  onPress={async () => {
                    if (
                      await run(
                        tavernMoveAction(
                          t.id,
                          { kind: 'bet', raiseCp: raise },
                          actor.as
                        )
                      )
                    )
                      setRaise(0);
                  }}
                >
                  {raise > 0
                    ? `Raise ${cpWords(raise)}`
                    : actor.holdCp > 0
                      ? 'Hold'
                      : 'Stay in'}
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  isDisabled={busy}
                  onPress={() =>
                    run(tavernMoveAction(t.id, { kind: 'fold' }, actor.as))
                  }
                >
                  Fold
                </Button>
              </div>
            </>
          )}
          <OffSheet
            t={t}
            actor={actor}
            busy={busy}
            onRead={target => moves.read(actor, target)}
            cheat={
              crowns.phase === 'draw' && !actor.used.includes('cheat') ? (
                <Button
                  size="sm"
                  variant="bordered"
                  className="self-start"
                  isDisabled={busy}
                  onPress={() => moves.cheat(actor, {})}
                >
                  {CHEAT_LABEL.crowns} · Sleight of Hand {fmt(actor.sleight)}
                </Button>
              ) : null
            }
          />
        </div>
      )}
    </div>
  );
}

/* --- the end, and the log ------------------------------------------------- */

function Ended({
  t,
  isStaff,
  onOpen,
}: {
  t: TavernView;
  isStaff: boolean;
  onOpen: () => void;
}) {
  const played = t.seats.filter(
    s => s.status !== 'declined' && s.status !== 'invited'
  );
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{t.name} is over.</p>
      <ul className="flex flex-col gap-0.5 text-sm">
        {played.map(s => (
          <li key={s.id} className="flex">
            <span className="flex-1">{s.name}</span>
            <span
              className={`tabular-nums ${s.netCp > 0 ? 'text-success' : s.netCp < 0 ? 'text-danger' : 'text-ink-muted'}`}
            >
              {s.netCp > 0 ? '+' : s.netCp < 0 ? '−' : ''}
              {cpWords(Math.abs(s.netCp))}
            </span>
          </li>
        ))}
      </ul>
      <Marginalia>
        the chairs scrape back. somebody owes somebody a drink.
      </Marginalia>
      {isStaff && (
        <Button
          size="sm"
          color="primary"
          className="self-start"
          onPress={onOpen}
        >
          Open a tavern game
        </Button>
      )}
    </div>
  );
}

function MoveLog({ t }: { t: TavernView }) {
  if (t.log.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        At the game
      </span>
      {t.log.map(l =>
        l.hidden ? (
          <div
            key={l.id}
            className={`flex items-start gap-2 rounded px-2 py-1 text-xs ${statusEdge('hidden')}`}
          >
            <span className="flex-1">{l.line}</span>
            <StatusWord kind="hidden" />
          </div>
        ) : (
          <p key={l.id} className="text-xs">
            {l.line}
          </p>
        )
      )}
    </div>
  );
}

/**
 * The panel's badge: one when the game is waiting on this reader — their
 * turn, their invitation, or (for the DM) an NPC's turn.
 */
export function tavernWaiting(t: TavernView | null, isStaff: boolean): number {
  if (!t || t.status === 'ended') return 0;
  if (t.you?.status === 'invited') return 1;
  if (t.turn && t.you?.seatId === t.turn) return 1;
  if (isStaff && t.turn && t.npcs.some(n => n.seatId === t.turn)) return 1;
  return 0;
}
