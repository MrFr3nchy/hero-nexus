'use client';

import { Button, Link } from '@heroui/react';
import { Icon } from '@iconify/react';

import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell, SectionCard } from '@/@shared/components/ui';

const options = [
  {
    icon: 'ph:sword-bold',
    title: 'Character creator',
    body: 'Build a full D&D 5e (2024) character sheet — abilities, skills, spellcasting and background. Modifiers and DCs are calculated for you.',
    href: '/creator/character',
    cta: 'Create a character',
  },
  {
    icon: 'ph:flask-bold',
    title: 'Homebrew creator',
    body: 'Design custom classes, spells and items. Submit them to a campaign for your DM to review.',
    href: '/creator/homebrew',
    cta: 'Create homebrew',
  },
];

export default function CreatorHubPage() {
  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <PageHeader
          eyebrow="Creator"
          title="Make something"
          description="Forge a new hero, or design homebrew content for your table."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {options.map(o => (
            <SectionCard key={o.title}>
              <Icon icon={o.icon} width={24} className="mb-3 text-gold" />
              <h2 className="font-display text-lg text-ink">{o.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                {o.body}
              </p>
              <Button
                as={Link}
                href={o.href}
                color="primary"
                className="mt-4 w-full"
              >
                {o.cta}
              </Button>
            </SectionCard>
          ))}
        </div>
      </PageShell>
    </ProtectedRoute>
  );
}
