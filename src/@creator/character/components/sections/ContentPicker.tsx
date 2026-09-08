'use client';

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';

import { StatBlock } from '@/@shared/components/StatBlock';
import { DiceSpinner, Glyph, Marginalia } from '@/@shared/components/ui';
import {
  contentChips,
  contentMeta,
  refKey,
  type ContentEntry,
  type ContentType,
} from '@/@shared/content';

import { listPickableContentAction } from '../../actions';

/**
 * Pick one piece of content to put on a sheet.
 *
 * The list is SRD plus the player's own homebrew plus whatever the campaign
 * has in play, so approved homebrew shows up here beside a Longsword with no
 * separate flow to learn. The chosen entry is handed back whole; the caller
 * stores a reference to it, never a copy of its stats.
 */
export function ContentPicker({
  type,
  campaignId,
  isOpen,
  onClose,
  onPick,
  /** Refs already on the sheet, greyed out so nothing is added twice. */
  taken = new Set<string>(),
}: {
  type: ContentType;
  campaignId?: string;
  isOpen: boolean;
  onClose: () => void;
  onPick: (entry: ContentEntry) => void;
  taken?: Set<string>;
}) {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<ContentEntry | null>(null);
  const meta = contentMeta(type);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    listPickableContentAction(type, campaignId)
      .then(list => {
        if (!cancelled) setEntries(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, type, campaignId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? entries.filter(e => e.name.toLowerCase().includes(q))
      : entries;
    // A long compendium is unreadable in a modal; the search box is the way
    // through it, so show a workable window rather than all 757 magic items.
    return list.slice(0, 200);
  }, [entries, query]);

  return (
    <Modal isOpen={isOpen} onOpenChange={open => !open && onClose()} size="3xl">
      <ModalContent className="border border-line bg-surface">
        <ModalHeader className="font-display text-lg text-ink">
          Add {meta.label.toLowerCase()}
        </ModalHeader>
        <ModalBody className="pb-6">
          <Input
            size="sm"
            autoFocus
            placeholder={`Search ${meta.plural.toLowerCase()}…`}
            value={query}
            onValueChange={setQuery}
            isClearable
            onClear={() => setQuery('')}
          />

          {loading ? (
            <div className="flex justify-center py-10">
              <DiceSpinner label="Fetching the compendium…" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,17rem)_1fr]">
              <ul className="max-h-[24rem] overflow-y-auto rounded-[var(--radius-card)] border border-line">
                {filtered.map(entry => {
                  const key = refKey(entry.ref);
                  const already = taken.has(key);
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        disabled={already}
                        onMouseEnter={() => setPreview(entry)}
                        onFocus={() => setPreview(entry)}
                        onClick={() => {
                          onPick(entry);
                          onClose();
                        }}
                        className={`flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 ${
                          already
                            ? 'cursor-not-allowed text-ink-subtle/60'
                            : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                        }`}
                      >
                        <span className="truncate">{entry.name}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {entry.ref.source === 'homebrew' && (
                            <span className="font-display-alt text-[0.55rem] uppercase tracking-[0.12em] text-arcane">
                              HB
                            </span>
                          )}
                          {already && (
                            <Glyph
                              name="question"
                              size={12}
                              className="rotate-45 opacity-50"
                            />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && (
                  <li className="px-3 py-4 text-center">
                    <Marginalia>nothing by that name</Marginalia>
                  </li>
                )}
              </ul>

              <div className="max-h-[24rem] overflow-y-auto rounded-[var(--radius-card)] border border-line bg-surface-2/40 p-4">
                {preview ? (
                  <>
                    <StatBlock entry={preview} />
                    <Button
                      className="mt-4"
                      color="primary"
                      size="sm"
                      isDisabled={taken.has(refKey(preview.ref))}
                      onPress={() => {
                        onPick(preview);
                        onClose();
                      }}
                    >
                      {taken.has(refKey(preview.ref))
                        ? 'Already on the sheet'
                        : `Add ${preview.name}`}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-ink-subtle">
                    Hover an entry to read it.
                    {entries.length > filtered.length &&
                      ` Showing ${filtered.length} of ${entries.length} — search to narrow.`}
                  </p>
                )}
              </div>
            </div>
          )}

          {!loading && entries.length > filtered.length && preview && (
            <p className="text-xs text-ink-subtle">
              Showing {filtered.length} of {entries.length}. Search to narrow.
            </p>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/** Compact one-line summary used by the sheet's own lists. */
export function ContentLine({ entry }: { entry: ContentEntry }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-ink">{entry.name}</span>
      <span className="text-xs text-ink-subtle">
        {contentChips(entry).slice(0, 3).join(' · ')}
      </span>
    </span>
  );
}
