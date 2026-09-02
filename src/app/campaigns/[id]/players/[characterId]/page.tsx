import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CharacterSheetView } from '@/@creator/character/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import {
  PageHeader,
  PageShell,
  Ribbon,
  SectionCard,
} from '@/@shared/components/ui';
import {
  getCharacterAuditForCampaign,
  getCharacterForCampaign,
} from '@/server/characters';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  field: 'Custom field',
  'stat-manual': 'Manual score',
  'stat-roll': 'Dice roll',
  'stat-pointbuy': 'Point buy',
  'stat-standard': 'Standard array',
  method: 'Method',
  homebrew: 'Homebrew',
};

const HISTORY_KIND_LABEL: Record<string, string> = {
  identity: 'Identity',
  level: 'Level',
  ability: 'Ability',
  method: 'Method',
  homebrew: 'Homebrew',
  downtime: 'Downtime',
  other: 'Change',
};

export default async function CampaignPlayerSheetPage({
  params,
}: {
  params: Promise<{ id: string; characterId: string }>;
}) {
  const { id, characterId } = await params;

  let character;
  let audit;
  try {
    character = await getCharacterForCampaign(id, characterId);
    audit = await getCharacterAuditForCampaign(id, characterId);
  } catch {
    notFound();
  }
  if (!character || !audit) notFound();

  const fmtWhen = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  };

  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <Link
          href={`/campaigns/${id}`}
          className="mb-2 inline-block text-sm text-ink-muted hover:text-ink"
        >
          ← Campaign
        </Link>
        <PageHeader
          title={character.name || 'Character'}
          description={`Level ${character.level} ${character.class} · ${character.species} · read-only`}
          actions={
            character.hasHomebrew ? (
              <Ribbon tone="arcane">Homebrew</Ribbon>
            ) : undefined
          }
        />

        {audit.provenance.length > 0 && (
          <SectionCard
            framed
            title="Creation log"
            description="Every custom value, manual score, and dice roll this player recorded while building the character."
            bodyClassName="border-t-2 border-t-arcane/50"
          >
            <ul className="space-y-2">
              {audit.provenance.map(e => (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="mt-0.5 shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle">
                    {KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  <span className="flex-1 text-ink-muted">
                    {e.detail || e.label}
                    {e.rolls && (
                      <span className="ml-1 text-ink-subtle tabular-nums">
                        [{e.rolls.join(', ')}]
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {audit.history.length > 0 && (
          <SectionCard
            framed
            title="History since creation"
            description="Server-recorded changes to the sheet after it was first saved. The player cannot edit this."
            bodyClassName="border-t-2 border-t-gold/50"
          >
            <ul className="space-y-2">
              {audit.history.map(e => (
                <li
                  key={e.id}
                  className="flex items-start gap-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm"
                >
                  <span className="mt-0.5 shrink-0 rounded-sm border border-line px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.1em] text-ink-subtle">
                    {HISTORY_KIND_LABEL[e.kind] ?? e.kind}
                  </span>
                  <span className="flex-1 text-ink-muted">
                    {e.detail}
                    <span className="ml-1 text-ink-subtle">
                      · {fmtWhen(e.occurredAt)}
                      {e.actorName ? ` · ${e.actorName}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        <CharacterSheetView sheet={character.sheet} />
      </PageShell>
    </ProtectedRoute>
  );
}
