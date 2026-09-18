'use client';

import { Button, Link } from '@heroui/react';
import { type ReactNode, useState } from 'react';

import { useAuth } from '@/@auth/context';
import {
  DeckledEdge,
  Glyph,
  Marginalia,
  Seal,
  SheetPreview,
  StatusMark,
  StatusWord,
  abilityMod,
  statusEdge,
} from '@/@shared/components/ui';

/**
 * Fixture party for the hero roll control. Not in the database — the marketing
 * page shows the artifact (design rule 1) without touching the real character
 * model. Lift/extend freely; five is enough to make the d20 feel alive.
 */
const FIXTURE_HEROES = [
  {
    name: 'Brakka Stormjaw',
    meta: 'Level 5 · Half-Orc Barbarian',
    abilities: { str: 17, dex: 13, con: 16, int: 8, wis: 11, cha: 10 },
    ac: 15,
    prof: '+3',
    saveDc: '—',
    note: 'still bleeding from the bridge',
  },
  {
    name: 'Elowen Duskwhisper',
    meta: 'Level 4 · Wood Elf Druid',
    abilities: { str: 10, dex: 15, con: 14, int: 12, wis: 17, cha: 11 },
    ac: 14,
    prof: '+2',
    saveDc: 15,
    note: "won't stop talking to the crows",
  },
  {
    name: 'Sir Aldric Vane',
    meta: 'Level 6 · Human Paladin',
    abilities: { str: 16, dex: 10, con: 15, int: 9, wis: 12, cha: 16 },
    ac: 18,
    prof: '+3',
    saveDc: 14,
    note: 'took an oath he already half regrets',
  },
  {
    name: 'Pip Underbough',
    meta: 'Level 3 · Halfling Rogue',
    abilities: { str: 8, dex: 17, con: 13, int: 14, wis: 10, cha: 13 },
    ac: 14,
    prof: '+2',
    saveDc: '—',
    note: 'currently holding three things that are not hers',
  },
  {
    name: 'Vashti Emberquill',
    meta: 'Level 5 · Tiefling Sorcerer',
    abilities: { str: 9, dex: 14, con: 13, int: 12, wis: 10, cha: 18 },
    ac: 13,
    prof: '+3',
    saveDc: 16,
    note: 'the scorch marks on the ceiling are load-bearing lore',
  },
];

function derivedFor(hero: (typeof FIXTURE_HEROES)[number]) {
  return [
    { label: 'Armor Class', value: hero.ac },
    { label: 'Initiative', value: abilityMod(hero.abilities.dex) },
    { label: 'Proficiency', value: hero.prof },
    { label: 'Spell save DC', value: hero.saveDc },
  ];
}

function HeroRoll() {
  const [index, setIndex] = useState(0);
  const [spinKey, setSpinKey] = useState(0);
  const hero = FIXTURE_HEROES[index];

  const roll = () => {
    setIndex(i => (i + 1) % FIXTURE_HEROES.length);
    setSpinKey(k => k + 1);
  };

  return (
    <div>
      <div className="relative">
        {/*
          The second sheet, peeking from behind. Sized to the sheet alone —
          it used to be sized to this whole column and lay across the roll
          control below, which put the d20 under a sheet of paper.
        */}
        <div
          aria-hidden="true"
          className="absolute -right-3 -top-3 hidden h-full w-full rotate-3 rounded-[var(--radius-card)] border-2 border-line bg-surface/60 sm:block"
        />
        {/*
          Keyed on the roll so a new hero lands on the desk rather than
          having its numbers swapped in place. Part of the page's one toy,
          not a second one; the keyframe is stilled under reduced motion.
        */}
        <div key={spinKey} className="sheet-land relative -rotate-1">
          <SheetPreview
            name={hero.name}
            meta={hero.meta}
            abilities={hero.abilities}
            derived={derivedFor(hero)}
            note={hero.note}
          />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={roll}
          className="d20-spin flex h-11 w-11 items-center justify-center rounded-md border border-gold/50 bg-surface-2 text-gold [box-shadow:var(--shadow-card)] transition-colors hover:border-gold"
          style={
            spinKey > 0
              ? { animation: 'd20-tumble 0.6s ease-out both' }
              : undefined
          }
          key={spinKey}
          aria-label="Roll a different hero into the sheet"
        >
          <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 1 L14 4.5 L14 11.5 L8 15 L2 11.5 L2 4.5 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M8 1 L8 15 M2 4.5 L14 11.5 M14 4.5 L2 11.5"
              stroke="currentColor"
              strokeWidth="0.8"
              opacity="0.6"
            />
          </svg>
        </button>
        <Marginalia dash>roll for a different chair at the table</Marginalia>
      </div>
    </div>
  );
}

