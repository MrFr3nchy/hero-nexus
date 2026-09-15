'use client';

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@heroui/react';
import { useState } from 'react';

import type { BattleTokenRow } from '@/server/battlemap';
import { updateTokenAction } from '../../battlemap-actions';

/**
 * A combatant's eyes and torch (08): darkvision in feet, and the bright
 * radius of a light they carry. Staff only. Placed with a default off the
 * block or the species; changed here when a feat, a potion or a lantern
 * says otherwise. "Reveal from the party" reads both.
 */
export function SightControls({
  token,
  onDone,
}: {
  token: BattleTokenRow;
  onDone: () => Promise<void> | void;
}) {
  const [vision, setVision] = useState(
    token.visionFeet === null ? '' : String(token.visionFeet)
  );
  const [light, setLight] = useState(
    token.lightFeet === null ? '' : String(token.lightFeet)
  );
  const save = async () => {
    await updateTokenAction(token.id, {
      visionFeet: vision.trim() === '' ? null : Math.trunc(Number(vision)),
      lightFeet: light.trim() === '' ? null : Math.trunc(Number(light)),
    });
    await onDone();
  };
  return (
    <Popover placement="top-end">
      <PopoverTrigger>
        <Button size="sm" variant="flat" className="h-7 min-w-0 px-2.5 text-xs">
          Sight
          {token.visionFeet ? ` · dark ${token.visionFeet}` : ''}
          {token.lightFeet ? ` · torch ${token.lightFeet}` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 border border-line bg-surface p-3">
        <div className="flex w-full flex-col gap-2">
          <Input
            size="sm"
            type="number"
            label="Darkvision, feet"
            placeholder="none"
            min={0}
            max={1000}
            value={vision}
            onValueChange={setVision}
          />
          <Input
            size="sm"
            type="number"
            label="Light carried, feet"
            placeholder="none"
            description="A torch throws 20 bright; a lantern 30."
            min={0}
            max={1000}
            value={light}
            onValueChange={setLight}
          />
          <Button size="sm" color="primary" onPress={save}>
            Keep
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
