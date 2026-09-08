'use client';

import { Button, Checkbox, Input, Tooltip } from '@heroui/react';
import { useMemo, useState } from 'react';
import type { Control, UseFormSetValue } from 'react-hook-form';
import { useWatch } from 'react-hook-form';

import { Glyph, Pill, SectionCard } from '@/@shared/components/ui';
import { contentChips, contentMeta, refKey } from '@/@shared/content';

import {
  MAX_ATTUNED,
  type CharacterSheet,
  type InventoryItem,
} from '../../schema';
import type { ResolvedContent } from '../useResolvedContent';
import { ContentPicker } from './ContentPicker';

/**
 * What the character is carrying.
 *
 * Replaces a free-text box that could not be counted, checked, or rendered.
 * Rows either point at real content — an SRD longsword, an approved homebrew
 * blade — or are plain names, because most of what a party carries has no stat
 * block and forcing every line to resolve would make the list useless for
 * exactly the things people write down.
 *
 * Structural edits go through `setValue` on the whole array, matching the
 * approach in `HomebrewSection`: a second field-array bound to a name the
 * parent form already owns desyncs in react-hook-form.
 */

function newRow(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    ref: null,
    name: '',
    quantity: 1,
    equipped: false,
    attuned: false,
    notes: '',
    grantedBy: '',
    ...overrides,
  };
}

export function InventorySection({
  control,
  setValue,
  campaignId,
  resolved,
}: {
  control: Control<CharacterSheet>;
  setValue: UseFormSetValue<CharacterSheet>;
  campaignId?: string;
  /** Stats for the rows that point at content, and whether they arrived. */
  resolved?: ResolvedContent;
}) {
  const watched = useWatch({ control, name: 'inventory' });
  const inventory = useMemo(
    () => (watched ?? []) as InventoryItem[],
    [watched]
  );
  const [picking, setPicking] = useState(false);

  const commit = (next: InventoryItem[]) =>
    setValue('inventory', next, { shouldDirty: true, shouldValidate: true });

  const patch = (id: string, next: Partial<InventoryItem>) =>
    commit(inventory.map(i => (i.id === id ? { ...i, ...next } : i)));

  const attuned = inventory.filter(i => i.attuned).length;
  const over = attuned > MAX_ATTUNED;

  const taken = useMemo(
    () => new Set(inventory.filter(i => i.ref).map(i => refKey(i.ref!))),
    [inventory]
  );

  /** Whether a row's content requires attunement, when we can tell. */
  const needsAttunement = (item: InventoryItem): boolean => {
    if (!item.ref || !resolved) return false;
    const entry = resolved.entries.get(refKey(item.ref));
    if (!entry || entry.type !== 'item') return false;
    return Boolean(
      (entry.data as { requires_attunement?: boolean }).requires_attunement
    );
  };

  return (
    <SectionCard
      title="Inventory"
      description="Everything on your person. Tick what you have equipped — worn armour and a held shield set your armour class."
      actions={
        <div className="flex items-center gap-2">
          <Pill tone={over ? 'warning' : 'default'}>
            {attuned}/{MAX_ATTUNED} attuned
          </Pill>
          <Button size="sm" variant="flat" onPress={() => setPicking(true)}>
            Add from compendium
          </Button>
          <Button
            size="sm"
            variant="flat"
            onPress={() => commit([...inventory, newRow()])}
          >
            Add a line
          </Button>
        </div>
      }
    >
      <ContentPicker
        type="item"
        campaignId={campaignId}
        isOpen={picking}
        taken={taken}
        onClose={() => setPicking(false)}
        onPick={entry =>
          commit([
            ...inventory,
            newRow({
              name: entry.name,
              ref: {
                source: entry.ref.source,
                key: entry.ref.key,
                name: entry.name,
                type: entry.type,
              },
            }),
          ])
        }
      />

      {over && (
        <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Attuned to {attuned} items. A character can hold {MAX_ATTUNED}.
        </p>
      )}

      {inventory.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing carried yet. Add a line for anything, or pull a real item out
          of the compendium.
        </p>
      ) : (
        <ul className="space-y-2">
          {inventory.map(item => {
            const entry = item.ref && resolved?.entries.get(refKey(item.ref));
            const attunable = needsAttunement(item);
            return (
              <li
                key={item.id}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    size="sm"
                    aria-label="Quantity"
                    type="number"
                    className="w-20"
                    value={String(item.quantity)}
                    onValueChange={v =>
                      patch(item.id, {
                        quantity: Math.max(0, Math.min(9999, Number(v) || 0)),
                      })
                    }
                  />
                  {item.ref ? (
                    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                      <span className="flex items-center gap-1.5 text-ink">
                        <Glyph
                          name={contentMeta(item.ref.type).glyph}
                          size={14}
                          className="text-gold"
                        />
                        {item.name}
                      </span>
                      {item.ref.source === 'homebrew' && (
                        <Pill tone="arcane">Homebrew</Pill>
                      )}
                      {/*
                        Three states, not two. "Unavailable" is a claim about
                        the DM's table — that the item was deleted or taken out
                        of play — and it must not be made because a request
                        failed or has not answered yet.
                      */}
                      {entry ? (
                        <span className="text-xs text-ink-subtle">
                          {contentChips(entry).slice(0, 3).join(' · ')}
                        </span>
                      ) : resolved?.status === 'ready' ? (
                        <Tooltip content="This item is no longer available — it may have been deleted, or taken out of play at your table.">
                          <span className="text-xs text-warning">
                            unavailable
                          </span>
                        </Tooltip>
                      ) : resolved?.status === 'failed' ? (
                        <Tooltip content="Its stats could not be loaded just now. The item is still on the sheet — reload to try again.">
                          <span className="text-xs text-ink-subtle">
                            stats unavailable
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-ink-subtle/60">…</span>
                      )}
                    </span>
                  ) : (
                    <Input
                      size="sm"
                      aria-label="Item name"
                      className="min-w-0 flex-1"
                      placeholder="50 ft of rope"
                      value={item.name}
                      onValueChange={v => patch(item.id, { name: v })}
                    />
                  )}

                  <Checkbox
                    size="sm"
                    isSelected={item.equipped}
                    onValueChange={v => patch(item.id, { equipped: v })}
                  >
                    <span className="text-sm text-ink-muted">Equipped</span>
                  </Checkbox>

                  <Checkbox
                    size="sm"
                    isSelected={item.attuned}
                    onValueChange={v => patch(item.id, { attuned: v })}
                  >
                    <span className="text-sm text-ink-muted">
                      Attuned{attunable ? ' *' : ''}
                    </span>
                  </Checkbox>

                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    aria-label={`Remove ${item.name || 'item'}`}
                    className="text-ink-subtle data-[hover=true]:text-danger"
                    onPress={() =>
                      commit(inventory.filter(i => i.id !== item.id))
                    }
                  >
                    <Glyph name="question" size={14} className="rotate-45" />
                  </Button>
                </div>

                {(item.grantedBy || item.notes) && (
                  <p className="mt-1 pl-1 text-xs text-ink-subtle">
                    {[item.grantedBy && `From ${item.grantedBy}`, item.notes]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
