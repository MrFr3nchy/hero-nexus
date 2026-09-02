import { JoinCampaignForm } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';

export default async function JoinCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <ProtectedRoute>
      <PageShell width="narrow">
        <PageHeader
          title="Join a campaign"
          description="Enter the join code your DM gave you."
        />
        <JoinCampaignForm initialCode={code} />
      </PageShell>
    </ProtectedRoute>
  );
}
