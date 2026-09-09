import { HomebrewCreator } from '@/@creator/homebrew/components/HomebrewCreator';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
import { isContentType } from '@/@shared/content';

/**
 * `?type=` and `?id=` are how every `+` on a shelf lands here: the forge opens
 * on the kind you were browsing, or on the thing you asked to edit, rather
 * than on a blank spell form you have to re-pick your way out of.
 */
export default async function HomebrewCreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string }>;
}) {
  const { type, id } = await searchParams;

  return (
    <ProtectedRoute>
      <PageShell width="full">
        <PageHeader
          rule={false}
          title="The Forge"
          description="Design custom classes, spells, items and creatures for your campaigns."
        />
        <HomebrewCreator
          initialType={type && isContentType(type) ? type : undefined}
          initialId={id}
        />
      </PageShell>
    </ProtectedRoute>
  );
}
