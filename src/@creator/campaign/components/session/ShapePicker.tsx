'use client';

import {
  Autocomplete,
  AutocompleteItem,
  Button,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
} from '@heroui/react';
import { useEffect, useState } from 'react';

import { formatChallenge } from '@/@shared/content';
import type { CombatantChoice } from '@/server/content';
import type { EntryRow } from '@/server/session';
import { listCombatantChoicesAction } from '../../content-actions';
import { revertFormAction, takeFormAction } from '../../casting-actions';

type Act = (p: Promise<{ ok: boolean; error?: string }>) => Promise<void>;

/**
 * Another shape (07): Polymorph, Wild Shape. Staff pick a creature from the
 * bestiary and the combatant wears its block — hit points, AC, the attacks
 * on the stat block — until the rounds run out, the concentration breaks,
 * or the form's hit points hit zero. *Carry excess* is Wild Shape's rule:
 * damage past zero reaches the real hit points. Polymorph drops it.
 */
export function ShapePicker({
  campaignId,
  entry,
  act,
}: {
  campaignId: string;
  entry: EntryRow;
  act: Act;
}) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<CombatantChoice[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [rounds, setRounds] = useState(10);
  const [carry, setCarry] = useState(false);
  const [concentration, setConcentration] = useState(true);

  useEffect(() => {
    if (!open || choices !== null) return;
    listCombatantChoicesAction(campaignId)
      .then(setChoices)
      .catch(() => setChoices([]));
  }, [open, choices, campaignId]);

  if (entry.form) {
    return (
      <Tooltip content={`Back to ${entry.label}'s own shape.`}>
        <Button
          size="sm"
          variant="light"
          className="min-w-0 px-2 text-arcane"
          onPress={() => act(revertFormAction(entry.id))}
        >
          Revert
        </Button>
      </Tooltip>
    );
  }

  const chosen = choices?.find(c => c.key === picked) ?? null;

  return (
    <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button
          size="sm"
          variant="light"
          aria-label={`Change ${entry.label}'s shape`}
          className="min-w-0 px-2 text-ink-subtle"
        >
          Shape
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 border border-line bg-surface p-2">
        <div className="w-full space-y-2">
          <Autocomplete
            size="sm"
            label="Wear the shape of"
            placeholder={choices ? 'Wolf' : 'Reading the bestiary…'}
            isDisabled={!choices}
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
          <div className="flex flex-wrap items-end gap-2">
            <NumberInput
              size="sm"
              label="Rounds"
              description={rounds > 0 ? undefined : 'until removed'}
              minValue={0}
              maxValue={1000}
              className="w-24"
              value={rounds}
              onValueChange={v => setRounds(Number(v) || 0)}
            />
            <Tooltip content="Polymorph: the caster holds it. Off for Wild Shape.">
              <Switch
                size="sm"
                isSelected={concentration}
                onValueChange={setConcentration}
              >
                <span className="text-xs text-ink-muted">Concentration</span>
              </Switch>
            </Tooltip>
            <Tooltip content="Wild Shape: damage past zero reaches the real hit points. Polymorph drops it.">
              <Switch size="sm" isSelected={carry} onValueChange={setCarry}>
                <span className="text-xs text-ink-muted">Carry excess</span>
              </Switch>
            </Tooltip>
          </div>
          <Button
            size="sm"
            color="primary"
            isDisabled={!chosen}
            onPress={() => {
              if (!chosen) return;
              act(
                takeFormAction(entry.id, {
                  creatureRef: chosen.ref,
                  rounds: rounds > 0 ? rounds : null,
                  concentration,
                  carryExcess: carry,
                })
              );
              setOpen(false);
            }}
          >
            Change shape
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
