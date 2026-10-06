import { DdbImport } from '@/@creator/character/components/DdbImport';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { BackLink, PageHeader, PageShell } from '@/@shared/components/ui';

export default function ImportCharacterPage() {
  return (
    <ProtectedRoute>
      <PageShell>
        <BackLink href="/characters">Your heroes</BackLink>
        <PageHeader
          rule={false}
          title="Import from D&D Beyond"
          description="Bring a hero's name, class, scores, hit points, gear and spells across. The rest you finish in the builder."
        />
        <DdbImport />
      </PageShell>
    </ProtectedRoute>
  );
}
