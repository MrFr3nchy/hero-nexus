'use client';

import {
  Button,
  Input,
  NumberInput,
  Select,
  SelectItem,
  Textarea,
} from '@heroui/react';
import { useState } from 'react';

import { ControlRow, Glyph } from '@/@shared/components/ui';
import { createCanonAction } from '../../canon-actions';
import type { RandomTableRow } from '../../lib/random-tables';
import {
  pluckIntoPlaceAction,
  strikeEntryAction,
} from '../../random-table-actions';
import { TableDie, type Drawn } from './TableDie';
import type { Act } from './useWorld';

/**
 * Somebody who lives here, in four fields: the DM at the table who needs a
 * name for the stable hand *now*, and the DM at home filling a district.
 *
 * Each field has a die beside it that rolls on one of the DM's random
 * tables. A name rolled and kept is struck through on its table, so the
 * next stable hand is somebody else; a name rolled and then rewritten is
 * the DM's own, and strikes nothing.
 */
export function QuickNpc({
  campaignId,
  placeId,
  placeName,
  tables,
  act,
  onError,
  onMade,
}: {
  campaignId: string;
  placeId: string;
  placeName: string;
  tables: RandomTableRow[];
  act: Act;
  onError: (message: string) => void;
  /** The new NPC, to open it. */
  onMade?: (entryId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const [role, setRole] = useState('');
  const [personality, setPersonality] = useState('');
  const [voice, setVoice] = useState('');
  const [busy, setBusy] = useState(false);

  const [fillFrom, setFillFrom] = useState<string | null>(null);
  const [fillCount, setFillCount] = useState(3);

  const reset = () => {
    setName('');
    setDrawn(null);
    setRole('');
    setPersonality('');
    setVoice('');
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await createCanonAction(campaignId, {
      kind: 'npc',
      title: name.trim(),
      dmBody: '',
      partyBody: '',
      placeId,
      fields: { role, personality, voice },
    });
    if (!res.ok) {
      setBusy(false);
      onError(res.error);
      return;
    }
    // Kept as rolled: strike it, so the table does not offer it again.
    if (drawn && drawn.text === name.trim()) {
      await act(
        strikeEntryAction(drawn.tableId, drawn.index, drawn.text, res.data.id)
      );
    } else {
      await act(Promise.resolve({ ok: true }));
    }
    setBusy(false);
    reset();
    onMade?.(res.data.id);
  };

  const left = (t: RandomTableRow) => t.entries.filter(e => !e.struck).length;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="flat"
          startContent={<Glyph name="plus" size={13} />}
          onPress={() => setOpen(true)}
        >
          Someone who lives here
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-arcane/40 bg-surface-2/50 p-3">
      <form
        className="space-y-2"
        onSubmit={e => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-end gap-2">
          <Input
            size="sm"
            label="Name"
            labelPlacement="outside"
            placeholder="Durnan"
            value={name}
            onValueChange={setName}
            className="flex-1"
            autoFocus
          />
          <TableDie
            tables={tables}
            purpose="npc-name"
            label="Roll a name"
            onError={onError}
            onDrawn={d => {
              setDrawn(d);
              setName(d.text);
            }}
          />
        </div>
        <Input
          size="sm"
          label="Role"
          labelPlacement="outside"
          placeholder="Innkeeper, fence, harbourmaster…"
          value={role}
          onValueChange={setRole}
        />
        <div className="flex items-end gap-2">
          <Textarea
            size="sm"
            minRows={1}
            label="Personality"
            labelPlacement="outside"
            placeholder="Gruff, kind underneath, hates bards"
            value={personality}
            onValueChange={setPersonality}
            className="flex-1"
          />
          <TableDie
            tables={tables}
            purpose="npc-personality"
            label="Roll a personality"
            onError={onError}
            onDrawn={d =>
              setPersonality(p =>
                p.trim() ? `${p.trim()}; ${d.text}` : d.text
              )
            }
          />
        </div>
        <div className="flex items-end gap-2">
          <Input
            size="sm"
            label="Voice & mannerisms"
            labelPlacement="outside"
            placeholder="Slow, low, taps the bar twice"
            value={voice}
            onValueChange={setVoice}
            className="flex-1"
          />
          <TableDie
            tables={tables}
            purpose="npc-voice"
            label="Roll a voice"
            onError={onError}
            onDrawn={d => setVoice(d.text)}
          />
        </div>
        <ControlRow size="sm">
          <Button
            color="primary"
            type="submit"
            isDisabled={!name.trim() || busy}
          >
            They live in {placeName || 'this place'}
          </Button>
          <Button
            variant="light"
            onPress={() => {
              reset();
              setOpen(false);
            }}
          >
            Done
          </Button>
        </ControlRow>
        <p className="text-xs text-ink-subtle">
          Only you can see them until you show the party.
        </p>
      </form>

      {tables.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-subtle">
            Fill this place
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              size="sm"
              label="Names from"
              labelPlacement="outside"
              placeholder="A random table"
              className="min-w-44 flex-1"
              selectedKeys={fillFrom ? [fillFrom] : []}
              onSelectionChange={keys => {
                const key = Array.from(keys)[0];
                setFillFrom(key ? String(key) : null);
              }}
            >
              {tables.map(t => (
                <SelectItem
                  key={t.id}
                  textValue={t.title}
                  isDisabled={left(t) === 0}
                >
                  {t.title}
                  <span className="ml-2 text-xs text-ink-subtle">
                    {left(t)} left
                  </span>
                </SelectItem>
              ))}
            </Select>
            <NumberInput
              size="sm"
              label="How many"
              labelPlacement="outside"
              minValue={1}
              maxValue={20}
              value={fillCount}
              onValueChange={v => setFillCount(Number(v) || 1)}
              className="w-28"
            />
            <Button
              size="sm"
              variant="flat"
              isDisabled={!fillFrom || busy}
              onPress={async () => {
                if (!fillFrom) return;
                setBusy(true);
                await act(pluckIntoPlaceAction(fillFrom, placeId, fillCount));
                setBusy(false);
              }}
            >
              Roll them in
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">
            Each name rolled becomes someone who lives here, not met yet, and is
            struck off its table.
          </p>
        </div>
      )}
    </div>
  );
}
