import { notFound } from 'next/navigation';

import { auth } from '@/auth';
import { DmScreen } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { getCampaign } from '@/server/campaigns';

export const dynamic = 'force-dynamic';

export default async function ScreenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [campaign, session] = await Promise.all([getCampaign(id), auth()]);
  if (!campaign || !session?.user?.id) notFound();

  return (
    <ProtectedRoute>
      <DmScreen campaign={campaign} viewerId={session.user.id} />
    </ProtectedRoute>
  );
}
