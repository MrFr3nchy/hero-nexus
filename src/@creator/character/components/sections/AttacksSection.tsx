'use client';

import { Tooltip } from '@heroui/react';

import { useDiceTray } from '@/@shared/components/dice';
import { Glyph, Pill, SectionCard } from '@/@shared/components/ui';
import { fmtBonus, type WeaponAttack } from '../../lib/derive';

/**
 * What the character can swing, and what it comes to.
 *
 * The sheet had no attacks block at all: a player read the longsword off their
 * inventory list and did the arithmetic in their head every round. The numbers
 * were all derivable — the item carries damage dice, damage type, range and
 * `is_simple` — except for the one that decides whether the proficiency bonus
 * applies, which was a sentence.
 *
 * Rolling goes through the dice tray, which is the app's one roll surface and
 * is explicitly exempt from the one-toy-per-page rule (design rule 4).
 */
export function AttacksSection({
  attacks,
  /** Held while the sheet's content is still resolving. */
  loading = false,
}: {
  attacks: WeaponAttack[];
  loading?: boolean;
}) {
  const tray = useDiceTray();

  const roll = (attack: WeaponAttack, damage: string | null) => {
    if (damage) {
      void tray.rollNotation(damage, {
        title: `${attack.name} — damage`,
        hint: attack.damageType ?? undefined,
      });
      return;
    }
    void tray.rollNotation(`1d20${fmtBonus(attack.attackBonus)}`, {
      title: `${attack.name} — attack`,
      hint: attack.proficient ? 'proficient' : 'not proficient',
    });
  };

  return (
    <SectionCard
      title="Attacks"
      description="Everything you have equipped. Tap a number to roll it."
    >
      {loading ? (
        <p className="text-sm text-ink-subtle">Looking up what you carry…</p>
      ) : attacks.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Nothing equipped. Tick a weapon in your inventory and it will show up
          here with its numbers worked out.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {attacks.map(attack => (
            <li
              key={attack.itemId}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-line bg-surface px-3 py-2"
            >
              <Glyph name="sword" size={14} className="text-gold" />
              {/*
                `basis-full` at narrow widths, so the name owns its own line
                rather than being squeezed by the pills and numbers beside it.
                A flex-1 truncate here rendered a longsword as "Longs…", which
                is the one thing on the row a reader has to be able to read.
              */}
              <span className="basis-full text-ink sm:basis-auto sm:flex-1">
                {attack.name}
              </span>

              {/*
                A non-proficient weapon is shown, not hidden. An equipped
                weapon vanishing from the sheet with nothing to say why is the
                worse failure, and the bonus it *does* get is still real.
              */}
              {!attack.proficient && (
                <Tooltip content="You are not proficient with this weapon, so your proficiency bonus is not added.">
                  <span>
                    <Pill tone="warning">Not proficient</Pill>
                  </span>
                </Tooltip>
              )}

              {attack.mastery && (
                <Tooltip
                  content={`${attack.mastery} — this weapon's 2024 mastery property.`}
                >
                  <span>
                    <Pill tone="arcane">{attack.mastery}</Pill>
                  </span>
                </Tooltip>
              )}

              <button
                type="button"
                onClick={() => roll(attack, null)}
                aria-label={`Roll ${attack.name} attack`}
                className="rounded border border-line px-2 py-0.5 text-sm tabular-nums text-ink transition-colors hover:border-gold"
              >
                {fmtBonus(attack.attackBonus)}
              </button>

              {attack.damage && (
                <button
                  type="button"
                  onClick={() => roll(attack, attack.damage)}
                  aria-label={`Roll ${attack.name} damage`}
                  className="rounded border border-line px-2 py-0.5 text-sm tabular-nums text-ink-muted transition-colors hover:border-gold hover:text-ink"
                >
                  {attack.damage}
                </button>
              )}

              {attack.versatileDamage && (
                <Tooltip content="Two-handed damage — this weapon is Versatile.">
                  <button
                    type="button"
                    onClick={() => roll(attack, attack.versatileDamage)}
                    aria-label={`Roll ${attack.name} two-handed damage`}
                    className="rounded border border-dashed border-line px-2 py-0.5 text-sm tabular-nums text-ink-subtle transition-colors hover:border-gold hover:text-ink"
                  >
                    {attack.versatileDamage}
                  </button>
                </Tooltip>
              )}

              <span className="text-xs text-ink-subtle">
                {attack.damageType ?? ''}
                {attack.range > 0 &&
                  ` · ${attack.range}${attack.longRange ? `/${attack.longRange}` : ''} ft`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
