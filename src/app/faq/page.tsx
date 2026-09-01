'use client';

import { Accordion, AccordionItem } from '@heroui/react';

import { PageHeader, PageShell, SectionCard } from '@/@shared/components/ui';

const faqItems = [
  {
    q: 'What is Hero Nexus?',
    a: 'A self-hosted tool for tabletop RPG groups. Build D&D 5e (2024) characters, design homebrew, and run campaigns — the app and its database live on your own server.',
  },
  {
    q: 'Where is my data stored?',
    a: 'In a single SQLite file that ships with the app (data/hero-nexus.db). Nothing is sent to a third party. Back it up by copying that file.',
  },
  {
    q: 'Which systems does it support?',
    a: 'D&D 5e (2024) for now. Reference data (classes, species, spells, items) is synced from the free Open5e API into your local database.',
  },
  {
    q: 'Can I share characters and campaigns?',
    a: 'Yes — invite players to a campaign and they can join. The DM can review submitted homebrew and see players’ character sheets. (Campaign features are rolling out in Phase 2.)',
  },
  {
    q: 'How do I reset my password?',
    a: 'There is no email on a self-hosted instance. Change it from Account → Settings while signed in, or ask whoever runs the instance.',
  },
  {
    q: 'Is it free?',
    a: 'Yes. You host it yourself; there is no paid tier and no accounts anywhere else.',
  },
];

export default function FAQPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Help"
        title="Frequently asked questions"
        description="The short version of how Hero Nexus works."
      />
      <SectionCard>
        <Accordion selectionMode="multiple" className="px-0">
          {faqItems.map(item => (
            <AccordionItem
              key={item.q}
              title={<span className="font-medium text-ink">{item.q}</span>}
            >
              <p className="pb-2 text-sm leading-relaxed text-ink-muted">
                {item.a}
              </p>
            </AccordionItem>
          ))}
        </Accordion>
      </SectionCard>
    </PageShell>
  );
}
