import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getCharacterAction } from '@/@creator/character/actions';
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
import { PageHeader, PageShell } from '@/@shared/components/ui';
import {
  listSecrets,
  listSheetNotes,
  tableContext,
} from '@/server/sheet-notes';

export const dynamic = 'force-dynamic';

/**
 * A player's own sheet, read-only — the surface their DM's comments land on.
 *
 * The builder at `/creator/character?id=` is for changing the sheet; this is
 * for reading it, so a comment sits beside the thing it is about rather than
 * on top of a form the player is mid-edit in.
 */
export default async function CharacterSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const character = await getCharacterAction(id);
  if (!character) notFound();

  // A character with no table has no notes and no secrets — just the sheet.
  const table = await tableContext(id);
  const [notes, secrets] = table
    ? await Promise.all([listSheetNotes(id), listSecrets(id)])
    : [[], []];

  const slots = table
    ? (Object.fromEntries(
        NOTE_SECTIONS.map(section => [
          section,
          <SectionNotes
            key={section}
            campaignId={table.campaignId}
            characterId={id}
            section={section}
            notes={notes.filter(n => n.section === section)}
            canWrite={false}
          />,
        ])
      ) as Partial<Record<NoteSection, React.ReactNode>>)
    : undefined;

  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <Link
          href="/characters"
          className="mb-2 inline-block text-sm text-ink-muted hover:text-ink"
        >
          ← Your characters
        </Link>
        <PageHeader
          title={character.name || 'Character'}
          description={`Level ${character.level} ${character.class} · ${character.species}`}
          actions={
            // A plain link, not HeroUI's Button: this page is a server
            // component, and HeroUI's button pulls in a client-only context.
            <Link
              href={`/creator/character?id=${id}`}
              className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink hover:border-gold/60"
            >
              Edit the sheet
            </Link>
          }
        />

        <div className="space-y-6">
          <CharacterSheetView sheet={character.sheet} slots={slots} />

          {table && (
            <SecretsLog
              campaignId={table.campaignId}
              characterId={id}
              secrets={secrets}
              canReveal={table.isStaff}
            />
          )}
        </div>
      </PageShell>
    </ProtectedRoute>
  );
}
