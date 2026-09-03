import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';

const SECTIONS = [
  {
    heading: 'What it is',
    body: 'Hero Nexus keeps the moving parts of a tabletop campaign in one place: character sheets, homebrew content, session notes, an initiative tracker, and handouts you can push to your players. It targets D&D 5e (2024), with reference data pulled from the open Open5e API.',
    aside: 'one app, not five browser tabs',
  },
  {
    heading: 'Self-hosted by design',
    body: 'The whole app is a Next.js server plus one SQLite file. There is no hosted service, no sign-up anywhere else, and no telemetry. You run it on a machine you control, and your table’s data stays there.',
    aside: 'back it up by copying one file',
  },
  {
    heading: 'Where it is',
    body: 'Phase 1 — accounts, the character creator, homebrew — is in place. Phase 2 adds shared campaigns: invites, DM homebrew review, viewing player sheets, and live session tools.',
    aside: 'built in the open, one branch at a time',
  },
];

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        title="Hero Nexus"
        description="A campaign organiser you run yourself."
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
