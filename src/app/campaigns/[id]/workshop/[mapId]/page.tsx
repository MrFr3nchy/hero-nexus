import { notFound, redirect } from 'next/navigation';

import { Workshop } from '@/@creator/campaign/components/workshop/Workshop';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { auth } from '@/auth';
import { getCampaign, requireCampaignRole } from '@/server/campaigns';

export const dynamic = 'force-dynamic';

/**
 * The workshop: where a board is built, off the screen. Staff only — a
 * player who lands here is sent back to the table.
 */
export default async function WorkshopPage({
  params,
}: {
  params: Promise<{ id: string; mapId: string }>;
}) {
  const { id, mapId } = await params;
  const [campaign, session] = await Promise.all([getCampaign(id), auth()]);
  if (!campaign || !session?.user?.id) notFound();
  const staff = await requireCampaignRole(id, ['gm', 'co-gm']).then(
    () => true,
    () => false
  );
  if (!staff) redirect(`/campaigns/${id}/screen`);

  return (
    <ProtectedRoute>
      <Workshop campaignId={id} campaignName={campaign.name} mapId={mapId} />
    </ProtectedRoute>
  );
}
