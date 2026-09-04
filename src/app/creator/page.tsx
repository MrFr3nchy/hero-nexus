'use client';

import { Button, Link } from '@heroui/react';

import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import {
  Marginalia,
  PageHeader,
  PageShell,
  Seal,
  SheetPreview,
} from '@/@shared/components/ui';

const SAMPLE_SHEET = {
  name: 'Nualla Fenn',
  meta: 'Level 3 · Wood Elf Ranger',
  abilities: { str: 12, dex: 17, con: 13, int: 10, wis: 15, cha: 8 },
  derived: [
    { label: 'Armour Class', value: 15 },
    { label: 'Initiative', value: '+3' },
    { label: 'Proficiency', value: '+2' },
    { label: 'Passive Perception', value: 14 },
  ],
};

function ForgeRow({
  title,
  body,
  cta,
  href,
  fragment,
  flip = false,
}: {
  title: string;
  body: string;
  cta: string;
  href: string;
  fragment: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 py-8 md:grid-cols-2">
      <div className={flip ? 'md:order-2' : undefined}>
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        <p className="mt-3 leading-relaxed text-ink-muted">{body}</p>
        <Button as={Link} href={href} color="primary" className="mt-5">
          {cta}
        </Button>
      </div>
      <div className={flip ? 'md:order-1' : undefined}>{fragment}</div>
    </div>
  );
}

export default function CreatorHubPage() {
  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <PageHeader
          rule={false}
          title="The Forge"
          description="Roll up a hero, or hammer out homebrew for your table."
        />

        <ForgeRow
          title="Character creator"
          body="A full D&D 5e (2024) sheet — abilities, skills, spellcasting, background. Every modifier and DC is worked out as you go; the dice are real when you want them."
          cta="Roll up a character"
          href="/creator/character"
          fragment={
            <SheetPreview
              name={SAMPLE_SHEET.name}
              meta={SAMPLE_SHEET.meta}
              abilities={SAMPLE_SHEET.abilities}
              derived={SAMPLE_SHEET.derived}
            />
          }
        />

        <ForgeRow
          flip
          title="Homebrew creator"
          body="Design custom classes, spells and items. Submit them to a campaign and the DM approves, denies, or sends them back with notes."
          cta="Forge homebrew"
          href="/creator/homebrew"
          fragment={
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 [box-shadow:var(--shadow-card)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-display text-ink">Rimefang</p>
                  <p className="text-sm text-ink-muted">
                    Homebrew longsword · submitted to Whitethorn
                  </p>
                </div>
                <Seal variant="approved" />
              </div>
              <div className="mt-3 border-t border-line pt-3">
                <Marginalia dash>
                  1d8 cold rider is fine at this tier. approved.
                </Marginalia>
              </div>
            </div>
          }
        />
      </PageShell>
    </ProtectedRoute>
  );
}
