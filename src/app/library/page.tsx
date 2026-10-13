import { LibraryShelf } from '@/@creator/library/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
import {
  listMyPublications,
  listShelf,
  listTakenPublications,
} from '@/server/library';

export const dynamic = 'force-dynamic';

/**
 * The Wandering Library.
 *
 * Collection archetype: the shelf itself leads, so no rule under the title and
 * no card wrapped around it. What is on the shelf is other people's work — the
 * one surface in the app that deliberately shows one account's rows to another.
 */
export default async function LibraryPage() {
  // The page is behind ProtectedRoute, so a reader is signed in; the two
  // lenses beside the shelf are theirs, withdrawn listings included.
  const [initial, mine, taken] = await Promise.all([
    listShelf(),
    listMyPublications().catch(() => []),
    listTakenPublications().catch(() => []),
  ]);

  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <PageHeader
          rule={false}
          title="The Wandering Library"
          description="Everything other tables have left on the shelf. Take what you like — nothing here costs anything."
        />
        <LibraryShelf initial={initial} mine={mine} taken={taken} />
      </PageShell>
    </ProtectedRoute>
  );
}
