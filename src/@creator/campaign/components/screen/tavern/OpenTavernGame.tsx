'use client';

import { Button, Checkbox, Input } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_RULES,
  GAMING_SET_LABEL,
  MAX_NAME,
  MAX_SEATS,
  MIN_SEATS,
  TAVERN_KIND_LABEL,
  type HouseGameRow,
  type TavernKind,
  type TavernRules,
} from '@/@creator/campaign/lib/tavern';
import { cpWords } from '@/@creator/character/lib/coins';
import { DiceSpinner, Glyph, Marginalia } from '@/@shared/components/ui';
import type { TavernSeatChoices } from '@/server/tavern/seats';
import {
  listHouseGamesAction,
  openTavernGameAction,
  tavernSeatChoicesAction,
} from '../../../tavern-actions';
import { RulesFields } from './RulesFields';

/** What the DM is opening: one of the two plain games, or a house game. */
type Pick =
  | { kind: TavernKind; houseId: null }
  | { kind: TavernKind; houseId: string };

/**
 * Opening a tavern game: which game, by whose rules, and who sits. NPCs are
 * seated at once — the DM plays them; heroes are asked, because the coin is
 * theirs.
 */
export function OpenTavernGame({
  campaignId,
  onDone,
  onCancel,
  onError,
}: {
  campaignId: string;
  onDone: () => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [houses, setHouses] = useState<HouseGameRow[] | null>(null);
  const [choices, setChoices] = useState<TavernSeatChoices | null>(null);
  const [pick, setPick] = useState<Pick>({ kind: 'liars-dice', houseId: null });
  const [rules, setRules] = useState<TavernRules>(DEFAULT_RULES['liars-dice']);
  const [name, setName] = useState('');
  const [npcIds, setNpcIds] = useState<string[]>([]);
  const [heroIds, setHeroIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // The screen hands a new `onError` each render; the read happens once.
  const report = useRef(onError);
  report.current = onError;

  useEffect(() => {
    void (async () => {
      const [h, c] = await Promise.all([
        listHouseGamesAction(campaignId),
        tavernSeatChoicesAction(campaignId),
      ]);
      if (h.ok) setHouses(h.data);
      else report.current(h.error);
      if (c.ok) setChoices(c.data);
      else report.current(c.error);
    })();
  }, [campaignId]);

  const house = useMemo(
    () => houses?.find(h => h.id === pick.houseId) ?? null,
    [houses, pick.houseId]
  );
  const seats = npcIds.length + heroIds.length;
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  if (!houses || !choices) {
    return (
      <div className="flex justify-center py-6">
        <DiceSpinner label="Pulling up chairs…" />
      </div>
    );
  }

  const games: { pick: Pick; label: string; line: string }[] = [
    {
      pick: { kind: 'liars-dice', houseId: null },
      label: TAVERN_KIND_LABEL['liars-dice'],
      line: 'Cups of dice. Bid, bluff, call Liar!',
    },
    {
      pick: { kind: 'crowns', houseId: null },
      label: TAVERN_KIND_LABEL.crowns,
      line: 'A hand of cards, a crowned suit, closest to 31.',
    },
    ...houses.map(h => ({
      pick: { kind: h.kind, houseId: h.id } as Pick,
      label: h.name,
      line: `${TAVERN_KIND_LABEL[h.kind]} by the house’s rules`,
    })),
  ];

  const submit = async () => {
    setBusy(true);
    const res = await openTavernGameAction(campaignId, {
      houseGameId: pick.houseId,
      kind: pick.kind,
      name: name.trim() || undefined,
      rules: pick.houseId ? undefined : rules,
      npcIds,
      characterIds: heroIds,
    });
    setBusy(false);
    if (!res.ok) onError(res.error);
    else onDone();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className="font-display text-lg font-semibold">Open a tavern game</h3>

      <div
        role="radiogroup"
        aria-label="Which game"
        className="flex flex-col gap-1.5"
      >
        {games.map(g => {
          const on =
            g.pick.houseId === pick.houseId && g.pick.kind === pick.kind;
          return (
            <button
              key={g.pick.houseId ?? g.pick.kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setPick(g.pick);
                if (!g.pick.houseId) setRules(DEFAULT_RULES[g.pick.kind]);
              }}
              className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-left ${
                on ? 'border-2 border-gold bg-surface-2' : 'border border-line'
              }`}
            >
              <Glyph
                name={g.pick.kind === 'crowns' ? 'cards' : 'die'}
                size={18}
                className={
                  on ? 'mt-0.5 text-gold-strong' : 'mt-0.5 text-ink-muted'
                }
              />
              <span>
                <span className="block text-sm font-semibold">{g.label}</span>
                <span className="block text-xs text-ink-muted">{g.line}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Input
        size="sm"
        label="Name"
        labelPlacement="outside"
        placeholder={house?.name ?? `${TAVERN_KIND_LABEL[pick.kind]} at the …`}
        maxLength={MAX_NAME}
        value={name}
        onValueChange={setName}
      />

      {house ? (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs">
          {house.blurb && <p className="mb-1 text-sm">{house.blurb}</p>}
          <ul className="list-disc space-y-0.5 pl-4 text-ink-muted">
            {house.lines.map(l => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : (
        <RulesFields kind={pick.kind} rules={rules} onChange={setRules} />
      )}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-semibold">
          People in the room{' '}
          <span className="font-normal text-ink-muted">
            · you play them; their attitude is yours alone
          </span>
        </legend>
        {choices.npcs.length === 0 && (
          <p className="text-xs text-ink-muted">
            No NPCs in the World yet. Heroes can play each other.
          </p>
        )}
        {choices.npcs.map(n => (
          <Checkbox
            key={n.id}
            size="sm"
            isSelected={npcIds.includes(n.id)}
            onValueChange={() => setNpcIds(l => toggle(l, n.id))}
          >
            <span className="text-sm">{n.name}</span>
            <span className="ml-2 text-xs text-ink-muted">
              {[n.attitude, n.stat ? 'stat block' : 'no stat block · +0']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Checkbox>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs font-semibold">
          Heroes{' '}
          <span className="font-normal text-ink-muted">
            · asked to sit; nothing leaves a purse until they say yes
          </span>
        </legend>
        {choices.heroes.map(h => (
          <Checkbox
            key={h.id}
            size="sm"
            isSelected={heroIds.includes(h.id)}
            onValueChange={() => setHeroIds(l => toggle(l, h.id))}
          >
            <span className="text-sm">{h.name}</span>
            <span className="ml-2 text-xs tabular-nums text-ink-muted">
              {cpWords(h.purseCp)}
              {(pick.kind === 'crowns' ? h.cards : h.dice)
                ? ` · ${GAMING_SET_LABEL[pick.kind]}`
                : ''}
            </span>
          </Checkbox>
        ))}
      </fieldset>

      <Marginalia>
        {seats < MIN_SEATS
          ? 'nobody plays alone. pick at least two.'
          : `${seats} of ${MAX_SEATS} chairs. the back room is always cramped.`}
      </Marginalia>

      <div className="flex gap-2">
        <Button
          size="sm"
          color="primary"
          type="submit"
          isDisabled={busy || seats < MIN_SEATS || seats > MAX_SEATS}
        >
          Open it and ask them to sit
        </Button>
        <Button size="sm" variant="light" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
