import { PageHeader, PageShell, SectionCard } from '@/@shared/components/ui';

export default function AboutPage() {
  return (
    <PageShell>
      <PageHeader
        title="Hero Nexus"
        description="A campaign organiser you run yourself."
      />

      <div className="space-y-5">
        <SectionCard title="What it is">
          <p className="text-sm leading-relaxed text-ink-muted">
            Hero Nexus keeps the moving parts of a tabletop campaign in one
            place: character sheets, homebrew content, and — as the campaign
            tools land — session notes, an initiative tracker, and handouts you
            can push to your players. It targets D&D 5e (2024), with reference
            data pulled from the open Open5e API.
          </p>
        </SectionCard>

        <SectionCard title="Self-hosted by design">
          <p className="text-sm leading-relaxed text-ink-muted">
            The whole app is a Next.js server plus one SQLite file. There is no
            hosted service, no sign-up anywhere else, and no telemetry. You run
            it on a machine you control, and your table&apos;s data stays there.
          </p>
        </SectionCard>

        <SectionCard title="Status">
          <p className="text-sm leading-relaxed text-ink-muted">
            Phase 1 (accounts, the character creator, homebrew) is in place.
            Phase 2 adds shared campaigns: invites, DM homebrew review, viewing
            player sheets, and live session tools.
          </p>
        </SectionCard>
      </div>
    </PageShell>
  );
}
