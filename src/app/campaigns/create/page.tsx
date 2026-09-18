import { CampaignCreationForm } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';

export default function CreateCampaignPage() {
  return (
    <ProtectedRoute>
      <PageShell>
        <PageHeader
          rule={false}
          title="Start a campaign"
          description="Name it and go, or settle every rule now. Everything below the name starts at the book and can change later from Manage."
        />
        <Marginalia dash className="mb-5">
          the name can change later. the party rarely lets you forget the first
          one.
        </Marginalia>
        <CampaignCreationForm />
      </PageShell>
    </ProtectedRoute>
  );
}
