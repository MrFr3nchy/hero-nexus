'use client';

import {
  Accordion,
  AccordionItem,
  Button,
  Input,
  Select,
  SelectItem,
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { StatBlock } from '@/@shared/components/StatBlock';
import {
  DiceSpinner,
  EmptyState,
  Glyph,
  Pill,
  SectionCard,
  TomeScene,
  useConfirm,
} from '@/@shared/components/ui';
import {
  CONTENT_TYPE_ORDER,
  contentChips,
  contentMeta,
  type ContentType,
} from '@/@shared/content';
import type { LibraryEntry } from '@/server/campaign-content';
import type { HomebrewRow } from '@/server/homebrew';

import {
  addCampaignContentAction,
  listCampaignContentAction,
  listMyHomebrewAction,
  removeCampaignContentAction,
} from '../content-actions';

/**
 * What homebrew is in play at this table.
 *
 * Every member reads it — a player who cannot see the content at their own
 * table cannot build a character with it — so unlike the canon panel there is
 * no DM-only half to hide. Staff get the add and remove controls; everyone
 * gets the same stat blocks.
 */

const SOURCE_LABEL: Record<LibraryEntry['source'], string> = {
  'gm-authored': 'From the DM',
  'approved-submission': 'Approved',
};

/**
 * The body of one shelf row.
 *
 * Deliberately NOT the `AccordionItem` itself. HeroUI's Accordion is a
 * react-aria collection: it builds its children by calling
 * `getCollectionNode` on each child's element *type*, which only
 * `AccordionItem` carries. A component that merely returns an `AccordionItem`
 * has no such static, and the collection builder threw
 * `TypeError: i.getCollectionNode is not a function` — taking the whole
 * campaign page down with it. The crash needed a non-empty shelf to fire,
 * which is why it survived until a table actually had content on it.
 */
function EntryBody({
  item,
  isStaff,
  onRemove,
}: {
  item: LibraryEntry;
  isStaff: boolean;
  onRemove: (item: LibraryEntry) => void;
}) {
  return (
    <div className="space-y-4 pb-2">
      {item.note && (
        <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">At this table: </span>
          {item.note}
        </p>
      )}
      <StatBlock entry={item.entry} headless />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-xs text-ink-subtle">
          Added by {item.addedByName ?? 'someone since departed'}
        </p>
        {isStaff && (
          <Button
            size="sm"
            variant="light"
            className="text-ink-muted data-[hover=true]:text-danger"
            onPress={() => onRemove(item)}
          >
            Take out of play
          </Button>
        )}
      </div>
    </div>
  );
}

/** The title row of one shelf entry. */
function entryTitle(item: LibraryEntry) {
  const meta = contentMeta(item.entry.type);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Glyph name={meta.glyph} size={16} className="text-gold" />
      <span className="font-display text-ink">{item.entry.name}</span>
      <Pill tone={item.source === 'gm-authored' ? 'gold' : 'success'}>
        {SOURCE_LABEL[item.source]}
      </Pill>
    </span>
  );
}

export function CampaignContentPanel({
  campaignId,
  isStaff,
}: {
  campaignId: string;
  isStaff: boolean;
}) {
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [mine, setMine] = useState<HomebrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string>('');
  const [note, setNote] = useState('');
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [library, own] = await Promise.all([
        listCampaignContentAction(campaignId),
        isStaff ? listMyHomebrewAction() : Promise.resolve([]),
      ]);
      setItems(library);
      setMine(own);
    } catch {
      setError('Failed to load the content library.');
    } finally {
      setLoading(false);
    }
  }, [campaignId, isStaff]);

  useEffect(() => {
    load();
  }, [load]);

  /** Only what is not already on the table — re-adding is a no-op anyway. */
  const addable = useMemo(() => {
    const inPlay = new Set(items.map(i => i.entry.ref.key));
    return mine.filter(h => !inPlay.has(h.id));
  }, [items, mine]);

  /** Grouped so a shelf of forty items still reads as a shelf. */
  const grouped = useMemo(() => {
    const byType = new Map<ContentType, LibraryEntry[]>();
    for (const item of items) {
      const list = byType.get(item.entry.type) ?? [];
      list.push(item);
      byType.set(item.entry.type, list);
    }
    return CONTENT_TYPE_ORDER.filter(t => byType.has(t)).map(type => ({
      type,
      entries: byType.get(type)!,
    }));
  }, [items]);

  const add = async () => {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const res = await addCampaignContentAction(campaignId, pick, note.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPick('');
    setNote('');
    await load();
  };

  const remove = async (item: LibraryEntry) => {
    const ok = await confirm({
      title: `Take ${item.entry.name} out of play?`,
      body: 'Characters at this table that use it will stop validating against the table rules. The submission and its decision are kept.',
      confirmLabel: 'Take it out',
      destructive: true,
    });
    if (!ok) return;
    const res = await removeCampaignContentAction(campaignId, item.id);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  return (
    <div className="space-y-6">
      {dialog}

      {isStaff && (
        <SectionCard
          title="Put something on the table"
          description="Your own homebrew, available to everyone here. A player's submission arrives on this shelf when you approve it."
        >
          {addable.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {mine.length === 0
                ? 'You have not forged anything yet — the Forge is under Creator.'
                : 'Everything you have forged is already on this table.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Select
                size="sm"
                label="Content"
                className="sm:max-w-xs"
                selectedKeys={pick ? [pick] : []}
                onSelectionChange={keys =>
                  setPick(String(Array.from(keys)[0] ?? ''))
                }
              >
                {addable.map(h => (
                  <SelectItem key={h.id} textValue={h.name}>
                    <span className="flex items-center gap-2">
                      <Glyph name={contentMeta(h.type).glyph} size={14} />
                      {h.name}
                      <span className="text-ink-subtle">
                        {contentMeta(h.type).label}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </Select>
              <Input
                size="sm"
                label="Note for the party (optional)"
                value={note}
                onValueChange={setNote}
                placeholder="Only the smith in Vellum sells these."
              />
              <Button
                color="primary"
                size="sm"
                isDisabled={!pick}
                isLoading={busy}
                onPress={add}
              >
                Add
              </Button>
            </div>
          )}
          {error && (
            <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard
        title={`In play (${items.length})`}
        description={
          isStaff
            ? 'Everyone at this table can read these.'
            : 'Homebrew your DM has allowed at this table.'
        }
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <DiceSpinner label="Reading the shelf…" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            scene={<TomeScene />}
            title="Nothing homebrewed here yet"
            description={
              isStaff
                ? 'Add your own content above, or approve a player submission in the Homebrew tab.'
                : 'Your DM has not put any homebrew on this table. Anything you submit appears here once approved.'
            }
          />
        ) : (
          <div className="space-y-5">
            {grouped.map(group => (
              <div key={group.type}>
                <h3 className="mb-1 font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold/80">
                  {contentMeta(group.type).plural}
                </h3>
                <Accordion selectionMode="multiple" className="px-0">
                  {group.entries.map(item => (
                    <AccordionItem
                      key={item.id}
                      textValue={item.entry.name}
                      title={entryTitle(item)}
                      subtitle={
                        <span className="text-xs text-ink-subtle">
                          {contentChips(item.entry).join(' · ')}
                        </span>
                      }
                    >
                      <EntryBody
                        item={item}
                        isStaff={isStaff}
                        onRemove={remove}
                      />
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
