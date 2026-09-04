import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CampaignManageForm } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';
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
          rule={false}
          title="Manage the table"
          description="Campaign details, the rules the builder enforces, and how this table ends."
        />
        <Marginalia dash className="mb-5">
          the players never see this page. they will feel it though.
        </Marginalia>
        <CampaignManageForm campaign={campaign} />
      </PageShell>
    </ProtectedRoute>
  );
}
