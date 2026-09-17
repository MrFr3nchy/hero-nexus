import { notFound, redirect } from 'next/navigation';

import { WorkshopShelf } from '@/@creator/campaign/components/workshop/WorkshopShelf';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { auth } from '@/auth';
import { listBattleMaps } from '@/server/battlemap';
import { getCampaign, requireCampaignRole } from '@/server/campaigns';

export const dynamic = 'force-dynamic';

/**
 * The workshop's shelf: every board the campaign has, and a new one. The
 * board on the table opens straight away when there is one and nothing
 * else to choose between.
 */
export default async function WorkshopIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign, session] = await Promise.all([getCampaign(id), auth()]);
  if (!campaign || !session?.user?.id) notFound();
  const staff = await requireCampaignRole(id, ['gm', 'co-gm']).then(
    () => true,
    () => false
  );
  if (!staff) redirect(`/campaigns/${id}/screen`);
  const boards = await listBattleMaps(id);
  const active = boards.find(b => b.isActive);
  if (active && boards.length === 1) {
    redirect(`/campaigns/${id}/workshop/${active.id}`);
  }

  return (
    <ProtectedRoute>
      <WorkshopShelf
        campaignId={id}
        campaignName={campaign.name}
        boards={boards}
      />
    </ProtectedRoute>
  );
}
