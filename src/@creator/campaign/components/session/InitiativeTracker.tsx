'use client';

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { groupFromNotation, useDiceTray } from '@/@shared/components/dice';
import { motion } from '@/@shared/components/motion';
import {
  BattlefieldScene,
  EmptyState,
  Marginalia,
  SectionCard,
  statusEdge,
  StatusMark,
  StatusWord,
} from '@/@shared/components/ui';
import { formatChallenge } from '@/@shared/content';
import type { CombatantChoice } from '@/server/content';
import type { EntryRow, EntrySide, LiveState } from '@/server/session';
import { listCombatantChoicesAction } from '../../content-actions';
import {
  addCreaturesAction,
  addEntryAction,
  addPartyAction,
  advanceTurnAction,
  applyHpAction,
  endEncounterAction,
  removeEntryAction,
  rollInitiativeAction,
  updateEntryAction,
} from '../../actions';
import { setPlacement, usePlacement } from '@/@shared/battlemap/placement';
import type { EffectRow } from '@/@creator/campaign/lib/effects';
import { CountdownRows, EffectChips } from './EffectChips';
import { spellNameFromKey } from '@/@creator/campaign/lib/casting';
import { dropConcentrationAction } from '../../casting-actions';
import { ShapePicker } from './ShapePicker';
import {
  CountdownControl,
  EffectPicker,
  type PickerEntry,
} from './EffectPicker';
import { FightRules } from './FightRules';
import { GroupControl, LegendaryControls } from './LegendaryControls';
import { TurnStrip } from './TurnStrip';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/**
 * Drop a monster in with the numbers it already has.
 *
 * The stats are on the stat block the app is already holding, so a DM adding
 * three goblins should not be retyping AC 15 and 7 hit points three times.
 * Initiative is rolled on the server, once per copy — three goblins sharing
 * one initiative are one goblin with three health bars.
 *
 * The list is the SRD bestiary plus this table's own library, so a homebrew
 * monster the DM approved drops in exactly like a published one.
 */
