import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
import { PrintButton } from '@/@creator/character/components/PrintButton';
import {
  abilityMod,
  armorClass,
  fmtBonus,
  initiative,
  passivePerception,
  proficiencyBonus,
  savingThrow,
  skillBonus,
  spellAttackBonus,
  spellSaveDC,
  weaponAttacks,
} from '@/@creator/character/lib/derive';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  SKILL_ABILITY,
  SKILL_KEYS,
  SKILL_LABELS,
} from '@/@creator/character/schema';
import { parseContentData, refKey } from '@/@shared/content';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { resolveContentRefs } from '@/server/content';

export const dynamic = 'force-dynamic';

/**
 * A character sheet for paper (7a): print it, or "Save as PDF" from the
 * browser's print dialog. No server PDF — a headless browser does not fit
 * on the droplet, and `@media print` already does the job.
 *
 * Every number comes from `lib/derive.ts`, the same functions the sheet and
 * the table use; nothing is worked out a second time here. `.paper` forces
 * the light palette whatever the reader's, and the shell stays out of the
 * way (`ConditionalLayout`).
 *
 * Owner-only, exactly as the play page: `getCharacterAction` is the gate.
 */
export default async function CharacterPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const character = await getCharacterAction(id);
  if (!character) notFound();
  const sheet = character.sheet;

  const resolved = await resolveContentRefs(
    [
      ...sheet.inventory.map(i => i.ref),
      ...sheet.spellcasting.spells.map(s => s.ref),
    ].filter((r): r is NonNullable<typeof r> => r !== null)
  );
  const attacks = weaponAttacks(sheet, resolved);
  const pb = proficiencyBonus(sheet.identity.level);
  const dc = spellSaveDC(sheet);
  const atk = spellAttackBonus(sheet);

  const spells = sheet.spellcasting.spells
    .map(s => {
      const entry = resolved.get(refKey(s.ref));
      const level =
        entry && entry.type === 'spell'
          ? parseContentData('spell', entry.data).level
          : null;
      return {
        name: s.ref.name,
        level,
        prepared: s.prepared || s.alwaysPrepared,
      };
    })
    .sort(
      (a, b) =>
        (a.level ?? 99) - (b.level ?? 99) || a.name.localeCompare(b.name)
    );

  const slots = Object.entries(sheet.spellcasting.slots)
    .map(([key, slot], i) => ({ level: i + 1, key, max: slot.total }))
    .filter(s => s.max > 0);

  const { identity: who, combat } = sheet;
  const coins = Object.entries(sheet.currency).filter(([, n]) => Number(n) > 0);
  const profs = (
    [
      ['Armor', sheet.proficiencies.armor],
      ['Weapons', sheet.proficiencies.weapons],
      ['Tools', sheet.proficiencies.tools],
      ['Languages', sheet.proficiencies.languages],
    ] as const
  ).filter(([, v]) => v.trim());
  const carrying = sheet.inventory.length > 0 || coins.length > 0;

  return (
    <ProtectedRoute>
      <div className="paper-desk">
        <div className="no-print mx-auto flex max-w-[50rem] items-center justify-between gap-3 px-4 py-3">
          <a
            href={`/characters/${id}`}
            className="text-sm text-ink-muted underline-offset-2 hover:underline"
          >
            ← Back to {who.name || 'the sheet'}
          </a>
          <PrintButton />
        </div>

        <article className="paper mx-auto max-w-[50rem] px-8 py-8 text-[11pt] leading-snug">
          <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-ink pb-2">
            <div>
              <h1 className="font-display text-3xl text-ink">
                {who.name || 'Unnamed hero'}
              </h1>
              <p className="text-ink-muted">
                {[
                  `Level ${who.level} ${who.class}${who.subclass ? ` (${who.subclass})` : ''}`,
                  who.species,
                  who.background,
                  who.alignment,
                ]
                  .filter(part => part.trim())
                  .join(' · ')}
              </p>
            </div>
            <p className="text-sm text-ink-muted">
              {who.xp} XP · {who.size}
            </p>
          </header>

          <section className="paper-row mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {[
              ['Armor class', armorClass(sheet, resolved)],
              ['Initiative', fmtBonus(initiative(sheet))],
              ['Speed', `${combat.speed} ft`],
              ['Hit points', combat.hitPointsMax],
              ['Hit dice', `${combat.hitDiceMax}d${combat.hitDieSize}`],
              ['Proficiency', fmtBonus(pb)],
              ['Passive Perc.', passivePerception(sheet)],
              ['Spell DC', dc ?? '—'],
            ].map(([label, value]) => (
              <div key={String(label)} className="paper-box text-center">
                <div className="text-lg font-semibold text-ink">{value}</div>
                <div className="text-[8pt] uppercase tracking-wide text-ink-muted">
                  {label}
                </div>
              </div>
            ))}
          </section>

          <div className="mt-3 grid grid-cols-[11rem_1fr] gap-4">
            <section className="space-y-1.5">
              {ABILITY_KEYS.map(a => (
                <div key={a} className="paper-box flex items-center gap-2">
                  <div className="w-10 text-center text-lg font-semibold text-ink">
                    {fmtBonus(abilityMod(sheet, a))}
                  </div>
                  <div className="flex-1">
                    <div className="text-[8pt] uppercase tracking-wide text-ink-muted">
                      {ABILITY_LABELS[a]}
                    </div>
                    <div className="text-sm text-ink">
                      {sheet.abilities[a].score} · save{' '}
                      {fmtBonus(savingThrow(sheet, a))}
                      {sheet.abilities[a].proficientSave ? ' ●' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section>
              <h2 className="paper-h">Skills</h2>
              <ul className="columns-2 gap-4 text-sm">
                {SKILL_KEYS.map(k => (
                  <li key={k} className="flex break-inside-avoid gap-2">
                    <span className="w-4">{sheet.skills[k] ? '●' : '○'}</span>
                    <span className="w-8 tabular-nums">
                      {fmtBonus(skillBonus(sheet, k))}
                    </span>
                    <span className="text-ink">
                      {SKILL_LABELS[k]}{' '}
                      <span className="text-ink-subtle">
                        ({ABILITY_LABELS[SKILL_ABILITY[k]].slice(0, 3)})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              <h2 className="paper-h mt-3">Attacks</h2>
              {attacks.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing equipped.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[8pt] uppercase tracking-wide text-ink-muted">
                      <th className="font-normal">Weapon</th>
                      <th className="font-normal">To hit</th>
                      <th className="font-normal">Damage</th>
                      <th className="font-normal">Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attacks.map(a => (
                      <tr key={a.itemId} className="border-t border-line">
                        <td className="py-0.5 text-ink">
                          {a.name}
                          {a.mastery ? (
                            <span className="text-ink-subtle">
                              {' '}
                              · {a.mastery}
                            </span>
                          ) : null}
                        </td>
                        <td>{fmtBonus(a.attackBonus)}</td>
                        <td>
                          {a.damage} {a.damageType ?? ''}
                          {a.versatileDamage ? ` (${a.versatileDamage})` : ''}
                        </td>
                        <td>
                          {a.range > 0
                            ? `${a.range}${a.longRange ? `/${a.longRange}` : ''} ft`
                            : 'melee'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          {(profs.length > 0 || carrying) && (
            <section className="mt-3 grid gap-4 sm:grid-cols-2">
              {profs.length > 0 && (
                <div>
                  <h2 className="paper-h">Proficiencies</h2>
                  <dl className="space-y-0.5 text-sm">
                    {profs.map(([k, v]) => (
                      <div key={k}>
                        <dt className="inline text-ink-muted">{k}: </dt>
                        <dd className="inline text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {carrying && (
                <div>
                  <h2 className="paper-h">Equipment</h2>
                  <ul className="text-sm">
                    {sheet.inventory.map(i => (
                      <li key={i.id} className="text-ink">
                        {i.equipped ? '● ' : ''}
                        {i.name}
                        {i.quantity > 1 ? ` ×${i.quantity}` : ''}
                        {i.attuned ? ' (attuned)' : ''}
                      </li>
                    ))}
                  </ul>
                  {coins.length > 0 && (
                    <p className="mt-1 text-sm text-ink-muted">
                      {coins.map(([c, n]) => `${n} ${c}`).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {(spells.length > 0 || dc !== null) && (
            <section className="mt-3 break-inside-avoid">
              <h2 className="paper-h">Spellcasting</h2>
              {dc !== null && (
                <p className="text-sm text-ink">
                  {sheet.spellcasting.ability &&
                    ABILITY_LABELS[sheet.spellcasting.ability]}{' '}
                  · save DC {dc} · attack {fmtBonus(atk ?? 0)}
                  {slots.length > 0 &&
                    ` · slots ${slots.map(s => `${s.level}: ${s.max}`).join(', ')}`}
                </p>
              )}
              <ul className="mt-1 columns-2 gap-4 text-sm">
                {spells.map(s => (
                  <li
                    key={`${s.level}-${s.name}`}
                    className="break-inside-avoid"
                  >
                    <span className="inline-block w-12 text-ink-subtle">
                      {s.level === null
                        ? ''
                        : s.level === 0
                          ? 'Cantrip'
                          : `Lv ${s.level}`}
                    </span>
                    {s.name}
                    {s.prepared ? ' ●' : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(
            [
              ['Class features', sheet.details.classFeatures],
              ['Species traits', sheet.details.speciesTraits],
              ['Feats', sheet.details.feats],
              ['Personality', sheet.details.personality],
              ['Backstory', sheet.details.backstory],
            ] as const
          )
            .filter(([, v]) => v.trim())
            .map(([title, body]) => (
              <section key={title} className="mt-3">
                <h2 className="paper-h">{title}</h2>
                <p className="whitespace-pre-wrap text-sm text-ink">{body}</p>
              </section>
            ))}

          <footer className="mt-4 border-t border-line pt-1 text-[8pt] text-ink-subtle">
            ● proficient, equipped or prepared · Hero Nexus · D&amp;D 5e (2024)
          </footer>
        </article>
      </div>
    </ProtectedRoute>
  );
}
