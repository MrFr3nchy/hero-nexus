'use client';

import { Button, Checkbox, Input, Select, SelectItem } from '@heroui/react';
import { useState } from 'react';

import { Glyph, type GlyphName } from '@/@shared/components/ui';
import { createCanonAction } from '../../canon-actions';
import { createClockAction } from '../../clock-actions';
import { createPlanAction } from '../../encounter-actions';
import {
  CANON_KIND_GLYPHS,
  CANON_KIND_LABELS,
  type CanonKind,
} from '../../lib/canon';
import { CLOCK_SEGMENTS } from '../../lib/clocks';
import { residentsOf } from '../../lib/world';
import { addObjectiveAction, createQuestAction } from '../../quest-actions';
import { createRandomTableAction } from '../../random-table-actions';
import { createShopAction } from '../../shop-actions';
import type { PendingLink } from '../PartyMap';
import { PlacePicker } from './PlacePicker';
import type { Act, World } from './useWorld';

type Kind =
  | 'person'
  | 'shop'
  | 'quest'
  | 'encounter'
  | 'clock'
  | 'place'
  | 'canon'
  | 'random-table';

const KINDS: { key: Kind; label: string; glyph: GlyphName }[] = [
  { key: 'person', label: 'Person', glyph: 'person' },
  { key: 'shop', label: 'Shop', glyph: 'coins' },
  { key: 'quest', label: 'Quest', glyph: 'scroll' },
  { key: 'encounter', label: 'Encounter', glyph: 'crossed-swords' },
  { key: 'clock', label: 'Clock', glyph: 'hourglass' },
  { key: 'place', label: 'Place inside', glyph: 'castle' },
  { key: 'canon', label: 'Canon', glyph: 'tome' },
  { key: 'random-table', label: 'Random table', glyph: 'die' },
];

/** The canon kinds "Canon" offers: the ones the other choices do not. */
const CANON_CHOICES: CanonKind[] = ['faction', 'creature', 'item', 'lore'];

const NOUN: Record<Kind, string> = {
  person: 'Name',
  shop: 'Shop',
  quest: 'Quest',
  encounter: 'Encounter',
  clock: 'Clock',
  place: 'Place',
  canon: 'Title',
  'random-table': 'Random table',
};

/**
 * Add to a place: one sheet, one choice of kind, and whatever is written
 * lands in the place being looked at — no picking it again, because the
 * reader is already standing in it.
 *
 * Every kind writes through the action it always did, with the place set.
 * A quest also takes who handed it out (the people who live here first) and
 * its steps, each somewhere if it needs to be. Everything new is the DM's
 * until shown — "Only you until you show the party".
 */
