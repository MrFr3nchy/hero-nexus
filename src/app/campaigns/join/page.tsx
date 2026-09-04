import { JoinCampaignForm } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';

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
          rule={false}
          title="Join a campaign"
          description="Enter the join code your DM gave you."
        />
        <Marginalia dash className="mb-5">
          eight characters, scrawled on a napkin, probably
        </Marginalia>
        <JoinCampaignForm initialCode={code} />
      </PageShell>
    </ProtectedRoute>
  );
}