function BestiaryPicker({
  campaignId,
  encounterId,
  act,
}: {
  campaignId: string;
  encounterId: string;
  act: Act;
}) {
  const [choices, setChoices] = useState<CombatantChoice[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  // Roll as a group (11): on for six of a thing, off for one, unless said.
  const [group, setGroup] = useState<boolean | null>(null);
  const grouped = group ?? copies > 1;

  const load = useCallback(async () => {
    setChoices(
      await listCombatantChoicesAction(campaignId).catch(
        () => [] as CombatantChoice[]
      )
    );
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  // Nothing synced yet is a real state on a fresh database: `npm run db:sync`
  // fills the bestiary, and until it does this control would be an empty box
  // with no explanation.
  if (choices !== null && choices.length === 0) return null;

  const chosen = choices?.find(c => c.key === picked) ?? null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Autocomplete
        size="sm"
        label="From the bestiary"
        placeholder={choices ? 'Goblin' : 'Reading the bestiary…'}
        isDisabled={!choices}
        className="min-w-52 flex-1"
        defaultItems={choices ?? []}
        selectedKey={picked}
        onSelectionChange={key => setPicked(key ? String(key) : null)}
      >
        {choice => (
          <AutocompleteItem key={choice.key} textValue={choice.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span>{choice.name}</span>
              <span className="text-xs text-ink-subtle">
                CR {formatChallenge(choice.challengeRating)} · AC{' '}
                {choice.armorClass} · {choice.hitPoints} HP
              </span>
            </div>
          </AutocompleteItem>
        )}
      </Autocomplete>
      <NumberInput
        size="sm"
        label="How many"
        minValue={1}
        maxValue={20}
        className="w-24"
        value={copies}
        onValueChange={v => setCopies(Number(v) || 1)}
      />
      {copies > 1 && (
        <Tooltip
          content={
            grouped
              ? 'One initiative, one turn for the lot. Tap to roll each on its own.'
              : 'Each rolls and acts on its own. Tap to roll them as a group.'
          }
        >
          <Button
            size="sm"
            variant={grouped ? 'flat' : 'light'}
            className={`min-w-0 px-2 text-xs ${
              grouped ? 'text-arcane' : 'text-ink-subtle'
            }`}
            onPress={() => setGroup(!grouped)}
          >
            {grouped ? 'As a group' : 'Each alone'}
          </Button>
        </Tooltip>
      )}
      <Button
        size="sm"
        variant="flat"
        isDisabled={!chosen}
        onPress={() => {
          if (!chosen) return;
          act(addCreaturesAction(encounterId, chosen.ref, copies, grouped));
          setPicked(null);
          setCopies(1);
          setGroup(null);
        }}
      >
        Send them in
      </Button>
    </div>
  );
}

/** What a player is told about a foe's health, since they get no numbers. */
function hpWord(cur: number | null, max: number | null): string {
  if (cur == null || max == null || max <= 0) return '—';
  if (cur <= 0) return 'Down';
  const pct = cur / max;
  if (pct <= 0.25) return 'Barely standing';
  if (pct <= 0.5) return 'Bloodied';
  return 'Healthy';
}

function hpColor(cur: number, max: number): string {
  if (max <= 0) return 'var(--ink-subtle)';
  const ratio = cur / max;
  if (ratio > 0.5) return 'var(--success)';
  if (ratio > 0.25) return 'var(--warning)';
  return 'var(--danger)';
}

const SIDE_LABEL: Record<EntrySide, string> = {
  party: 'Party',
  foe: 'Foe',
  other: 'Bystander',
};

/* --- the HP control (staff) ------------------------------------------ */

/**
 * Damage and healing, not "type the new number".
 *
 * A DM says "seven damage", so the box takes seven and the arithmetic —
 * temp HP first, never below zero, healing capped at max — happens on the
 * server where the rules live.
 */
function HpControl({ entry, act }: { entry: EntryRow; act: Act }) {
  const [amount, setAmount] = useState<number>(0);

  if (entry.hpCurrent == null || entry.hpMax == null) {
    return <span className="text-xs text-ink-subtle">no hp</span>;
  }

  const apply = (sign: 1 | -1) => {
    if (!amount) return;
    act(applyHpAction(entry.id, sign * Math.abs(amount)));
    setAmount(0);
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="flat"
        aria-label={`Damage ${entry.label}`}
        className="min-w-0 px-2 text-danger"
        onPress={() => apply(-1)}
      >
        −
      </Button>
      <NumberInput
        aria-label={`Amount for ${entry.label}`}
        size="sm"
        hideStepper
        minValue={0}
        className="w-16"
        value={amount}
        onValueChange={v => setAmount(Number(v) || 0)}
      />
      <Button
        size="sm"
        variant="flat"
        aria-label={`Heal ${entry.label}`}
        className="min-w-0 px-2 text-success"
        onPress={() => apply(1)}
      >
        +
      </Button>
    </div>
  );
}

/* --- one combatant ---------------------------------------------------- */

function EntryLine({
  entry,
  current,
  isStaff,
  isYours,
  act,
  placeable,
  placing,
  onPlace,
  effects,
  everyone,
  encounterId,
  campaignId,
  refresh,
  onError,
  waiting,
  groupKin = [],
}: {
  campaignId: string;
  entry: EntryRow;
  current: boolean;
  /** Everybody in the order with their group, for the group control (11). */
  groupKin?: { id: string; label: string; groupId: string | null }[];
  isStaff: boolean;
  isYours: boolean;
  act: Act;
  refresh: () => Promise<void> | void;
  onError: (message: string) => void;
  /** Every clock in the fight; the chips pick out this entry's. */
  effects: EffectRow[];
  /** Everybody in the order, for the picker's source list. */
  everyone: PickerEntry[];
  encounterId: string;
  /** A board is up and this combatant is not on it yet. */
  placeable: boolean;
  /** The board is waiting for a tap for this one. */
  placing: boolean;
  onPlace: () => void;
  /** Asks put to this combatant that nobody has answered yet. */
  waiting: number;
}) {
  const showNumbers = isStaff || entry.side === 'party';
  const hp = entry.hpCurrent;
  const max = entry.hpMax;
  const homebrew = entry.creatureRef?.source === 'homebrew';

  /*
   * The row says its state in the status language (rule 9), and the states
   * use different channels — the left edge for yours, the frame and ground
   * for waiting, the mark for homebrew — so two can stack on one row
   * without either being lost. The turn is the fourth channel: the gold
   * ring, which is not a state of the combatant but of the round.
   */
  const edge =
    waiting > 0 ? statusEdge('waiting') : isYours ? statusEdge('yours') : '';

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-transparent px-2 py-2.5 ${edge} ${
        current ? 'bg-surface-2 ring-1 ring-gold/40' : ''
      }`}
    >
      <span
        className={`w-8 shrink-0 text-center font-display text-lg tabular-nums ${
          waiting > 0 ? 'text-danger' : 'text-ink'
        }`}
      >
        {entry.initiative}
      </span>
      {homebrew && <StatusMark kind="homebrew" size={8} />}
      {entry.groupId && (
        <Tooltip content="Acts with its group, on one turn.">
          <span className="text-[0.55rem] uppercase tracking-[0.1em] text-arcane">
            grp
          </span>
        </Tooltip>
      )}

      {/* `data-entry-info` is a hook for the screen, which gives this block a
          floor so the controls wrap under it rather than squeezing the name
          and the hit points into a five-line column beside them. */}
      <div data-entry-info className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {current && (
            <span aria-hidden="true" className="text-gold">
              ▶
            </span>
          )}
          <span
            className={`text-sm ${
              entry.side === 'party' ? 'text-ink' : 'text-ink-muted'
            } ${isYours ? 'font-bold' : ''} ${
              hp === 0 ? 'line-through opacity-70' : ''
            }`}
          >
            {entry.label}
          </span>
          {isYours && <StatusWord kind="yours" />}
          {waiting > 0 && (
            <StatusWord
              kind="waiting"
              detail={waiting > 1 ? `· ${waiting}` : undefined}
            />
          )}
          {homebrew && <StatusWord kind="homebrew" />}
          {entry.concentrating && (
            <Tooltip
              content={
                isStaff || isYours
                  ? 'Concentrating — damage forces a save. Tap to drop it.'
                  : 'Concentrating — damage forces a save.'
              }
            >
              <button
                type="button"
                disabled={!(isStaff || isYours)}
                onClick={() => act(dropConcentrationAction(entry.id))}
                className="rounded-sm border border-arcane/40 bg-arcane/10 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-arcane disabled:cursor-default"
              >
                {entry.concentrationSpell
                  ? spellNameFromKey(entry.concentrationSpell)
                  : 'Conc.'}
              </button>
            </Tooltip>
          )}
          {entry.form && (
            <Tooltip
              content={`Wearing another shape. ${
                showNumbers
                  ? `${entry.form.hpCurrent} / ${entry.form.hpMax} hp · AC ${entry.form.armorClass}. `
                  : ''
              }At 0 the shape drops.`}
            >
              <span className="rounded-sm border border-arcane/40 bg-arcane/10 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-arcane">
                as {entry.form.label}
                {showNumbers && (
                  <span className="ml-1 normal-case tracking-normal tabular-nums">
                    {entry.form.hpCurrent}/{entry.form.hpMax}
                  </span>
                )}
              </span>
            </Tooltip>
          )}
          <EffectChips
            entryId={entry.id}
            conditionKeys={entry.conditionKeys}
            effects={effects}
            isStaff={isStaff}
            act={act}
          />
          {entry.conditions && (
            <span className="text-xs text-ink-subtle">{entry.conditions}</span>
          )}
        </div>

        {showNumbers && hp != null && max != null && max > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%`,
                  background: hpColor(hp, max),
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-ink-muted">
              {hp} / {max} hp
              {entry.hpTemp > 0 && (
                <span className="text-info"> +{entry.hpTemp} temp</span>
              )}
              {entry.armorClass != null && (
                <span className="text-ink-subtle">
                  {' '}
                  · ac {entry.armorClass}
                </span>
              )}
            </span>
          </div>
        )}
        {!showNumbers && (
          <p className="mt-1 text-xs text-ink-subtle">
            {hpWord(entry.hpCurrent, entry.hpMax)}
          </p>
        )}
        {/* The turn, on the card whose turn it is: staff see every one, a
            player their own. Off-turn the same people see the one slot that
            is still theirs to spend — the reaction. */}
        {(isStaff || isYours) && (
          <div className="mt-2">
            <TurnStrip
              entry={entry}
              canSpend={isStaff || isYours}
              isStaff={isStaff}
              refresh={refresh}
              onError={onError}
              offTurn={!current}
            />
          </div>
        )}
        {/* What the other side has left (11): legendary pips, recharge
            dots, the lair. Staff only — the counters are the DM's. */}
        {isStaff && (
          <LegendaryControls entry={entry} act={act} onError={onError} />
        )}
      </div>

      {isStaff && (
        <div className="flex flex-wrap items-center gap-1">
          {placeable && (
            <Tooltip
              content={
                placing
                  ? 'Tap the board where they stand. Esc lets go.'
                  : 'Put them on the board: press, then tap a tile.'
              }
            >
              <Button
                size="sm"
                variant={placing ? 'solid' : 'flat'}
                color={placing ? 'primary' : 'default'}
                className="min-w-0 px-2"
                onPress={onPlace}
              >
                {placing ? 'Tap the board' : 'Place'}
              </Button>
            </Tooltip>
          )}
          <HpControl entry={entry} act={act} />
          <EffectPicker
            encounterId={encounterId}
            entries={[
              {
                id: entry.id,
                label: entry.label,
                conditionKeys: entry.conditionKeys,
              },
            ]}
            others={everyone.filter(e => e.id !== entry.id)}
            act={act}
            keyboardEntryId={entry.id}
          />
          <ShapePicker campaignId={campaignId} entry={entry} act={act} />
          {entry.side !== 'party' && (
            <GroupControl entry={entry} everyone={groupKin} act={act} />
          )}
          <Button
            size="sm"
            variant={entry.concentrating ? 'flat' : 'light'}
            aria-label={`Toggle concentration for ${entry.label}`}
            className={`min-w-0 px-2 ${
              entry.concentrating ? 'text-arcane' : 'text-ink-subtle'
            }`}
            onPress={() =>
              act(
                updateEntryAction(entry.id, {
                  concentrating: !entry.concentrating,
                })
              )
            }
          >
            ◈
          </Button>
          <Button
            size="sm"
            variant="light"
            aria-label={`Remove ${entry.label}`}
            className="min-w-0 px-2 text-ink-subtle data-[hover=true]:text-danger"
            onPress={() => act(removeEntryAction(entry.id))}
          >
            ✕
          </Button>
        </div>
      )}
    </li>
  );
}