export function AddToPlace({
  campaignId,
  world,
  placeId: startAt,
  act,
  onClose,
  onOpenPlace,
  onOpenEntry,
  onMarkOnMap,
}: {
  campaignId: string;
  world: World;
  /** Where it lands; null asks. */
  placeId: string | null;
  act: Act;
  onClose: () => void;
  onOpenPlace: (placeId: string) => void;
  onOpenEntry: (entryId: string) => void;
  /** Give the new thing an exact spot on the map in view. */
  onMarkOnMap?: (link: PendingLink) => void;
}) {
  const [placeId, setPlaceId] = useState<string | null>(startAt);
  const place = placeId ? world.byId.get(placeId) : null;
  const [kind, setKind] = useState<Kind>('person');
  const [title, setTitle] = useState('');
  const [canonKind, setCanonKind] = useState<CanonKind>('faction');
  const [segments, setSegments] = useState(6);
  const [onlyYou, setOnlyYou] = useState(true);
  const [giverId, setGiverId] = useState<string | null>(null);
  const [steps, setSteps] = useState<
    { body: string; placeId: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{
    kind: Kind;
    id: string;
    title: string;
  } | null>(null);

  const npcs = (() => {
    const all = world.entries.filter(e => e.kind === 'npc');
    const local = placeId
      ? residentsOf(placeId, world.entries).filter(e => e.kind === 'npc')
      : [];
    const ids = new Set(local.map(e => e.id));
    return [
      ...local,
      ...all
        .filter(e => !ids.has(e.id))
        .sort((a, b) => a.title.localeCompare(b.title)),
    ];
  })();

  const reset = () => {
    setTitle('');
    setGiverId(null);
    setSteps([]);
    setError(null);
  };

  const write = async (another: boolean) => {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    const visibility = onlyYou ? 'dm' : 'shared';
    let res: { ok: true; data: { id: string } } | { ok: false; error: string };
    switch (kind) {
      case 'person':
        res = await createCanonAction(campaignId, {
          kind: 'npc',
          title: name,
          dmBody: '',
          partyBody: '',
          visibility,
          placeId,
        });
        break;
      case 'place':
        res = await createCanonAction(campaignId, {
          kind: 'location',
          title: name,
          dmBody: '',
          partyBody: '',
          visibility,
          placeId,
        });
        break;
      case 'canon':
        res = await createCanonAction(campaignId, {
          kind: canonKind,
          title: name,
          dmBody: '',
          partyBody: '',
          visibility,
          placeId,
        });
        break;
      case 'shop':
        res = await createShopAction(campaignId, {
          name,
          visibility,
          placeId,
        });
        break;
      case 'quest': {
        res = await createQuestAction(campaignId, {
          title: name,
          visibility,
          placeId,
          giverId,
        });
        if (res.ok) {
          for (const step of steps.filter(s => s.body.trim())) {
            const r = await addObjectiveAction(
              res.data.id,
              step.body,
              'shared',
              step.placeId
            );
            if (!r.ok) setError(r.error);
          }
        }
        break;
      }
      case 'encounter':
        res = await createPlanAction(campaignId, { name, placeId });
        break;
      case 'clock':
        res = await createClockAction(campaignId, {
          title: name,
          segments,
          visibility,
          placeId,
        });
        break;
      case 'random-table':
        res = await createRandomTableAction(campaignId, { title: name });
        break;
    }
    setBusy(false);
    await act(Promise.resolve(res));
    if (!res.ok) {
      setError(res.error);
      return;
    }
    reset();
    if (another) setMade(null);
    else setMade({ kind, id: res.data.id, title: name });
  };

  const placeName = place?.title || 'the world';
  const visibilityApplies = kind !== 'encounter' && kind !== 'random-table';

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 pb-3 pt-4 @md:px-5">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Glyph name="plus" size={13} />
            New, in {placeName}
          </p>
          <h3 className="font-display text-2xl leading-tight text-ink">
            Add to {placeName}
          </h3>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label="Close"
          onPress={onClose}
        >
          <Glyph name="x" size={16} />
        </Button>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4 @md:px-5">
        {made ? (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              <span className="font-medium">{made.title}</span> — written into{' '}
              {placeName}.
            </p>
            <div className="flex flex-wrap gap-2">
              {onMarkOnMap &&
                (made.kind === 'person' ||
                  made.kind === 'place' ||
                  made.kind === 'canon' ||
                  made.kind === 'quest' ||
                  made.kind === 'encounter') && (
                  <Button
                    size="sm"
                    variant="flat"
                    startContent={<Glyph name="target" size={13} />}
                    onPress={() =>
                      onMarkOnMap({
                        kind:
                          made.kind === 'quest'
                            ? 'quest'
                            : made.kind === 'encounter'
                              ? 'encounter'
                              : 'place',
                        id: made.id,
                        label: made.title,
                      })
                    }
                  >
                    Mark the spot
                  </Button>
                )}
              {(made.kind === 'person' ||
                made.kind === 'place' ||
                made.kind === 'canon') && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() =>
                    made.kind === 'place'
                      ? onOpenPlace(made.id)
                      : onOpenEntry(made.id)
                  }
                >
                  Open it
                </Button>
              )}
              <Button size="sm" variant="light" onPress={() => setMade(null)}>
                Add another
              </Button>
              <Button size="sm" variant="light" onPress={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label="What to add"
              className="grid grid-cols-4 gap-2"
            >
              {KINDS.map(k => {
                const lit = k.key === kind;
                return (
                  <button
                    key={k.key}
                    type="button"
                    role="radio"
                    aria-checked={lit}
                    onClick={() => {
                      setKind(k.key);
                      setError(null);
                    }}
                    className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 text-center text-xs ${
                      lit
                        ? 'border-2 border-gold-strong bg-surface font-medium text-ink dark:border-gold'
                        : 'border-line bg-bg text-ink-muted hover:border-ink-subtle hover:text-ink'
                    }`}
                  >
                    <Glyph
                      name={k.glyph}
                      size={18}
                      className={lit ? 'text-gold-strong dark:text-gold' : ''}
                    />
                    {k.label}
                  </button>
                );
              })}
            </div>

            {kind === 'canon' && (
              <Select
                size="md"
                label="What it is"
                labelPlacement="outside"
                selectedKeys={[canonKind]}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  if (key) setCanonKind(String(key) as CanonKind);
                }}
              >
                {CANON_CHOICES.map(k => (
                  <SelectItem key={k} textValue={CANON_KIND_LABELS[k]}>
                    <span className="flex items-center gap-2">
                      <Glyph name={CANON_KIND_GLYPHS[k]} size={13} />
                      {CANON_KIND_LABELS[k]}
                    </span>
                  </SelectItem>
                ))}
              </Select>
            )}

            <Input
              size="md"
              label={NOUN[kind]}
              labelPlacement="outside"
              placeholder={
                kind === 'random-table'
                  ? `${place?.title || 'Tavern'} names`
                  : kind === 'person'
                    ? 'Sister Hollis'
                    : kind === 'quest'
                      ? 'Find the drowned bell'
                      : ''
              }
              value={title}
              onValueChange={setTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') void write(false);
              }}
            />

            {kind === 'random-table' ? (
              <p className="text-xs text-ink-muted">
                A random table belongs to the whole campaign, not to one place;
                name it for {placeName} and roll it from any of its people.
              </p>
            ) : (
              <PlacePicker
                entries={world.entries}
                value={placeId}
                onChange={setPlaceId}
                label={kind === 'quest' ? 'Where it starts' : 'Where it is'}
                nowhere="Not placed yet"
                size="md"
              />
            )}

            {kind === 'clock' && (
              <Select
                size="md"
                label="Segments"
                labelPlacement="outside"
                selectedKeys={[String(segments)]}
                onSelectionChange={keys => {
                  const key = Array.from(keys)[0];
                  if (key) setSegments(Number(key));
                }}
              >
                {CLOCK_SEGMENTS.map(s => (
                  <SelectItem key={String(s)} textValue={`${s} segments`}>
                    {s} segments
                  </SelectItem>
                ))}
              </Select>
            )}

            {kind === 'quest' && (
              <>
                {npcs.length > 0 && (
                  <Select
                    size="md"
                    label="Who hands it out"
                    labelPlacement="outside"
                    placeholder="Nobody in the canon"
                    selectedKeys={giverId ? [giverId] : []}
                    onSelectionChange={keys => {
                      const key = Array.from(keys)[0];
                      setGiverId(key ? String(key) : null);
                    }}
                  >
                    {npcs.map(n => (
                      <SelectItem key={n.id} textValue={n.title || 'Somebody'}>
                        <span className="flex items-center justify-between gap-2">
                          {n.title || 'Somebody'}
                          {placeId && n.placeId === placeId && (
                            <span className="text-xs text-ink-subtle">
                              lives in {placeName}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </Select>
                )}
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-ink">Steps, each somewhere</p>
                  {steps.map((step, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <span className="flex h-10 w-6 items-center justify-center text-xs tabular-nums text-ink-muted">
                        {i + 1}
                      </span>
                      <Input
                        size="md"
                        aria-label={`Step ${i + 1}`}
                        value={step.body}
                        onValueChange={v =>
                          setSteps(s =>
                            s.map((x, j) => (j === i ? { ...x, body: v } : x))
                          )
                        }
                        className="min-w-40 flex-1"
                      />
                      <PlacePicker
                        entries={world.entries}
                        value={step.placeId}
                        onChange={v =>
                          setSteps(s =>
                            s.map((x, j) =>
                              j === i ? { ...x, placeId: v } : x
                            )
                          )
                        }
                        label=""
                        nowhere="Wherever the quest is"
                        size="md"
                        className="w-44"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setSteps(s => [...s, { body: '', placeId: null }])
                    }
                    className="flex min-h-10 w-full items-center gap-2 rounded-[10px] border border-dashed border-line px-3 text-sm text-ink-muted hover:border-gold hover:text-ink"
                  >
                    <Glyph name="plus" size={14} />
                    Another step
                  </button>
                </div>
              </>
            )}

            {visibilityApplies && (
              <label className="status-hatch flex cursor-pointer items-center gap-3 rounded-[10px] border border-dotted border-arcane/60 px-3 py-2.5 text-sm">
                <Checkbox
                  size="sm"
                  isSelected={onlyYou}
                  onValueChange={setOnlyYou}
                  aria-label="Only you until you show the party"
                />
                <span className="flex-1">
                  <span className="font-medium">Only you</span> until you show
                  the party
                </span>
                <Glyph name="eye-off" size={15} className="text-arcane" />
              </label>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button
                size="md"
                color="primary"
                className="flex-1"
                isDisabled={!title.trim()}
                isLoading={busy}
                onPress={() => write(false)}
              >
                {kind === 'random-table'
                  ? 'Write it'
                  : `Write it into ${placeName}`}
              </Button>
              <Button
                size="md"
                variant="flat"
                isDisabled={!title.trim() || busy}
                onPress={() => write(true)}
              >
                Write it and add another
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
