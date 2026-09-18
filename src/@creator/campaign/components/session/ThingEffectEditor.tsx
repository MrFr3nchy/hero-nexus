'use client';

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectItem,
  Tooltip,
} from '@heroui/react';
import { useState } from 'react';

import { useLitArea } from '@/@shared/battlemap/area';
import {
  edgeKey,
  MATERIALS,
  type TerrainDoc,
  type ThingChange,
  type ThingEffect,
} from '@/@shared/battlemap/types';
import { CONDITIONS } from '@/@creator/campaign/lib/conditions';
import { ABILITY_KEYS, ABILITY_LABELS } from '@/@creator/character/schema';
import { Marginalia, Glyph } from '@/@shared/components/ui';
import type { BattleTokenRow } from '@/server/battlemap';
import { setThingEffectAction } from '../../battlemap-actions';

const FRESH: ThingEffect = {
  trigger: 'operate',
  repeat: 'once',
  triggers: 'anyone',
  changes: [],
};

/** The common ones in one tap. Tiles come from the lit area when they need some. */
const PRESETS: {
  key: string;
  label: string;
  hint: string;
  build: (tiles: number[]) => ThingEffect;
}[] = [
  {
    key: 'pit',
    label: 'Spike pit',
    hint: 'Stepped on, once: 2d10 piercing, DEX 15 for half, the floor becomes rubble. Hidden at DC 15.',
    build: tiles => ({
      trigger: 'enter',
      repeat: 'once',
      triggers: 'party',
      findDc: 15,
      changes: [
        {
          kind: 'damage',
          area: tiles,
          dice: '2d10',
          type: 'piercing',
          save: { ability: 'dexterity', dc: 15, effect: 'half' },
        },
        {
          kind: 'material',
          tiles,
          to: Math.max(
            0,
            MATERIALS.findIndex(m => m.key === 'rubble')
          ),
        },
        { kind: 'sound', text: 'The floor gives way onto spikes.' },
      ],
    }),
  },
  {
    key: 'portcullis',
    label: 'Portcullis lever',
    hint: 'Pulled, toggles: every wall in the lit tiles goes, and comes back on the next pull.',
    build: () => ({
      trigger: 'operate',
      repeat: 'toggle',
      triggers: 'anyone',
      changes: [
        { kind: 'sound', text: 'Chains rattle; the portcullis rises.' },
      ],
    }),
  },
  {
    key: 'collapse',
    label: 'Collapsing floor',
    hint: 'Destroyed, once: the lit tiles drop 10 ft and are revealed.',
    build: tiles => ({
      trigger: 'destroy',
      repeat: 'once',
      triggers: 'anyone',
      changes: [
        { kind: 'elevation', tiles, to: -10 },
        { kind: 'reveal', tiles },
        { kind: 'sound', text: 'The floor collapses in a roar of dust.' },
      ],
    }),
  },
];

function describe(c: ThingChange): string {
  switch (c.kind) {
    case 'material':
      return `${c.tiles.length} tiles → ${MATERIALS[c.to]?.name ?? 'nothing'}`;
    case 'elevation':
      return `${c.tiles.length} tiles → ${c.to} ft`;
    case 'wall':
      return `wall ${c.edge} → ${c.to}${c.open ? ' (open)' : ''}`;
    case 'thing':
      return `another thing → ${c.to}`;
    case 'reveal':
      return `reveal ${c.tiles.length} tiles`;
    case 'damage':
      return `${c.dice} ${c.type} on ${c.area.length} tiles${
        c.save
          ? ` · ${ABILITY_LABELS[c.save.ability as keyof typeof ABILITY_LABELS] ?? c.save.ability} DC ${c.save.dc} ${c.save.effect}`
          : ''
      }`;
    case 'condition':
      return `${c.condition} on ${c.area.length} tiles${c.rounds ? ` · ${c.rounds} rounds` : ''}${
        c.save ? ` · save DC ${c.save.dc}` : ''
      }`;
    case 'sound':
      return `“${c.text}”`;
  }
}

/**
 * What a thing does when it is used (08). Staff only, in the thing's
 * inspector. Pick the trigger and how often; add changes — the floor, the
 * height, the walls in an area, a reveal, damage or a condition on whoever
 * stands there, a line in the feed. Tiles come from the board's Area tool:
 * light the tiles, then add the change, and it lands on them. Presets fill
 * the common shapes in one tap.
 */
