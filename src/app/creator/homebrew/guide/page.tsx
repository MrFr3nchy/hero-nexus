import { HomebrewGuide } from '@/@creator/homebrew/components/HomebrewGuide';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

export const metadata = {
  title: 'Forging homebrew — Hero Nexus',
  description:
    'What each field in the Forge means, what your DM sees, and how homebrew reaches a table.',
};

export default function HomebrewGuidePage() {
  return (
    <ProtectedRoute>
      <PageShell width="full">
        <PageHeader
          rule={false}
          title="Forging homebrew"
          description="What each field means, what your DM sees, and how a thing you made reaches a table."
        />
        <HomebrewGuide />
      </PageShell>
    </ProtectedRoute>
  );
}
