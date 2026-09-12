'use client';

import { useState } from 'react';
import Link from 'next/link';

import {
  CONTENT_TYPE_ORDER,
  contentMeta,
  type ContentEntry,
  type ContentType,
} from '@/@shared/content';
import { StatBlock } from '@/@shared/components/StatBlock';
import {
  Glyph,
  Ledger,
  Marginalia,
  Pill,
  SectionCard,
  Seal,
} from '@/@shared/components/ui';

/**
 * What each field in the Forge means, in the rulebook's voice.
 *
 * Static copy and one fixture — no server module, nothing fetched. The page
 * leads with a finished spell rather than a paragraph about spells (design
 * rule 1): a worked example teaches the shape of the form faster than a field
 * list, and the block on this page is rendered by the same `StatBlock` a DM
 * will see it in.
 */

/**
 * One spell, fully filled in. Deliberately not an SRD row: a homebrew author
 * needs to see what a *complete* submission looks like, and the fields that
 * are easiest to leave blank — the material component, the higher-level line,
 * the class list — are the ones worth showing filled.
 */
const EXAMPLE: ContentEntry = {
  ref: { source: 'homebrew', type: 'spell', key: 'example' },
  type: 'spell',
  name: 'Lantern of the Drowned',
  description:
    'You raise a guttering green light that only the dead can bear to look at. Creatures that have died and returned, and those that never finished dying, are drawn to it against their will.',
  data: {
    level: 3,
    school: 'necromancy',
    casting_time: '1 action',
    range_text: '60 feet',
    duration: 'Concentration, up to 1 minute',
    concentration: true,
    ritual: false,
    verbal: true,
    somatic: true,
    material: true,
    material_specified: 'a drowned sailor’s tooth, which the spell blackens',
    material_consumed: false,
    target_type: 'point',
    saving_throw_ability: 'wisdom',
    attack_roll: false,
    damage_roll: '4d6',
    damage_types: ['necrotic'],
    higher_level:
      'When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.',
    classes: ['Cleric', 'Warlock', 'Wizard'],
  },
};

/** The fields behind the block above, in the order the Forge asks for them. */
const EXAMPLE_FIELDS: { label: string; value: string; note?: string }[] = [
  { label: 'Name', value: 'Lantern of the Drowned' },
  {
    label: 'Description',
    value: 'You raise a guttering green light…',
    note: 'What the spell does, in prose. This is the part your DM reads first.',
  },
  { label: 'Level', value: '3', note: '0 is a cantrip.' },
  { label: 'School', value: 'Necromancy' },
  { label: 'Casting time', value: '1 action' },
  { label: 'Range', value: '60 feet' },
  {
    label: 'Duration',
    value: 'Concentration, up to 1 minute',
    note: 'Tick Concentration as well — the chip comes from the flag, not the words.',
  },
  {
    label: 'Components',
    value: 'V, S, M (a drowned sailor’s tooth)',
    note: 'Name the material. "Consumed" is a separate tick, and it matters.',
  },
  {
    label: 'Save',
    value: 'Wisdom',
    note: 'A spell has a save or an attack roll, rarely both.',
  },
  { label: 'Damage', value: '4d6 necrotic' },
  {
    label: 'At higher levels',
    value: '+1d6 per slot level above 3rd',
    note: 'Leave it empty and the spell simply does not scale.',
  },
  {
    label: 'Classes',
    value: 'Cleric, Warlock, Wizard',
    note: 'Who can have it on their list.',
  },
];

/** What each type is for, and the field people most often get wrong. */
const TYPE_NOTES: Record<ContentType, { forWhat: string; watch: string }> = {
  class: {
    forWhat:
      'A whole career: the hit die, what you are trained in, and the features that arrive as you level.',
    watch:
      'Features carry the levels they are gained at. One feature that comes back three times is one entry with three levels, not three entries.',
  },
  subclass: {
    forWhat:
      'A specialisation inside a class — the choice made at 3rd level in the 2024 rules.',
    watch:
      'Name its parent class. A subclass with no parent hangs off nothing and never appears at a level-up.',
  },
  species: {
    forWhat:
      'What your hero is: size, speed, and the traits they were born with.',
    watch:
      'In the 2024 rules a species grants no ability scores. If yours does, your DM will ask why.',
  },
  background: {
    forWhat:
      'Where they came from: two skills, a tool, an origin feat, and a starting kit.',
    watch:
      'The ability increase is three abilities the player spreads +2/+1 or +1/+1/+1 across. You choose the three; they choose the split.',
  },
  feat: {
    forWhat: 'A talent taken at a level-up, or handed over by a background.',
    watch:
      'Say which category it is. An Origin feat and an Epic Boon are not interchangeable, and the prerequisite is what stops a 1st-level character taking the wrong one.',
  },
  spell: {
    forWhat: 'One spell, from cantrip to 9th level.',
    watch:
      'Fill in the higher-level line. Without it the spell does the same thing in a 9th-level slot as in a 1st.',
  },
  item: {
    forWhat:
      'Gear, weapons, armour and wondrous things — anything that can sit in an inventory.',
    watch:
      'Armour and weapon stats only appear once you set the kind. Attunement is a real flag: a character can hold three attuned items and the sheet counts them.',
  },
  creature: {
    forWhat:
      'Something the party meets: CR, AC, hit points, what it does on its turn.',
    watch:
      'The actions are what the DM rolls from the stat block panel mid-fight. Write the attack line the way the book does — "+5 to hit, 1d8+3 slashing" — and the dice come out right.',
  },
  rule: {
    forWhat:
      'A rule of the table — a potion that always heals its most, a flanking rule, a death save nobody sees.',
    watch:
      'Say what in the book it replaces. "Rules at hand" lists it beside the printed rule, and a DM adopting it wants to know what they are giving up.',
  },
};

