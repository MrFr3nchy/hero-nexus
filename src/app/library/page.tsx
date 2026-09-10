import { LibraryShelf } from '@/@creator/library/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
import { listShelf } from '@/server/library';

export const dynamic = 'force-dynamic';

/**
 * The Wandering Library.
 *
 * Collection archetype: the shelf itself leads, so no rule under the title and
 * no card wrapped around it. What is on the shelf is other people's work — the
 * one surface in the app that deliberately shows one account's rows to another.
 */
export default async function LibraryPage() {
  const initial = await listShelf();

  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <PageHeader
          rule={false}
          title="The Wandering Library"
          description="Everything other tables have left on the shelf. Take what you like — nothing here costs anything."
        />
        <LibraryShelf initial={initial} />
      </PageShell>
    </ProtectedRoute>
  );
}
