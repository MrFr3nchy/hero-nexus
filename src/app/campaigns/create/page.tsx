import { CampaignCreationForm } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

export default function CreateCampaignPage() {
  return (
    <ProtectedRoute>
      <PageShell>
        <PageHeader
          eyebrow="New campaign"
          title="Start a campaign"
          description="Set it up, then share the join code with your players."
        />
        <CampaignCreationForm />
      </PageShell>
    </ProtectedRoute>
  );
}