function Rule() {
  return <div className="my-10 h-px bg-line" />;
}

/** Copy on one side, a working fragment of the product on the other. */
function Row({
  title,
  children,
  aside,
  flip,
}: {
  title: string;
  children: React.ReactNode;
  aside: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="grid items-start gap-6 md:grid-cols-[1.15fr_1fr]">
      <div className={flip ? 'md:order-2' : undefined}>
        <h2 className="font-display text-xl text-ink">{title}</h2>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-muted">
          {children}
        </div>
      </div>
      <div className={flip ? 'md:order-1' : undefined}>{aside}</div>
    </section>
  );
}

export function HomebrewGuide() {
  const [showFields, setShowFields] = useState(false);

  return (
    <div>
      {/* ---- the object, first ---- */}
      <section className="grid items-start gap-6 lg:grid-cols-[1fr_0.85fr]">
        <SectionCard framed bodyClassName="p-5">
          <StatBlock entry={EXAMPLE} />
        </SectionCard>

        <div>
          <p className="text-sm leading-relaxed text-ink-muted">
            That is a homebrew spell as everyone else will meet it — in the
            compendium, in your DM&apos;s review queue, and on the sheet of
            whoever ends up casting it. The Forge is the form behind it. Nothing
            on this page is a special preview: it is the same renderer.
          </p>

          <Ledger
            className="mt-4"
            items={[
              { value: 7, label: 'kinds of content' },
              { value: 1, label: 'renderer behind all of them' },
              { value: 12, label: 'fields behind the spell on the left' },
            ]}
          />

          <button
            type="button"
            onClick={() => setShowFields(v => !v)}
            aria-expanded={showFields}
            className="mt-5 inline-flex items-center gap-2 rounded-md border border-gold/50 px-3 py-1.5 font-display-alt text-[0.7rem] uppercase tracking-[0.14em] text-gold-strong transition-colors hover:bg-gold/10"
          >
            <Glyph name="quill" size={15} />
            {showFields ? 'Hide the fields' : 'Show the fields behind it'}
          </button>

          {showFields && (
            <dl className="mt-4 space-y-3 border-l border-gold/30 pl-4">
              {EXAMPLE_FIELDS.map(field => (
                <div key={field.label}>
                  <dt className="font-display-alt text-[0.65rem] uppercase tracking-[0.12em] text-ink-subtle">
                    {field.label}
                  </dt>
                  <dd className="text-sm text-ink">{field.value}</dd>
                  {field.note && (
                    <dd className="mt-0.5 text-xs text-ink-muted">
                      {field.note}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          )}

          <Marginalia className="mt-5" dash>
            the tooth is flavour. the 4d6 is not.
          </Marginalia>
        </div>
      </section>

      <Rule />

      {/* ---- the nine ---- */}
      <section>
        <h2 className="font-display text-xl text-ink">The nine kinds</h2>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">
          Pick the kind first. It decides which fields the Forge asks for, and
          changing it later clears the stat fields — your name and description
          survive, the numbers do not.
        </p>

        <ul className="mt-5 divide-y divide-line border-y border-line">
          {CONTENT_TYPE_ORDER.map(type => {
            const meta = contentMeta(type);
            const note = TYPE_NOTES[type];
            return (
              <li
                key={type}
                className="grid gap-3 py-4 sm:grid-cols-[10rem_1fr]"
              >
                <div className="flex items-baseline gap-2">
                  <Glyph name={meta.glyph} size={16} className="text-gold" />
                  <span className="font-display text-base text-ink">
                    {meta.label}
                  </span>
                </div>
                <div className="text-sm leading-relaxed">
                  <p className="text-ink-muted">{note.forWhat}</p>
                  <p className="mt-1 text-ink-subtle">{note.watch}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 max-w-prose text-sm text-ink-muted">
          Every field is optional. A half-finished spell is a normal thing to
          save — name it, come back for the damage later. Nothing is rejected
          for being incomplete; it is only rejected for being malformed, and the
          form will not let you make it malformed.
        </p>
      </section>

      <Rule />

      {/* ---- what the DM sees ---- */}
      <Row
        title="What your DM sees when you submit"
        aside={
          <SectionCard bodyClassName="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <Glyph name="orb" size={15} className="text-gold" />
                <span className="font-display text-base text-ink">
                  Lantern of the Drowned
                </span>
                <Pill tone="arcane">Homebrew</Pill>
              </div>
              <Seal variant="pending" />
            </div>
            <p className="mt-2 text-xs text-ink-subtle">
              3rd level · Necromancy · Concentration · 4d6 necrotic
            </p>
            <div className="mt-3 border-t border-line pt-3 text-xs text-ink-muted">
              The whole stat block sits under this row. Your DM rules on the
              mechanics, not on a name in a list.
            </div>
          </SectionCard>
        }
      >
        <p>
          Exactly what you see: the full stat block, your description, and your
          name on it. Not a title in a queue — a DM who cannot see the damage
          dice cannot say yes to them.
        </p>
        <p>
          A denial needs a reason; the app will not accept one without a note.
          That note comes back to you, and you can fix the piece and send it
          again.
        </p>
        <Marginalia dash>
          &quot;no. the tooth is fine. the 4d6 is not.&quot;
        </Marginalia>
      </Row>

      <Rule />

      {/* ---- how it reaches a table ---- */}
      <Row
        flip
        title="How it gets onto a table"
        aside={
          <SectionCard bodyClassName="p-4">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <Seal variant="pending" showLabel={false} size={18} />
                <span className="text-ink-muted">
                  You submit it. It waits in your DM&apos;s queue.
                </span>
              </li>
              <li className="flex gap-3">
                <Seal variant="approved" showLabel={false} size={18} />
                <span className="text-ink-muted">
                  They approve it. It enters the campaign&apos;s library, and
                  every player at that table can now pick it.
                </span>
              </li>
              <li className="flex gap-3">
                <Seal variant="denied" showLabel={false} size={18} />
                <span className="text-ink-muted">
                  They deny it — or change their mind later. It leaves the
                  library, and characters carrying it stop saving until it is
                  off their sheet.
                </span>
              </li>
            </ol>
          </SectionCard>
        }
      >
        <p>
          Two ways in. You submit yours and your DM approves it, or your DM
          simply adds their own to the library — their content needs nobody
          else&apos;s permission.
        </p>
        <p>
          The library is the whole answer to &quot;may this be used here?&quot;
          A yes puts something in play and a no takes it out, so an approval is
          a decision that actually changes the game rather than a status nobody
          reads.
        </p>
        <p>
          Some tables turn review off entirely. There, anything you bring is in
          play the moment you bring it. Some tables turn homebrew off; there the
          Forge will not offer you the table at all.
        </p>
      </Row>

      <Rule />

      {/* ---- onto a character ---- */}
      <Row
        title="How you put it on a character"
        aside={
          <SectionCard bodyClassName="p-4">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-2">
              <span className="text-sm text-ink">Lantern of the Drowned</span>
              <Pill tone="arcane">Homebrew</Pill>
            </div>
            <div className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-ink">Fireball</span>
              <span className="text-xs text-ink-subtle">SRD</span>
            </div>
            <p className="border-t border-line pt-2 text-xs text-ink-muted">
              One spell list. The source is a label on the row, not a separate
              section.
            </p>
          </SectionCard>
        }
      >
        <p>
          Homebrew sits in the same lists as everything else — the class,
          species and background steps of the builder, the spell list, the
          inventory. It carries a Homebrew mark so you can see where it came
          from, and that is the only difference.
        </p>
        <p>
          Your sheet stores a <em>reference</em>, never a copy. When your DM
          corrects the damage, the correction reaches every character carrying
          it, including yours, without anyone re-adding anything.
        </p>
        <p>
          The other side of that: if a piece leaves the table, your sheet shows
          it as unavailable rather than quietly dropping it, and says so when
          you try to save. Nothing you wrote is lost — the link is what broke,
          not the name.
        </p>
      </Row>

      <Rule />

      <p className="text-sm text-ink-muted">
        <Link
          href="/creator/homebrew"
          className="text-gold-strong underline underline-offset-2"
        >
          Back to the Forge
        </Link>{' '}
        — or read{' '}
        <Link
          href="/library"
          className="text-gold-strong underline underline-offset-2"
        >
          what other people have made
        </Link>
        .
      </p>
    </div>
  );
}
