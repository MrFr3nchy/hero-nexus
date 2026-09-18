import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';

const SECTIONS = [
  {
    heading: 'What it is',
    body: 'Hero Nexus keeps the moving parts of a tabletop campaign in one place: character sheets, homebrew content, session notes, an initiative tracker, a battle map, and handouts you can push to your players. It targets D&D 5e (2024), with the System Reference Document built in.',
    aside: 'one app, not five browser tabs',
  },
  {
    heading: 'Players build, DMs rule',
    body: 'Anyone can forge a class, a spell, an item or a creature. Nothing forged reaches a table until the DM running it says so — approved, denied, or sent back with notes. What one table publishes, another can take off the shelf.',
    aside: 'and yes, the DM can just say no',
  },
  {
    heading: 'Live at the table',
    body: 'The DM’s screen and every player’s sheet share one stream. A roll lands, a countdown starts, a save is asked for — and it shows up in the corner of whoever it concerns, wherever they are sitting.',
    aside: 'the countdown is the DM’s favorite button',
  },
  {
    heading: 'Where it is',
    body: 'Accounts, the character creator, homebrew, campaigns with invites and DM review, the live screen with initiative and battle maps, and a library for sharing between tables are all in. Signing up is free.',
    aside: 'built in the open, one branch at a time',
  },
];

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        title="Hero Nexus"
        description="A campaign organizer for the whole table."
      />

      <div className="divide-y divide-line">
        {SECTIONS.map(s => (
          <div
            key={s.heading}
            className="grid gap-2 py-6 md:grid-cols-[1fr_14rem] md:gap-8"
          >
            <div>
              <h2 className="font-display text-xl text-ink">{s.heading}</h2>
              <p className="mt-2 leading-relaxed text-ink-muted">{s.body}</p>
            </div>
            <div className="md:pt-9">
              <Marginalia dash>{s.aside}</Marginalia>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
