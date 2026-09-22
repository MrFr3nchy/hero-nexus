'use client';

import { Button, Input } from '@heroui/react';
import { useState } from 'react';

import { Glyph, Marginalia } from '@/@shared/components/ui';
import type { FightSpoils } from '@/server/session';
import { awardExperienceAction } from '../../award-actions';
import { addLootAction } from '../../quest-actions';

/**
 * What the fight was worth, said the moment it ends.
 *
 * *End the fight* used to keep the order as a record and stop. The plan
 * already knew the experience and the party size, and the award card was a
 * section away — so the bookkeeping happened next week, or not at all. This
 * is the same two writes, put where the DM already is, while the table is
 * still looking at the bodies.
 *
 * It is a card the DM dismisses, not a modal: a fight can end because
 * everybody has to leave, and a box that must be answered before the app
 * works again is the wrong thing to meet on the way out.
 */
export function AfterTheFight({
  campaignId,
  spoils,
  onDone,
  onError,
}: {
  campaignId: string;
  spoils: FightSpoils;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [xp, setXp] = useState(String(spoils.perCharacter));
  const [loot, setLoot] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const handOut = async () => {
    const each = Math.max(0, Math.trunc(Number(xp) || 0));
    setBusy(true);
    let said = '';

    if (each > 0 && spoils.characterIds.length > 0) {
      const res = await awardExperienceAction(campaignId, {
        kind: 'experience',
        xp: each,
        note: spoils.name,
        characterIds: spoils.characterIds,
      });
      if (!res.ok) {
        setBusy(false);
        onError(res.error);
        return;
      }
      said = `${each} each to ${res.data.granted} ${
        res.data.granted === 1 ? 'hero' : 'heroes'
      }.`;
    }

    if (loot.trim()) {
      const res = await addLootAction(campaignId, { name: loot.trim() });
      if (!res.ok) {
        setBusy(false);
        onError(res.error);
        return;
      }
      said = `${said} ${loot.trim()} is in the loot.`.trim();
      setLoot('');
    }

    setBusy(false);
    setDone(said || 'Nothing handed out.');
  };

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-gold/50 bg-gold/[0.06] p-3">
      <div className="flex items-center gap-2">
        <Glyph name="coins" size={16} className="text-gold" />
        <h3 className="font-display text-sm text-ink">{spoils.name} is over</h3>
        <button
          type="button"
          onClick={onDone}
          className="ml-auto rounded px-1.5 py-0.5 text-xs text-ink-subtle hover:text-ink"
        >
          Later
        </button>
      </div>

      <p className="mt-2 text-sm text-ink-muted">
        {spoils.foes === 0
          ? 'Nothing was fighting you.'
          : `${spoils.foes} ${spoils.foes === 1 ? 'foe' : 'foes'}${
              spoils.standing > 0
                ? `, ${spoils.standing} still standing`
                : ', all down'
            }.`}
        {spoils.experience > 0 && (
          <>
            {' '}
            <span className="text-ink">
              {spoils.experience} XP
              {spoils.partySize > 0
                ? ` · ${spoils.perCharacter} each across ${spoils.partySize}`
                : ''}
            </span>
            .
          </>
        )}
      </p>
      {spoils.incomplete && (
        <p className="mt-0.5 text-xs text-warning">
          Some of them had no block to read, so the total is short. Change the
          number to whatever you meant.
        </p>
      )}

      {done ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-sm text-ink-muted">{done}</p>
          <Button size="sm" variant="flat" onPress={onDone}>
            Done
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Input
            size="sm"
            type="number"
            label="Each"
            aria-label="Experience each"
            className="w-24"
            value={xp}
            onValueChange={setXp}
          />
          <Input
            size="sm"
            label="And they found"
            aria-label="Loot from the fight"
            placeholder="a locked reliquary"
            className="min-w-40 flex-1"
            value={loot}
            onValueChange={setLoot}
          />
          <Button
            size="sm"
            color="primary"
            isDisabled={busy}
            isLoading={busy}
            onPress={handOut}
          >
            Hand it out
          </Button>
        </div>
      )}

      {spoils.partySize === 0 && (
        <Marginalia className="mt-2" dash>
          nobody seated was in the order, so there is nobody to award
        </Marginalia>
      )}
    </div>
  );
}