export function ThingEffectEditor({
  campaignId,
  token,
  terrain,
  onDone,
}: {
  campaignId: string;
  token: BattleTokenRow;
  terrain: TerrainDoc | null;
  onDone: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<ThingEffect>(token.effect ?? FRESH);
  const [error, setError] = useState<string | null>(null);
  const [material, setMaterial] = useState(1);
  const [dice, setDice] = useState('2d6');
  const [type, setType] = useState('fire');
  const [saveAbility, setSaveAbility] = useState('dexterity');
  const [dc, setDc] = useState(13);
  const [condition, setCondition] = useState('prone');
  const [sound, setSound] = useState('');
  const lit = useLitArea(campaignId);
  const tiles = lit?.tiles ?? [];

  const add = (c: ThingChange) =>
    setDraft(d => ({ ...d, changes: [...d.changes, c] }));
  const remove = (i: number) =>
    setDraft(d => ({ ...d, changes: d.changes.filter((_, j) => j !== i) }));

  /** Every wall standing on a lit tile, as its edge key. */
  const wallsInLit = (): string[] => {
    if (!terrain) return [];
    const set = new Set(tiles);
    return terrain.walls
      .filter(w => set.has(w.y * terrain.w + w.x))
      .map(w => edgeKey(w.x, w.y, w.side));
  };

  const save = async (effect: ThingEffect | null) => {
    const res = await setThingEffectAction(token.id, effect);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    await onDone();
  };

  const needTiles = tiles.length === 0;

  return (
    <Popover placement="top-end">
      <PopoverTrigger>
        <Button size="sm" variant="flat" className="h-7 min-w-0 px-2.5 text-xs">
          {token.effect ? `Does · ${token.effect.trigger}` : 'When it is used…'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 border border-line bg-surface p-3">
        <div className="flex w-full flex-col gap-2 text-sm">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map(p => (
              <Tooltip key={p.key} content={p.hint}>
                <Button
                  size="sm"
                  variant="flat"
                  className="h-6 min-w-0 px-2 text-xs"
                  onPress={() => {
                    const built = p.build(tiles);
                    if (p.key === 'portcullis') {
                      built.changes = [
                        ...wallsInLit().map(
                          edge =>
                            ({ kind: 'wall', edge, to: 'none' }) as ThingChange
                        ),
                        ...built.changes,
                      ];
                    }
                    setDraft(built);
                  }}
                >
                  {p.label}
                </Button>
              </Tooltip>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Select
              size="sm"
              label="When"
              className="w-32"
              selectedKeys={[draft.trigger]}
              onSelectionChange={k => {
                const v = String(Array.from(k)[0] ?? 'operate');
                setDraft(d => ({ ...d, trigger: v as ThingEffect['trigger'] }));
              }}
            >
              <SelectItem key="operate" textValue="Used">
                Used
              </SelectItem>
              <SelectItem key="enter" textValue="Stepped on">
                Stepped on
              </SelectItem>
              <SelectItem key="damage" textValue="Struck">
                Struck
              </SelectItem>
              <SelectItem key="destroy" textValue="Destroyed">
                Destroyed
              </SelectItem>
            </Select>
            <Select
              size="sm"
              label="How often"
              className="w-28"
              selectedKeys={[draft.repeat]}
              onSelectionChange={k => {
                const v = String(Array.from(k)[0] ?? 'once');
                setDraft(d => ({ ...d, repeat: v as ThingEffect['repeat'] }));
              }}
            >
              <SelectItem key="once" textValue="Once">
                Once
              </SelectItem>
              <SelectItem key="toggle" textValue="Toggles">
                Toggles
              </SelectItem>
              <SelectItem key="always" textValue="Every time">
                Every time
              </SelectItem>
            </Select>
            {draft.trigger === 'enter' && (
              <Select
                size="sm"
                label="Set off by"
                className="w-28"
                selectedKeys={[draft.triggers]}
                onSelectionChange={k => {
                  const v = String(Array.from(k)[0] ?? 'anyone');
                  setDraft(d => ({
                    ...d,
                    triggers: v as ThingEffect['triggers'],
                  }));
                }}
              >
                <SelectItem key="anyone" textValue="Anyone">
                  Anyone
                </SelectItem>
                <SelectItem key="party" textValue="The party">
                  The party
                </SelectItem>
                <SelectItem key="foe" textValue="Foes">
                  Foes
                </SelectItem>
              </Select>
            )}
            <Input
              size="sm"
              type="number"
              label="Hidden, DC"
              placeholder="seen"
              className="w-24"
              min={1}
              max={40}
              value={draft.findDc ? String(draft.findDc) : ''}
              onValueChange={v =>
                setDraft(d => {
                  const n = Math.trunc(Number(v));
                  const { findDc: _dc, ...rest } = d;
                  void _dc;
                  return n > 0 ? { ...rest, findDc: n } : rest;
                })
              }
            />
          </div>

          <ul className="divide-y divide-line rounded-md border border-line">
            {draft.changes.length === 0 && (
              <li className="px-2 py-1.5 text-xs text-ink-subtle">
                Nothing yet. Light tiles with the Area tool — or grab a box with
                Select in the workshop — then add a change.
              </li>
            )}
            {draft.changes.map((c, i) => (
              <li key={i} className="flex items-center gap-2 px-2 py-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {describe(c)}
                </span>
                <button
                  type="button"
                  aria-label="Remove this change"
                  onClick={() => remove(i)}
                  className="text-ink-subtle hover:text-danger"
                >
                  <Glyph name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>

          <div className="text-xs text-ink-subtle">
            {needTiles ? (
              <Marginalia dash>
                light tiles with the Area tool, or grab a box in the workshop,
                to aim a change
              </Marginalia>
            ) : (
              `${tiles.length} lit tiles`
            )}
          </div>

          <div className="flex flex-wrap items-end gap-1.5">
            <Select
              size="sm"
              aria-label="Floor becomes"
              className="w-28"
              selectedKeys={[String(material)]}
              onSelectionChange={k =>
                setMaterial(Number(Array.from(k)[0] ?? 1))
              }
            >
              {MATERIALS.map((m, i) => (
                <SelectItem key={String(i)} textValue={m.name}>
                  {m.name}
                </SelectItem>
              ))}
            </Select>
            <Button
              size="sm"
              variant="flat"
              className="h-7 min-w-0 px-2 text-xs"
              isDisabled={needTiles}
              onPress={() => add({ kind: 'material', tiles, to: material })}
            >
              Floor
            </Button>
            <Button
              size="sm"
              variant="flat"
              className="h-7 min-w-0 px-2 text-xs"
              isDisabled={needTiles}
              onPress={() => add({ kind: 'elevation', tiles, to: -10 })}
            >
              Drop 10 ft
            </Button>
            <Button
              size="sm"
              variant="flat"
              className="h-7 min-w-0 px-2 text-xs"
              isDisabled={needTiles}
              onPress={() => add({ kind: 'reveal', tiles })}
            >
              Reveal
            </Button>
            <Button
              size="sm"
              variant="flat"
              className="h-7 min-w-0 px-2 text-xs"
              isDisabled={wallsInLit().length === 0}
              onPress={() =>
                wallsInLit().forEach(edge =>
                  add({ kind: 'wall', edge, to: 'none' })
                )
              }
            >
              Walls go
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-1.5">
            <Input
              size="sm"
              aria-label="Damage dice"
              className="w-20 font-mono"
              value={dice}
              onValueChange={setDice}
            />
            <Input
              size="sm"
              aria-label="Damage type"
              className="w-24"
              value={type}
              onValueChange={setType}
            />
            <Select
              size="sm"
              aria-label="Save"
              className="w-28"
              selectedKeys={[saveAbility]}
              onSelectionChange={k =>
                setSaveAbility(String(Array.from(k)[0] ?? 'dexterity'))
              }
            >
              {ABILITY_KEYS.map(a => (
                <SelectItem key={a} textValue={ABILITY_LABELS[a]}>
                  {ABILITY_LABELS[a]}
                </SelectItem>
              ))}
            </Select>
            <Input
              size="sm"
              type="number"
              aria-label="DC"
              className="w-16"
              value={String(dc)}
              onValueChange={v => setDc(Math.trunc(Number(v)) || 10)}
            />
            <Button
              size="sm"
              variant="flat"
              className="h-7 min-w-0 px-2 text-xs"
              isDisabled={needTiles || !dice.trim()}
              onPress={() =>
                add({
                  kind: 'damage',
                  area: tiles,
                  dice: dice.trim(),
                  type: type.trim() || 'bludgeoning',
                  save: { ability: saveAbility, dc, effect: 'half' },
                })
              }
            >
              Damage
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-1.5">
            <Select
              size="sm"
              aria-label="Condition"
              className="w-32"
              selectedKeys={[condition]}
              onSelectionChange={k =>
                setCondition(String(Array.from(k)[0] ?? 'prone'))
              }
            >
              {CONDITIONS.map(c => (
                <SelectItem key={c.key} textValue={c.label}>
                  {c.label}
                </SelectItem>
              ))}
            </Select>
            <Button
              size="sm"
              variant="flat"
              className="h-7 min-w-0 px-2 text-xs"
              isDisabled={needTiles}
              onPress={() =>
                add({
                  kind: 'condition',
                  area: tiles,
                  condition,
                  rounds: null,
                  save: { ability: saveAbility, dc },
                })
              }
            >
              Condition
            </Button>
            <Input
              size="sm"
              aria-label="A line for the feed"
              placeholder="Chains rattle…"
              className="min-w-32 flex-1"
              value={sound}
              onValueChange={setSound}
            />
            <Button
              size="sm"
              variant="flat"
              className="h-7 min-w-0 px-2 text-xs"
              isDisabled={!sound.trim()}
              onPress={() => {
                add({ kind: 'sound', text: sound.trim() });
                setSound('');
              }}
            >
              Say
            </Button>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex items-center gap-2">
            <Button size="sm" color="primary" onPress={() => save(draft)}>
              Keep
            </Button>
            {token.effect && (
              <Button
                size="sm"
                variant="light"
                className="text-ink-subtle"
                onPress={() => save(null)}
              >
                Does nothing
              </Button>
            )}
            {token.effect?.spent && (
              <span className="ml-auto text-xs text-ink-subtle">spent</span>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
