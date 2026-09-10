'use client';

import { Button, Link, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { PlayCard } from '@/@creator/campaign/components/PlayCard';
import {
  BattlefieldScene,
  EmptyState,
  Marginalia,
  Ribbon,
  SectionCard,
} from '@/@shared/components/ui';
import { ConditionPicker } from '@/@creator/campaign/components/session/ConditionPicker';
import { conditionDef } from '@/@creator/campaign/lib/conditions';
import { setOwnConditionsAction } from '@/@creator/campaign/play-actions';
import type { PlayLoadout, PlayState } from '@/server/play';
import { AttacksSection } from './sections/AttacksSection';
import { LoadoutSection } from './sections/LoadoutSection';
import type { WeaponAttack } from '../lib/derive';

/**
 * A character being *run*, as opposed to built or read.
 *
 * The third surface. `/creator/character` builds a hero and `/characters/[id]`
 * reads one; neither is what a player sits in front of for three hours, which
 * is why inventory management, slot expenditure and prepared spells each ended
 * up on whichever of the two happened to be open when they were written.
 *
 * Almost nothing here is new. `PlayCard` already carried every control and
 * already took `campaignId: string | null`; `applyPlayPatch` already authorises
 * a character's owner before it looks at a campaign at all. What was missing
 * was a page that mounts them with no table in the picture.
 */
export function PlaySurface({
  initial,
  campaign,
  attacks,
  loadout,
}: {
  initial: PlayState;
  /** The table this hero sits at, or null for one that sits at none. */
  campaign: { campaignId: string; name: string } | null;
  /** Derived on the server, where the inventory's content can be resolved. */
  attacks: WeaponAttack[];
  loadout: PlayLoadout;
}) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{error}</span>
          <Button size="sm" variant="light" onPress={() => setError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* The object is the hero (design rule 1): the card that moves the
          numbers leads, and everything explaining it comes after. */}
      <PlayCard
        state={state}
        campaignId={campaign?.campaignId ?? null}
        onChange={setState}
        onError={setError}
      />

      <ConditionsRow
        characterId={state.characterId}
        campaignId={campaign?.campaignId ?? null}
        initial={state.conditions}
        onError={setError}
      />

      <AttacksSection attacks={attacks} />

      <LoadoutSection
        initial={loadout}
        characterId={state.characterId}
        campaignId={campaign?.campaignId ?? null}
        onError={setError}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
        {campaign ? (
          <>
            <Ribbon tone="gold">At the table</Ribbon>
            <Link
              href={`/campaigns/${campaign.campaignId}`}
              className="text-sm text-ink-muted hover:text-ink"
            >
              {campaign.name}
            </Link>
          </>
        ) : (
          <>
            <Ribbon tone="neutral">No table</Ribbon>
            {/* Marginalia is never load-bearing (rule 5): the ribbon beside it
                already says this, in the straight voice. */}
            <Marginalia>rolling for nobody but yourself</Marginalia>
          </>
        )}
        <Link
          href={`/characters/${state.characterId}`}
          className="ml-auto text-sm text-ink-muted hover:text-ink"
        >
          Read the sheet
        </Link>
        <Link
          href={`/creator/character?id=${state.characterId}&intent=level-up`}
          className="text-sm text-ink-muted hover:text-ink"
        >
          Level up
        </Link>
        <Link
          href={`/creator/character?id=${state.characterId}`}
          className="text-sm text-ink-muted hover:text-ink"
        >
          Edit it
        </Link>
      </div>
    </div>
  );
}

/**
 * Shown when a sheet has no hit points on it yet — a draft that never made it
 * out of the builder. Running one is meaningless rather than broken, so this
 * says which door to go back through instead of rendering a card of zeroes.
 */
export function NothingToRun({ characterId }: { characterId: string }) {
  return (
    <EmptyState
      scene={<BattlefieldScene />}
      title="This hero has no fight in them yet"
      description="No hit points, no hit dice — nothing to spend. Finish the build and they'll be ready to run."
      action={
        <Button
          as={Link}
          href={`/creator/character?id=${characterId}`}
          color="primary"
        >
          Back to the builder
        </Button>
      }
    />
  );
}

/**
 * What the character is currently under, and the control that changes it.
 *
 * A player's own route into conditions. Before this the only way to be
 * Poisoned was for a DM to mark it in the initiative tracker, which meant it
 * only existed during a fight and vanished when the fight ended — so a
 * condition that lasts until dawn had nowhere to live overnight.
 *
 * Exhaustion is deliberately not here: it stacks and its sixth level kills
 * you, so it stays the number on `PlayCard` rather than becoming a chip that
 * says "Exhausted" and nothing else.
 */
function ConditionsRow({
  characterId,
  campaignId,
  initial,
  onError,
}: {
  characterId: string;
  campaignId: string | null;
  initial: string[];
  onError: (message: string) => void;
}) {
  const [keys, setKeys] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);

  const commit = async (next: string[]) => {
    const before = keys;
    setKeys(next);
    setBusy(true);
    const res = await setOwnConditionsAction(characterId, campaignId, next);
    setBusy(false);
    if (!res.ok) {
      setKeys(before);
      onError(res.error);
      return;
    }
    setKeys(res.data);
  };

  return (
    <SectionCard
      title="Conditions"
      description="What you are under right now. These outlast the fight they started in."
      actions={
        <div className={busy ? 'pointer-events-none opacity-60' : undefined}>
          <ConditionPicker stored={keys.join(',')} onChange={commit} />
        </div>
      }
    >
      {keys.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing on you. Enjoy it.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {keys.map(key => {
            const def = conditionDef(key);
            if (!def) return null;
            return (
              <Tooltip key={key} content={def.hint}>
                <span
                  className={`rounded-sm border px-2 py-0.5 text-xs uppercase tracking-[0.08em] ${
                    def.tone === 'danger'
                      ? 'border-danger/40 bg-danger/10 text-danger'
                      : 'border-warning/40 bg-warning/10 text-warning'
                  }`}
                >
                  {def.label}
                </span>
              </Tooltip>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