function ReviewRowFragment() {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 [box-shadow:var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-ink">Emberstep Boots</p>
          <p className="text-sm text-ink-muted">
            Homebrew item · submitted by Pip
          </p>
        </div>
        <Seal variant="pending" />
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <Marginalia dash>
          +10 ft. speed is fine. the “ignore difficult terrain” bit is not.
          resubmit.
        </Marginalia>
      </div>
    </div>
  );
}

/**
 * A slice of the DM's screen: the initiative order, in the status language
 * (rule 9) — the reader's own row with the ink bar, the row the table is
 * waiting on with the danger edge. Still: a fragment, not a second toy.
 */
function TableFragment() {
  const rows = [
    { init: 21, name: 'Kestrel Vane', hp: '31/44', kind: 'yours' as const },
    { init: 17, name: 'Brakka Stormjaw', hp: '52/58', kind: null },
    {
      init: 14,
      name: 'Grick, the second one',
      hp: '9/27',
      kind: 'waiting' as const,
    },
    { init: 9, name: 'Pip Underbough', hp: '22/24', kind: null },
  ];
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 [box-shadow:var(--shadow-card)]">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <p className="font-display-alt text-xs tracking-wide text-ink">
          Initiative
        </p>
        <span className="inline-flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.1em] text-success">
          <StatusMark kind="live" size={7} /> round 3
        </span>
      </div>
      <ol className="mt-2 flex flex-col gap-1">
        {rows.map(r => (
          <li
            key={r.name}
            className={`flex items-center gap-3 rounded-[5px] border border-transparent px-2 py-1.5 text-sm ${statusEdge(
              r.kind
            )}`}
          >
            <span className="w-6 shrink-0 font-display text-ink tabular-nums">
              {r.init}
            </span>
            <span
              className={`min-w-0 flex-1 truncate ${
                r.kind === 'yours' ? 'font-semibold text-ink' : 'text-ink-muted'
              }`}
            >
              {r.name}
            </span>
            <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
              {r.hp}
            </span>
            {r.kind && (
              <StatusWord
                kind={r.kind}
                detail={r.kind === 'waiting' ? '· save' : undefined}
              />
            )}
          </li>
        ))}
      </ol>
      <Marginalia dash className="mt-3 !text-base">
        the grick will fail. the grick always fails.
      </Marginalia>
    </div>
  );
}

function PitchRow({
  title,
  body,
  fragment,
  flip = false,
}: {
  title: string;
  body: string;
  fragment: ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 py-10 md:grid-cols-2">
      <div className={flip ? 'md:order-2' : undefined}>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{body}</p>
      </div>
      <div className={flip ? 'md:order-1' : undefined}>{fragment}</div>
    </div>
  );
}

export default function HomePage() {
  const { currentUser } = useAuth();
  return (
    <main className="bg-bg">
      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h1 className="font-display-alt text-4xl leading-tight text-ink sm:text-5xl">
              Keep your whole campaign in one place
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-muted">
              Build characters, organize homebrew, and run sessions for your
              tabletop group — every sheet, every ruling and every roll at one
              table, wherever the players are sitting.
            </p>
            {/*
              Somebody already signed in has a table waiting; asking them to
              register again is a door they have already walked through.
            */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {currentUser ? (
                <Button
                  as={Link}
                  href="/dashboard"
                  color="primary"
                  size="lg"
                  className="font-medium"
                  endContent={<Glyph name="arrow-right" size={16} />}
                >
                  Back to your table
                </Button>
              ) : (
                <>
                  <Button
                    as={Link}
                    href="/register"
                    color="primary"
                    size="lg"
                    className="font-medium"
                  >
                    Begin your chronicle
                  </Button>
                  <Button
                    as={Link}
                    href="/login"
                    variant="bordered"
                    size="lg"
                    className="border-line text-ink"
                  >
                    Sign in
                  </Button>
                </>
              )}
            </div>
            <div className="mt-6">
              <Marginalia dash>
                the dice are real. the modifiers keep up.
              </Marginalia>
            </div>
          </div>

          <HeroRoll />
        </div>
        <DeckledEdge />
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <PitchRow
          title="Homebrew, reviewed"
          body="Design custom classes, spells and items, then submit them to a campaign. The DM approves, denies, or sends them back with notes — and yes, the DM can just say no."
          fragment={<ReviewRowFragment />}
        />
        <PitchRow
          flip
          title="Run the table live"
          body="Initiative, hit points, conditions and the battle map on one screen, kept in step for everyone sitting at it. The DM asks for a save; the player's sheet is the one that answers."
          fragment={<TableFragment />}
        />
      </section>
    </main>
  );
}
