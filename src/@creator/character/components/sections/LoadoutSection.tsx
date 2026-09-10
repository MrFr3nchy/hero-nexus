'use client';

import { Checkbox, Tooltip } from '@heroui/react';
import { useState } from 'react';

import {
  applyLoadoutPatchAction,
  type LoadoutPatchInput,
} from '@/@creator/campaign/play-actions';
import { Glyph, Pill, SectionCard } from '@/@shared/components/ui';
import type { PlayLoadout } from '@/server/play';

const ORDINAL = [
  'Cantrips',
  '1st level',
  '2nd level',
  '3rd level',
  '4th level',
  '5th level',
  '6th level',
  '7th level',
  '8th level',
  '9th level',
];

/**
 * What is in hand, and what is prepared today.
 *
 * Only toggles. Adding a longsword to your pack is a builder job — you do it
 * between sessions — while drawing the one you are already carrying is a table
 * job, and keeping the two apart is what makes this safe to hand somebody
 * mid-fight. The builder at `/creator/character` remains the one place rows
 * are created and deleted, so there is no second inventory editor to drift.
 *
 * Every toggle writes straight through, like the rest of play mode. There is
 * no save button at a table.
 */
export function LoadoutSection({
  initial,
  characterId,
  campaignId,
  onError,
  stacked = false,
}: {
  initial: PlayLoadout;
  characterId: string;
  campaignId: string | null;
  onError: (message: string) => void;
  /**
   * One column instead of two.
   *
   * Set by the table screen, where this sits in a box a third of the window
   * wide. `lg:` is a viewport breakpoint, not a container one, so a two-column
   * grid inside a narrow panel stays two columns and wraps "Longsword" across
   * two lines — the caller knows how much room it has and this does not.
   */
  stacked?: boolean;
}) {
  const [loadout, setLoadout] = useState(initial);
  const [busy, setBusy] = useState(false);
  const locked = !loadout.canEdit || busy;

  const patch = async (input: LoadoutPatchInput) => {
    setBusy(true);
    const res = await applyLoadoutPatchAction(characterId, campaignId, input);
    setBusy(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    setLoadout(res.data);
  };

  const atCap = loadout.attunedCount >= loadout.maxAttuned;

  // Cantrips and always-prepared spells are never a decision, so they are
  // counted apart from the ones a player actually picks each morning.
  const choosable = loadout.spells.filter(s => !s.alwaysPrepared);
  const preparedCount = choosable.filter(s => s.prepared).length;

  const byLevel = [...loadout.spells]
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .reduce<Map<number, typeof loadout.spells>>((map, spell) => {
      const list = map.get(spell.level) ?? [];
      list.push(spell);
      map.set(spell.level, list);
      return map;
    }, new Map());

  return (
    <div className={stacked ? 'space-y-5' : 'grid gap-5 lg:grid-cols-2'}>
      <SectionCard
        title="What you are carrying"
        description="Tick what is in hand. Worn armour and a held shield move your armour class."
        actions={
          <Pill tone={atCap ? 'warning' : 'default'}>
            {loadout.attunedCount}/{loadout.maxAttuned} attuned
          </Pill>
        }
      >
        {loadout.items.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Nothing in your pack yet. Rows are added in the builder — this is
            where you decide what is in hand.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {loadout.items.map(item => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface px-3 py-2"
              >
                <span className="tabular-nums text-ink-subtle">
                  {item.quantity}&times;
                </span>
                <span className="min-w-0 flex-1 text-ink">{item.name}</span>

                <Checkbox
                  size="sm"
                  isSelected={item.equipped}
                  isDisabled={locked}
                  onValueChange={v =>
                    patch({ equip: { itemId: item.id, equipped: v } })
                  }
                >
                  <span className="text-sm text-ink-muted">Equipped</span>
                </Checkbox>

                {/*
                  Only offered where the content says attunement is required —
                  a tick box on a coil of rope is a question with one answer —
                  or where the row is *already* attuned. Without that second
                  case a sheet that got attuned to something that does not
                  require it (an older sheet, or an item whose stats later
                  changed) has no control to undo it, and silently spends one
                  of three slots forever.
                */}
                {(item.requiresAttunement || item.attuned) && (
                  <Tooltip
                    content={
                      atCap && !item.attuned
                        ? 'You are already attuned to three items.'
                        : 'This item does nothing until you attune to it.'
                    }
                  >
                    <span>
                      <Checkbox
                        size="sm"
                        isSelected={item.attuned}
                        isDisabled={locked || (atCap && !item.attuned)}
                        onValueChange={v =>
                          patch({ attune: { itemId: item.id, attuned: v } })
                        }
                      >
                        <span className="text-sm text-ink-muted">Attuned</span>
                      </Checkbox>
                    </span>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Prepared today"
        description="What you have in mind this morning. Cantrips are always ready."
        actions={
          choosable.length > 0 ? (
            <Pill tone="arcane">
              {preparedCount}/{choosable.length} prepared
            </Pill>
          ) : undefined
        }
      >
        {loadout.spells.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No spells on this sheet. Add them in the builder and they will be
            here to prepare.
          </p>
        ) : (
          <div className="space-y-3">
            {[...byLevel.entries()].map(([level, list]) => (
              <div key={level}>
                <h4 className="mb-1 font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-arcane">
                  {ORDINAL[level] ?? 'Unavailable'}
                </h4>
                <ul className="space-y-1">
                  {list.map(spell => (
                    <li
                      key={spell.key}
                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface px-3 py-1.5"
                    >
                      <Glyph name="orb" size={13} className="text-gold" />
                      <span className="min-w-0 flex-1 text-sm text-ink">
                        {spell.name}
                      </span>
                      {spell.alwaysPrepared ? (
                        <Pill tone="gold">Always</Pill>
                      ) : (
                        <Checkbox
                          size="sm"
                          isSelected={spell.prepared}
                          isDisabled={locked}
                          onValueChange={v =>
                            patch({
                              prepare: { key: spell.key, prepared: v },
                            })
                          }
                        >
                          <span className="text-sm text-ink-muted">
                            Prepared
                          </span>
                        </Checkbox>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
