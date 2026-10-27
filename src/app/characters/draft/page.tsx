import { DraftHero } from '@/@creator/ai/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { BackLink, PageHeader, PageShell } from '@/@shared/components/ui';

export default function DraftCharacterPage() {
  return (
    <ProtectedRoute>
      <PageShell>
        <BackLink href="/characters">Your heroes</BackLink>
        <PageHeader
          rule={false}
          title="Draft a hero"
          description="Describe them, see what the draft holds, then finish it in the builder."
        />
        <DraftHero />
      </PageShell>
    </ProtectedRoute>
  );
}
