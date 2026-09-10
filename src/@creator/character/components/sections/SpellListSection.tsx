'use client';

import { Button, Checkbox, Tooltip } from '@heroui/react';
import { useMemo, useState } from 'react';
import type { Control, UseFormSetValue } from 'react-hook-form';
import { useWatch } from 'react-hook-form';

import { Glyph, Pill, SectionCard } from '@/@shared/components/ui';
import { contentChips, parseContentData, refKey } from '@/@shared/content';

import type { CharacterSheet, SheetSpell } from '../../schema';
import type { ResolvedContent } from '../useResolvedContent';
import { ContentPicker } from './ContentPicker';

/**
 * The character's spell list.
 *
 * There was no spell list at all before this — the sheet tracked slot counts
 * and nothing about which spells filled them, so a homebrew spell had nowhere
 * to go. Spells are held by reference, so a DM's correction to a homebrew
 * spell reaches every character who knows it.
 */

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

export function SpellListSection({
  control,
  setValue,
  campaignId,
  resolved,
}: {
  control: Control<CharacterSheet>;
  setValue: UseFormSetValue<CharacterSheet>;
  campaignId?: string;
  /** Stats for the spells on the list, and whether they arrived. */
  resolved?: ResolvedContent;
}) {
  const watched = useWatch({ control, name: 'spellcasting.spells' });
  const spells = useMemo(() => (watched ?? []) as SheetSpell[], [watched]);
  const [picking, setPicking] = useState(false);

  const commit = (next: SheetSpell[]) =>
    setValue('spellcasting.spells', next, {
      shouldDirty: true,
      shouldValidate: true,
    });

  const patch = (key: string, next: Partial<SheetSpell>) =>
    commit(spells.map(s => (refKey(s.ref) === key ? { ...s, ...next } : s)));

  const taken = useMemo(
    () => new Set(spells.map(s => refKey(s.ref))),
    [spells]
  );

  /** Grouped by spell level, the way a spell list is actually read. */
  const byLevel = useMemo(() => {
    const groups = new Map<number, SheetSpell[]>();
    for (const spell of spells) {
      const entry = resolved?.entries.get(refKey(spell.ref));
      const level = entry
        ? parseContentData('spell', entry.data).level
        : // Unresolvable spells sort to the end rather than pretending to be
          // cantrips.
          99;
      const list = groups.get(level) ?? [];
      list.push(spell);
      groups.set(level, list);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [spells, resolved]);

  const preparedCount = spells.filter(
    s => s.prepared && !s.alwaysPrepared
  ).length;

  return (
    <SectionCard
      title="Spells"
      framed
      description="Everything you know. Tick what you have prepared today."
      actions={
        <div className="flex items-center gap-2">
          <Pill>{preparedCount} prepared</Pill>
          <Button size="sm" variant="flat" onPress={() => setPicking(true)}>
            Add a spell
          </Button>
        </div>
      }
    >
      <ContentPicker
        type="spell"
        campaignId={campaignId}
        isOpen={picking}
        taken={taken}
        onClose={() => setPicking(false)}
        onPick={entry =>
          commit([
            ...spells,
            {
              ref: {
                source: entry.ref.source,
                key: entry.ref.key,
                name: entry.name,
                type: 'spell',
              },
              // A cantrip is always available; ticking "prepared" on one is
              // noise, so it starts prepared and stays that way.
              prepared: parseContentData('spell', entry.data).level === 0,
              alwaysPrepared: parseContentData('spell', entry.data).level === 0,
              notes: '',
            },
          ])
        }
      />

      {spells.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No spells yet. Anything from the compendium — or homebrew your DM has
          put in play — can go here.
        </p>
      ) : (
        <div className="space-y-4">
          {byLevel.map(([level, list]) => (
            <div key={level}>
              <h4 className="mb-1 font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-arcane">
                {ORDINAL[level] ?? 'Unavailable'}
              </h4>
              <ul className="space-y-1.5">
                {list.map(spell => {
                  const key = refKey(spell.ref);
                  const entry = resolved?.entries.get(key);
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2"
                    >
                      <Glyph name="orb" size={14} className="text-gold" />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink">{spell.ref.name}</span>
                        {spell.ref.source === 'homebrew' && (
                          <Pill tone="arcane">Homebrew</Pill>
                        )}
                        {/* Three states — see the note in InventorySection. */}
                        {entry ? (
                          <span className="ml-2 text-xs text-ink-subtle">
                            {contentChips(entry).slice(1, 4).join(' · ')}
                          </span>
                        ) : resolved?.status === 'ready' ? (
                          <Tooltip content="This spell is no longer available — it may have been deleted, or taken out of play at your table.">
                            <span className="ml-2 text-xs text-warning">
                              unavailable
                            </span>
                          </Tooltip>
                        ) : resolved?.status === 'failed' ? (
                          <Tooltip content="Its stats could not be loaded just now. The spell is still on the list — reload to try again.">
                            <span className="ml-2 text-xs text-ink-subtle">
                              stats unavailable
                            </span>
                          </Tooltip>
                        ) : (
                          <span className="ml-2 text-xs text-ink-subtle/60">
                            …
                          </span>
                        )}
                      </span>

                      {spell.alwaysPrepared ? (
                        <Pill tone="gold">Always</Pill>
                      ) : (
                        <Checkbox
                          size="sm"
                          isSelected={spell.prepared}
                          onValueChange={v => patch(key, { prepared: v })}
                        >
                          <span className="text-sm text-ink-muted">
                            Prepared
                          </span>
                        </Checkbox>
                      )}

                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={`Remove ${spell.ref.name}`}
                        className="text-ink-subtle data-[hover=true]:text-danger"
                        onPress={() =>
                          commit(spells.filter(s => refKey(s.ref) !== key))
                        }
                      >
                        <Glyph name="x" size={14} />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
