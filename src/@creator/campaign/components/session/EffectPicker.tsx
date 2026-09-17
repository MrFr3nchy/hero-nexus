'use client';

import {
  Button,
  Input,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Switch,
  Tooltip,
} from '@heroui/react';
import { useEffect, useState } from 'react';

import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type AbilityKey,
} from '@/@creator/character/schema';
import {
  CONDITIONS,
  parseConditions,
} from '@/@creator/campaign/lib/conditions';
import { MAX_ROUNDS, type EndsOn } from '@/@creator/campaign/lib/effects';
import {
  applyEffectAction,
  type EffectActionInput,
} from '../../effect-actions';
import { updateEntryAction } from '../../actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/** The least a picker needs to know about who it is for. */
export interface PickerEntry {
  id: string;
  label: string;
  conditionKeys: string;
}

/** A three-way toggle in the house style, shared by the mode pickers. */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-line bg-surface-2 p-0.5"
    >
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded px-2 py-0.5 text-[0.7rem] transition-colors ${
            value === o.key
              ? 'bg-gold font-medium text-bg'
              : 'text-ink-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * How long, and what ends it. Shared by the condition list and the effect
 * form so the two cannot disagree about what "3 rounds, ends on start" means.
 */
function DurationFields({
  rounds,
  setRounds,
  endsOn,
  setEndsOn,
  saveAbility,
  setSaveAbility,
  saveDc,
  setSaveDc,
  hidden,
  setHidden,
}: {
  rounds: number;
  setRounds: (n: number) => void;
  endsOn: EndsOn;
  setEndsOn: (e: EndsOn) => void;
  saveAbility: string;
  setSaveAbility: (a: string) => void;
  saveDc: number;
  setSaveDc: (n: number) => void;
  hidden: boolean;
  setHidden: (h: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <NumberInput
          size="sm"
          label="Rounds"
          description={rounds > 0 ? undefined : 'until removed'}
          minValue={0}
          maxValue={MAX_ROUNDS}
          className="w-24"
          value={rounds}
          onValueChange={v => setRounds(Number(v) || 0)}
        />
        <div className="flex flex-col gap-1 pb-1">
          <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
            Counts on
          </span>
          <Segmented
            label="When it counts down"
            value={endsOn}
            options={[
              { key: 'start', label: 'turn start' },
              { key: 'end', label: 'turn end' },
            ]}
            onChange={setEndsOn}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select
          size="sm"
          label="Save to end it"
          placeholder="None"
          className="w-40"
          selectedKeys={saveAbility ? [saveAbility] : []}
          onSelectionChange={keys => {
            const key = Array.from(keys)[0];
            setSaveAbility(key ? String(key) : '');
          }}
        >
          {ABILITY_KEYS.map(a => (
            <SelectItem key={a} textValue={ABILITY_LABELS[a]}>
              {ABILITY_LABELS[a]}
            </SelectItem>
          ))}
        </Select>
        <NumberInput
          size="sm"
          label="DC"
          minValue={1}
          maxValue={40}
          className="w-20"
          isDisabled={!saveAbility}
          value={saveDc}
          onValueChange={v => setSaveDc(Number(v) || 10)}
        />
        <Tooltip content="Only staff see it — a curse the party has not noticed yet.">
          <Switch size="sm" isSelected={hidden} onValueChange={setHidden}>
            <span className="text-xs text-ink-muted">Hidden</span>
          </Switch>
        </Tooltip>
      </div>
    </div>
  );
}

/**
 * Put something on a combatant — or on several at once.
 *
 * Two faces. *Condition* is the fixed 2024 list, each row carrying the one
 * line a DM needs mid-turn, exactly as the old picker had it; tapping one
 * puts it on with whatever duration is set below, and tapping one that is
 * already on everybody here takes it off. *Effect* is a name — Rage, Bless,
 * Hunter's Mark — for the half of what a table means that no list covers.
 *
 * Every application writes the key onto the entry, which is what the picker
 * always did, and a row beside it carrying the duration, the save and the
 * source. "Until removed" is a row with no clock; the clock in `advanceTurn`
 * takes the rest off when they run out.
 */
export function EffectPicker({
  encounterId,
  entries,
  others,
  act,
  triggerLabel,
  keyboardEntryId,
}: {
  encounterId: string;
  /** Who it goes on. Several for a selection on the board. */
  entries: PickerEntry[];
  /** Everybody in the fight, so a source and an anchor can be picked. */
  others: PickerEntry[];
  act: Act;
  /** Override the trigger's words. Default names the count. */
  triggerLabel?: string;
  /**
   * Opens when the DM's keyboard asks for it (11): the `C` key names an
   * entry id, and the picker on that entry's row opens itself.
   */
  keyboardEntryId?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!keyboardEntryId) return;
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<{ entryId: string }>).detail?.entryId;
      if (id === keyboardEntryId) setOpen(true);
    };
    window.addEventListener('hero-nexus:conditions', onOpen);
    return () => window.removeEventListener('hero-nexus:conditions', onOpen);
  }, [keyboardEntryId]);
  const [face, setFace] = useState<'condition' | 'effect'>('condition');
  const [rounds, setRounds] = useState(0);
  const [endsOn, setEndsOn] = useState<EndsOn>('end');
  const [saveAbility, setSaveAbility] = useState('');
  const [saveDc, setSaveDc] = useState(10);
  const [hidden, setHidden] = useState(false);
  const [label, setLabel] = useState('');
  const [sourceId, setSourceId] = useState('');

  // Active means on every entry in the selection; a condition on some of a
  // group reads as off, and tapping it puts it on the rest.
  const onAll = new Set(
    CONDITIONS.map(c => c.key).filter(key =>
      entries.every(e => parseConditions(e.conditionKeys).includes(key))
    )
  );
  const activeCount = new Set(
    entries.flatMap(e => parseConditions(e.conditionKeys))
  ).size;

  const ids = entries.map(e => e.id);
  const common = (): Omit<EffectActionInput, 'kind'> => ({
    rounds: rounds > 0 ? rounds : null,
    endsOn,
    saveAbility: (saveAbility as AbilityKey) || null,
    saveDc: saveAbility ? saveDc : null,
    visibility: hidden ? 'dm' : 'shared',
    sourceEntryId: sourceId || null,
    sourceLabel: others.find(o => o.id === sourceId)?.label ?? '',
    // Bless counts on the cleric's turn, not the fighter's. Where a source
    // is named, the clock follows it.
    anchorEntryId: sourceId || null,
  });

  const toggleCondition = (key: string) => {
    if (onAll.has(key as never)) {
      // Off, everywhere it is on. The key write drops any clock behind it.
      for (const e of entries) {
        act(
          updateEntryAction(e.id, {
            conditionKeys: parseConditions(e.conditionKeys)
              .filter(k => k !== key)
              .join(','),
          })
        );
      }
      return;
    }
    act(
      applyEffectAction(encounterId, ids, {
        kind: 'condition',
        conditionKey: key,
        ...common(),
      })
    );
  };

  const applyEffect = () => {
    if (!label.trim()) return;
    act(
      applyEffectAction(encounterId, ids, {
        kind: 'effect',
        label: label.trim(),
        ...common(),
      })
    );
    setLabel('');
  };

  const many = entries.length > 1;
  const trigger =
    triggerLabel ??
    (many
      ? `Afflict ${entries.length}`
      : activeCount > 0
        ? `${activeCount} cond.`
        : 'Conditions');

  return (
    <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button size="sm" variant="flat" className="min-w-0 px-2">
          {trigger}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 border border-line bg-surface p-2">
        <div className="w-full space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Segmented
              label="What to put on"
              value={face}
              options={[
                { key: 'condition', label: 'Condition' },
                { key: 'effect', label: 'Effect' },
              ]}
              onChange={setFace}
            />
            {many && (
              <span className="text-xs text-ink-subtle">
                on {entries.map(e => e.label).join(', ')}
              </span>
            )}
          </div>

          <DurationFields
            rounds={rounds}
            setRounds={setRounds}
            endsOn={endsOn}
            setEndsOn={setEndsOn}
            saveAbility={saveAbility}
            setSaveAbility={setSaveAbility}
            saveDc={saveDc}
            setSaveDc={setSaveDc}
            hidden={hidden}
            setHidden={setHidden}
          />

          {others.length > 0 && (
            <Select
              size="sm"
              label="From"
              placeholder="Nobody in particular"
              description="Named as the source; counts on their turn."
              className="w-full"
              selectedKeys={sourceId ? [sourceId] : []}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                setSourceId(key ? String(key) : '');
              }}
            >
              {others.map(o => (
                <SelectItem key={o.id} textValue={o.label}>
                  {o.label}
                </SelectItem>
              ))}
            </Select>
          )}

          {face === 'condition' ? (
            <ul className="max-h-56 w-full space-y-0.5 overflow-y-auto border-t border-line pt-2">
              {CONDITIONS.map(c => {
                const on = onAll.has(c.key);
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => toggleCondition(c.key)}
                      className={`w-full rounded-md px-2 py-1.5 text-left transition-colors ${
                        on
                          ? 'bg-gold/12 text-ink'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span
                          aria-hidden="true"
                          className={`inline-block h-2 w-2 rounded-full ${
                            on
                              ? c.tone === 'danger'
                                ? 'bg-danger'
                                : 'bg-warning'
                              : 'bg-line'
                          }`}
                        />
                        {c.label}
                        {on && (
                          <span className="ml-auto text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
                            tap to lift
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block pl-4 text-xs leading-snug text-ink-subtle">
                        {c.hint}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                size="sm"
                label="Name it"
                placeholder="Rage, Bless, Hunter's Mark"
                value={label}
                onValueChange={setLabel}
                className="min-w-40 flex-1"
                onKeyDown={e => {
                  if (e.key === 'Enter') applyEffect();
                }}
              />
              <Button
                size="sm"
                color="primary"
                isDisabled={!label.trim()}
                onPress={applyEffect}
              >
                Put it on
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A clock for the room: "the ceiling comes down in 3 rounds". Counts at the
 * top of each round, announces at zero, and belongs to nobody in the order.
 */
export function CountdownControl({
  encounterId,
  act,
}: {
  encounterId: string;
  act: Act;
}) {
  const [label, setLabel] = useState('');
  const [rounds, setRounds] = useState(3);
  const [hidden, setHidden] = useState(false);

  const start = () => {
    if (!label.trim() || rounds < 1) return;
    act(
      applyEffectAction(encounterId, [], {
        kind: 'countdown',
        label: label.trim(),
        rounds,
        visibility: hidden ? 'dm' : 'shared',
      })
    );
    setLabel('');
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        size="sm"
        label="Something in N rounds"
        placeholder="The ceiling comes down"
        value={label}
        onValueChange={setLabel}
        className="min-w-40 flex-1"
        onKeyDown={e => {
          if (e.key === 'Enter') start();
        }}
      />
      <NumberInput
        size="sm"
        label="Rounds"
        minValue={1}
        maxValue={MAX_ROUNDS}
        className="w-24"
        value={rounds}
        onValueChange={v => setRounds(Number(v) || 1)}
      />
      <Tooltip content="Only staff see it until it fires.">
        <Switch size="sm" isSelected={hidden} onValueChange={setHidden}>
          <span className="text-xs text-ink-muted">Hidden</span>
        </Switch>
      </Tooltip>
      <Button
        size="sm"
        variant="flat"
        isDisabled={!label.trim()}
        onPress={start}
      >
        Start the clock
      </Button>
    </div>
  );
}
