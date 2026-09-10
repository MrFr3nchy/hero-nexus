import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PublicationDetail } from '@/@creator/library/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
import { getPublication } from '@/server/library';

export const dynamic = 'force-dynamic';

/**
 * One listing.
 *
 * Resolves whatever its status: a withdrawn or unlisted publication still has
 * to open for the readers who already took it, and for the author deciding
 * whether to put it back. Only the shelf filters.
 */
export default async function PublicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPublication(id);
  if (!detail) notFound();

  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <p className="mb-3 text-sm text-ink-muted">
          <Link href="/library" className="hover:text-ink">
            ← The Wandering Library
          </Link>
        </p>
        <PageHeader
          rule={false}
          title={detail.card.title}
          description={`Left on the shelf by ${detail.card.credit}.`}
        />
        <PublicationDetail detail={detail} />
      </PageShell>
    </ProtectedRoute>
  );
}
