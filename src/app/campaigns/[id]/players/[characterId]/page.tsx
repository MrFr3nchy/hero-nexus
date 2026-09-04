import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  CharacterSheetView,
  SecretsLog,
  SectionNotes,
} from '@/@creator/character/components';
import {
  NOTE_SECTIONS,
  type NoteSection,
} from '@/@creator/character/lib/note-sections';
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
import { listSecrets, listSheetNotes } from '@/server/sheet-notes';

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

  const [notes, secrets] = await Promise.all([
    listSheetNotes(characterId),
    listSecrets(characterId),
  ]);

  // One comment thread per sheet section, handed to the sheet as slots.
  const slots = Object.fromEntries(
    NOTE_SECTIONS.map(section => [
      section,
      <SectionNotes
        key={section}
        campaignId={id}
        characterId={characterId}
        section={section}
        notes={notes.filter(n => n.section === section)}
        canWrite
      />,
    ])
  ) as Partial<Record<NoteSection, React.ReactNode>>;

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

        <div className="space-y-6">
          <CharacterSheetView sheet={character.sheet} slots={slots} />

          <SecretsLog
            campaignId={id}
            characterId={characterId}
            secrets={secrets}
            canReveal
          />

          {audit.provenance.length > 0 && (
            <SectionCard
              framed
              title="Creation log"
              description="Every custom value, manual score, and dice roll this player recorded while building the character."
              bodyClassName="border-t-2 border-t-arcane/50"
            >
              {/* Native <details>: this page is a server component, and both
                  logs are reference material — opened on demand, closed by
                  default so the sheet itself stays the page. */}
              <details className="group">
                <summary className="cursor-pointer list-none text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                  <span className="group-open:hidden">
                    Show {audit.provenance.length} entr
                    {audit.provenance.length === 1 ? 'y' : 'ies'}
                  </span>
                  <span className="hidden group-open:inline">Hide</span>
                </summary>
                <ul className="mt-3 space-y-2">
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
              </details>
            </SectionCard>
          )}

          {audit.history.length > 0 && (
            <SectionCard
              framed
              title="History since creation"
              description="Server-recorded changes to the sheet after it was first saved. The player cannot edit this."
              bodyClassName="border-t-2 border-t-gold/50"
            >
              <details className="group">
                <summary className="cursor-pointer list-none text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                  <span className="group-open:hidden">
                    Show {audit.history.length} change
                    {audit.history.length === 1 ? '' : 's'}
                  </span>
                  <span className="hidden group-open:inline">Hide</span>
                </summary>
                <ul className="mt-3 space-y-2">
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
              </details>
            </SectionCard>
          )}
        </div>
      </PageShell>
    </ProtectedRoute>
  );
}
