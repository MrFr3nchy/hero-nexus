import { HomebrewCreator } from '@/@creator/homebrew/components/HomebrewCreator';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

export default function HomebrewCreatorPage() {
  return (
    <ProtectedRoute>
      <PageShell width="full">
        <PageHeader
          rule={false}
          title="The Forge — homebrew"
          description="Design custom classes, spells and items for your campaigns."
        />
        <HomebrewCreator />
      </PageShell>
    </ProtectedRoute>
  );
}
