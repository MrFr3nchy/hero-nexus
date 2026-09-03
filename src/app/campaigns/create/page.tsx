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
          description="Set it up, then share the join code with your players."
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
