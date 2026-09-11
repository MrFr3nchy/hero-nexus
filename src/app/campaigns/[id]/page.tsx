import { notFound } from 'next/navigation';

import { auth } from '@/auth';
import { CampaignDetail } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { getCampaign } from '@/server/campaigns';
import { tableAt } from '@/server/session';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign, session] = await Promise.all([getCampaign(id), auth()]);
  if (!campaign || !session?.user?.id) notFound();
  // Which table the campaign is at decides which tab the page opens on. Read
  // here, once, so the strip is right on first paint rather than reordering
  // itself under the reader a moment later.
  const table = await tableAt(id);

  return (
    <ProtectedRoute>
      <CampaignDetail
        campaign={campaign}
        viewerId={session.user.id}
        table={table}
      />
    </ProtectedRoute>
  );
}
