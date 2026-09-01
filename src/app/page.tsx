'use client';

import { Button, Link } from '@heroui/react';
import { Icon } from '@iconify/react';

import { SectionCard } from '@/@shared/components/ui';

const features = [
  {
    icon: 'ph:user-focus-bold',
    title: 'Guided character creation',
    body: 'A full D&D 5e (2024) sheet with abilities, skills, spellcasting and background — modifiers and DCs calculated for you.',
  },
  {
    icon: 'ph:flask-bold',
    title: 'Homebrew, reviewed',
    body: 'Design custom classes, spells and items. Submit them to a campaign and let the DM approve or send them back with notes.',
  },
  {
    icon: 'ph:hard-drives-bold',
    title: 'Yours to host',
    body: 'The database ships with the app as a single SQLite file. Run it on your own box — your table, your data, no accounts elsewhere.',
  },
];

export default function HomePage() {
  return (
    <main className="bg-bg">
      <section className="mx-auto max-w-4xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-gold">
          Self-hosted campaign tool
        </p>
        <h1 className="font-display text-4xl leading-tight text-ink sm:text-6xl">
          Keep your whole campaign
          <br className="hidden sm:block" /> in one place
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
          Build characters, organise homebrew, and run sessions for your
          tabletop group — without handing your game to someone else&apos;s
          cloud.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            as={Link}
            href="/register"
            color="primary"
            size="lg"
            className="font-medium"
          >
            Create an account
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
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="grid gap-5 md:grid-cols-3">
          {features.map(f => (
            <SectionCard key={f.title}>
              <Icon icon={f.icon} width={24} className="mb-3 text-gold" />
              <h3 className="font-display text-lg text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {f.body}
              </p>
            </SectionCard>
          ))}
        </div>
      </section>
    </main>
  );
}