/* --- the tracker ------------------------------------------------------ */

export function InitiativeTracker({
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
  const enc = state.encounter;
  const placement = usePlacement(campaignId);
  const tray = useDiceTray();
  const [label, setLabel] = useState('');
  const [initiative, setInitiative] = useState(0);
  const [hp, setHp] = useState(0);
  const [ac, setAc] = useState(0);
  const [side, setSide] = useState<EntrySide>('foe');

  const act: Act = async p => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  if (!enc) {
    if (isStaff) return null; // the panel offers the "start" card instead
    return (
      <SectionCard title="Initiative">
        <EmptyState
          scene={<BattlefieldScene />}
          title="Nothing is trying to kill you"
          description="The DM hasn't called for initiative yet."
        />
      </SectionCard>
    );
  }

  const add = () => {
    if (!label.trim()) return;
    act(
      addEntryAction(enc.id, {
        label,
        initiative,
        side,
        hpMax: hp || null,
        hpCurrent: hp || null,
        armorClass: ac || null,
      })
    );
    setLabel('');
    setInitiative(0);
    setHp(0);
    setAc(0);
  };

  // Who is already on the board, so "Place" is offered only for the rest.
  const onBoard = state.battlemap
    ? new Set(
        state.battlemap.tokens
          .map(t => t.entryId)
          .filter((id): id is string => id !== null)
      )
    : null;

  const everyone: PickerEntry[] = state.entries.map(e => ({
    id: e.id,
    label: e.label,
    conditionKeys: e.conditionKeys,
  }));

  const standing = state.entries.filter(
    e => e.side === 'party' && (e.hpCurrent == null || e.hpCurrent > 0)
  ).length;
  const party = state.entries.filter(e => e.side === 'party').length;

  return (
    <SectionCard
      title={enc.name}
      description={`Round ${enc.round}`}
      actions={
        isStaff && (
          <div className="flex flex-wrap gap-1">
            <FightRules encounter={enc} state={state} act={act} />
            <Button
              size="sm"
              variant="flat"
              onPress={() => act(advanceTurnAction(enc.id, -1))}
            >
              Back
            </Button>
            <motion.div whileTap={{ rotate: [0, -6, 6, -3, 0] }}>
              <Button
                size="sm"
                color="primary"
                onPress={() => act(advanceTurnAction(enc.id, 1))}
              >
                Next turn
              </Button>
            </motion.div>
            <Button
              size="sm"
              variant="light"
              className="text-ink-muted"
              onPress={() => act(endEncounterAction(enc.id))}
            >
              End
            </Button>
          </div>
        )
      }
    >
      <ol className="divide-y divide-line">
        <CountdownRows effects={state.effects} isStaff={isStaff} act={act} />
        {state.entries.map(e => (
          <EntryLine
            key={e.id}
            entry={e}
            current={state.turnEntryIds.includes(e.id)}
            isStaff={isStaff}
            isYours={
              e.characterId != null && e.characterId === state.viewerCharacterId
            }
            act={act}
            effects={state.effects}
            everyone={everyone}
            groupKin={state.entries.map(x => ({
              id: x.id,
              label: x.label,
              groupId: x.groupId,
            }))}
            encounterId={enc.id}
            campaignId={campaignId}
            refresh={refresh}
            onError={onError}
            placeable={
              isStaff &&
              !!onBoard &&
              !onBoard.has(e.id) &&
              state.battlemap?.encounterId === enc.id
            }
            waiting={
              e.characterId
                ? state.checks.filter(
                    c =>
                      c.status === 'open' &&
                      c.targets.some(
                        t =>
                          t.characterId === e.characterId &&
                          t.status === 'waiting'
                      )
                  ).length
                : 0
            }
            placing={placement?.entryId === e.id}
            onPlace={() =>
              setPlacement(
                campaignId,
                placement?.entryId === e.id
                  ? null
                  : { entryId: e.id, label: e.label }
              )
            }
          />
        ))}
        {state.entries.length === 0 && (
          <li className="py-3 text-sm text-ink-subtle">
            Nobody has rolled in yet.
          </li>
        )}
      </ol>

      {party > 0 && (
        <Marginalia className="mt-3">
          {standing === party
            ? 'everyone still upright'
            : standing === 0
              ? 'the whole party is down'
              : `${standing} of ${party} still upright`}
        </Marginalia>
      )}

      {isStaff && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={() => act(addPartyAction(enc.id))}
            >
              Add the party
            </Button>
            <Button
              size="sm"
              variant="flat"
              onPress={async () => {
                const res = await rollInitiativeAction(enc.id);
                if (!res.ok) {
                  onError(res.error ?? 'Could not roll for them.');
                  return;
                }
                await refresh();
                // The server rolled and the DM caused it: the tray draws
                // each combatant's die, one group apiece, rather than the
                // numbers appearing in the order with nothing thrown.
                if (res.data.length > 0) {
                  void tray.cast(
                    res.data.map(r => groupFromNotation(r.roll, r.label)),
                    { title: 'Initiative', hint: `${res.data.length} rolled` }
                  );
                }
              }}
            >
              Roll for anyone at 0
            </Button>
          </div>

          <BestiaryPicker
            campaignId={campaignId}
            encounterId={enc.id}
            act={act}
          />

          <CountdownControl encounterId={enc.id} act={act} />

          <div className="flex flex-wrap items-end gap-2">
            <Input
              size="sm"
              label="Add a combatant"
              placeholder="Goblin"
              value={label}
              onValueChange={setLabel}
              className="min-w-40 flex-1"
            />
            <Select
              aria-label="Side"
              size="sm"
              className="w-32"
              selectedKeys={[side]}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                if (key) setSide(String(key) as EntrySide);
              }}
            >
              {(['foe', 'party', 'other'] as EntrySide[]).map(s => (
                <SelectItem key={s} textValue={SIDE_LABEL[s]}>
                  {SIDE_LABEL[s]}
                </SelectItem>
              ))}
            </Select>
            <NumberInput
              size="sm"
              label="Init"
              className="w-20"
              value={initiative}
              onValueChange={v => setInitiative(Number(v) || 0)}
            />
            <NumberInput
              size="sm"
              label="HP"
              minValue={0}
              className="w-24"
              value={hp}
              onValueChange={v => setHp(Number(v) || 0)}
            />
            <NumberInput
              size="sm"
              label="AC"
              minValue={0}
              className="w-20"
              value={ac}
              onValueChange={v => setAc(Number(v) || 0)}
            />
            <Button
              size="sm"
              color="primary"
              isDisabled={!label.trim()}
              onPress={add}
            >
              Add
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">
            A second &ldquo;Goblin&rdquo; numbers itself, and the first becomes
            Goblin 1. Leave initiative at 0 to roll for it later.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
