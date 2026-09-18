'use client';

import { Accordion, AccordionItem } from '@heroui/react';

import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';

const faqItems = [
  {
    q: 'What is Hero Nexus?',
    a: 'A campaign tool for tabletop RPG groups. Build D&D 5e (2024) characters, design homebrew, and run campaigns — players and DMs sign in to the same table.',
  },
  {
    q: 'Which systems does it support?',
    a: 'D&D 5e (2024) for now. The System Reference Document — classes, species, backgrounds, feats, spells, items and creatures — is built in, and anything else your table wants is homebrew.',
  },
  {
    q: 'How do I share characters and campaigns?',
    a: 'Create a campaign and send the join code, or invite players by email. The DM sees every player’s sheet, reviews the homebrew they submit, and runs the live screen everyone at the table follows.',
  },
  {
    q: 'Can homebrew be shared between tables?',
    a: 'Yes. A DM can publish a campaign’s homebrew to the Library, and any other table can take it off the shelf. It stays the original author’s work; the copy lives with the table that adopted it.',
  },
  {
    q: 'How do I reset my password?',
    a: 'Signed out, use the “Forgot your password?” link on the sign-in page and we will email you a reset link. Signed in, change it from your account page.',
  },
  {
    q: 'Is it free?',
    a: 'Yes. Signing up is free, and there is no paid tier.',
  },
];

export default function FAQPage() {
  return (
    <PageShell>
      <PageHeader
        title="Frequently asked questions"
        description="The short version of how Hero Nexus works."
        rule={false}
      />
      <Accordion selectionMode="multiple" className="px-0">
        {faqItems.map(item => (
          <AccordionItem
            key={item.q}
            title={<span className="font-display text-ink">{item.q}</span>}
          >
            <p className="pb-2 text-sm leading-relaxed text-ink-muted">
              {item.a}
            </p>
          </AccordionItem>
        ))}
      </Accordion>
      <Marginalia dash className="mt-6">
        still stuck? ask your DM. if you are the DM, ask the dice
      </Marginalia>
    </PageShell>
  );
}
