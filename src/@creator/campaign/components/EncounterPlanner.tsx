'use client';

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  Input,
  NumberInput,
  Textarea,
} from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { formatChallenge } from '@/@shared/content';
import {
  BattlefieldScene,
  DiceSpinner,
  EmptyState,
  Glyph,
  Ledger,
  Marginalia,
  SectionCard,
  useConfirm,
} from '@/@shared/components/ui';
import type { CombatantChoice } from '@/server/content';
import type { PlanRow } from '@/server/encounter-plans';
import { listCombatantChoicesAction } from '../content-actions';
import { PlanSpots } from './PlanSpots';
import {
  addPlanLineAction,
  createPlanAction,
  deletePlanAction,
  listPlansAction,
  removePlanLineAction,
  runPlanAction,
  setPlanLineCountAction,
  updatePlanAction,
} from '../encounter-actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/* --- one plan ---------------------------------------------------------- */

function Plan({
  campaignId,
  plan,
  choices,
  refresh,
  onError,
  onRan,
}: {
  campaignId: string;
  plan: PlanRow;
  choices: CombatantChoice[] | null;
  refresh: () => Promise<void>;
  onError: (message: string) => void;
  onRan: (skipped: number, placed: number, unplaced: number) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [notes, setNotes] = useState(plan.notes);
  const [notesDirty, setNotesDirty] = useState(false);
  const [running, setRunning] = useState(false);
  const { confirm, dialog } = useConfirm();

  const act: Act = async p => {
    const res = await p;
    if (!res.ok) onError(res.error ?? 'Something went wrong.');
    await refresh();
  };

  const chosen = choices?.find(c => c.key === picked) ?? null;
  const m = plan.maths;

  return (
    <SectionCard
      title={plan.name}
      description={
        m.partyAverageLevel !== null
          ? `Against ${m.partySize} at an average level ${m.partyAverageLevel}`
          : `Against ${m.partySize} at the table`
      }
      actions={
        <>
          <Button
            size="sm"
            color="primary"
            isDisabled={plan.lines.length === 0 || running}
            isLoading={running}
            onPress={async () => {
              setRunning(true);
              const res = await runPlanAction(campaignId, plan.id);
              setRunning(false);
              if (!res.ok) {
                onError(res.error);
                return;
              }
              onRan(res.data.skipped, res.data.placed, res.data.unplaced);
            }}
          >
            Call for initiative
          </Button>
          <Button
            size="sm"
            variant="light"
            onPress={async () => {
              const yes = await confirm({
                title: 'Tear up this plan?',
                body: 'Any fight already dealt from it stays exactly as it is — this only removes the plan.',
                confirmLabel: 'Tear it up',
                destructive: true,
              });
              if (!yes) return;
              await act(deletePlanAction(campaignId, plan.id));
            }}
          >
            Tear up
          </Button>
        </>
      }
    >
      {dialog}

      <div className="flex flex-col gap-4">
        {/* The sums, as a ledger line rather than a row of tiles — they are
            context for the fight, not the subject (design rule 2). */}
        <Ledger
          items={[
            {
              value: m.bodyCount,
              label: m.bodyCount === 1 ? 'body' : 'bodies',
            },
            { value: m.totalExperience.toLocaleString(), label: 'XP total' },
            {
              value: m.experiencePerCharacter.toLocaleString(),
              label: 'XP each',
            },
            ...(m.highestChallengeRating !== null
              ? [
                  {
                    value: formatChallenge(m.highestChallengeRating),
                    label: 'highest CR',
                  },
                ]
              : []),
          ]}
        />

        {m.incomplete && (
          <p className="text-xs text-warning">
            One of these no longer resolves, so the totals are short by whatever
            it was worth.
          </p>
        )}

        {plan.lines.length > 0 && (
          <ul className="divide-y divide-line">
            {plan.lines.map(line => (
              <li
                key={line.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <NumberInput
                  size="sm"
                  aria-label={`How many ${line.name}`}
                  minValue={1}
                  maxValue={50}
                  className="w-20"
                  value={line.count}
                  onValueChange={v =>
                    act(setPlanLineCountAction(line.id, Number(v) || 1))
                  }
                />
                <span className="flex-1 text-sm text-ink">{line.name}</span>
                <PlanSpots
                  campaignId={campaignId}
                  lineId={line.id}
                  name={line.name}
                  count={line.count}
                  spots={line.spots}
                  onChange={refresh}
                />
                {line.experiencePoints === null ? (
                  <span className="text-xs text-warning">
                    no longer in play
                  </span>
                ) : (
                  <span className="text-xs text-ink-subtle">
                    CR {formatChallenge(line.challengeRating ?? 0)} · AC{' '}
                    {line.armorClass} · {line.hitPoints} HP ·{' '}
                    {(line.experiencePoints * line.count).toLocaleString()} XP
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => act(removePlanLineAction(line.id))}
                  className="text-ink-subtle hover:text-danger"
                >
                  <Glyph name="question" size={14} className="rotate-45" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Autocomplete
            size="sm"
            label="Add a monster"
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
                    CR {formatChallenge(choice.challengeRating)} ·{' '}
                    {choice.hitPoints} HP
                  </span>
                </div>
              </AutocompleteItem>
            )}
          </Autocomplete>
          <NumberInput
            size="sm"
            label="How many"
            minValue={1}
            maxValue={50}
            className="w-24"
            value={count}
            onValueChange={v => setCount(Number(v) || 1)}
          />
          <Button
            size="sm"
            variant="flat"
            isDisabled={!chosen}
            onPress={() => {
              if (!chosen) return;
              act(addPlanLineAction(plan.id, chosen.ref, count));
              setPicked(null);
              setCount(1);
            }}
          >
            Add
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <Textarea
            aria-label="How it starts"
            minRows={2}
            placeholder="They are waiting on the far bank; the first crossing draws the volley."
            value={notes}
            onValueChange={v => {
              setNotes(v);
              setNotesDirty(true);
            }}
            classNames={{ input: 'font-hand text-[1.1875rem] leading-snug' }}
          />
          {notesDirty && (
            <div>
              <Button
                size="sm"
                variant="flat"
                onPress={async () => {
                  await act(updatePlanAction(campaignId, plan.id, { notes }));
                  setNotesDirty(false);
                }}
              >
                Save the note
              </Button>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/* --- the planner ------------------------------------------------------- */

/**
 * Fights, built before anyone is at the table.
 *
 * A plan is not a draft encounter — it survives being run, so the same ambush
 * deals out twice with fresh hit points both times. The sums under each one
 * are only ever sums: total XP, XP a head, the biggest thing in the room. This
 * deliberately does not print a difficulty verdict, because the encounter XP
 * budget table is not in the SRD and a rating this project cannot cite is
 * worse than no rating at all.
 */
export function EncounterPlanner({ campaignId }: { campaignId: string }) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [choices, setChoices] = useState<CombatantChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setPlans(await listPlansAction(campaignId));
    } catch {
      setError('Failed to open the plans.');
    }
  }, [campaignId]);

  const loadChoices = useCallback(async () => {
    setChoices(
      await listCombatantChoicesAction(campaignId).catch(
        () => [] as CombatantChoice[]
      )
    );
  }, [campaignId]);

  useEffect(() => {
    refresh();
    loadChoices();
  }, [refresh, loadChoices]);

  if (!plans) {
    return (
      <div className="flex justify-center py-12">
        <DiceSpinner label="Laying out the fight…" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
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

      <SectionCard title="Plan a fight">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            size="sm"
            label="Name"
            placeholder="The bridge at Duskwater"
            value={name}
            onValueChange={setName}
            className="min-w-40 flex-1"
          />
          <Button
            size="sm"
            color="primary"
            isDisabled={!name.trim()}
            onPress={async () => {
              const res = await createPlanAction(campaignId, { name });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setName('');
              await refresh();
            }}
          >
            Start it
          </Button>
        </div>
      </SectionCard>

      {plans.length === 0 ? (
        <EmptyState
          scene={<BattlefieldScene />}
          title="Nothing waiting in the dark"
          description="Build a fight now and it deals out in one press when the party walks into it — with the hit points, the armour class, and initiative already rolled."
        />
      ) : (
        <div className="space-y-4">
          {plans.map(plan => (
            <Plan
              key={plan.id}
              campaignId={campaignId}
              plan={plan}
              choices={choices}
              refresh={refresh}
              onError={setError}
              onRan={(skipped, placed, unplaced) => {
                const where =
                  placed > 0
                    ? `${placed} standing where you put them on the board${
                        unplaced > 0 ? `, ${unplaced} left for the deal` : ''
                      }`
                    : null;
                setNotice(
                  skipped > 0
                    ? `They are up on the Session tab — ${skipped} of them could not be found and were left out.${where ? ` ${where[0].toUpperCase()}${where.slice(1)}.` : ''}`
                    : where
                      ? `They are up on the Session tab, with initiative rolled — ${where}.`
                      : 'They are up on the Session tab, with initiative rolled.'
                );
              }}
            />
          ))}
        </div>
      )}

      <Marginalia dash>
        the sums are sums — the difficulty is still your call
      </Marginalia>
    </div>
  );
}
