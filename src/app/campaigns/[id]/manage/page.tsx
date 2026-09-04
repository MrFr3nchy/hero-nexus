import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CampaignManageForm } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
import { getCampaign } from '@/server/campaigns';

export const dynamic = 'force-dynamic';

export default async function ManageCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  if (campaign.role !== 'gm' && campaign.role !== 'co-gm') notFound();

  return (
    <ProtectedRoute>
      <PageShell>
        <Link
          href={`/campaigns/${id}`}
          className="mb-2 inline-block text-sm text-ink-muted hover:text-ink"
        >
          ← {campaign.name}
        </Link>
        <PageHeader
          title="Manage the table"
          description="Campaign details, status, and the join code."
        />
        <CampaignManageForm campaign={campaign} />
      </PageShell>
    </ProtectedRoute>
  );
}
