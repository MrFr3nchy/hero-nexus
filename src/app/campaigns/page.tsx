import { CampaignDashboard } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';

export default function CampaignsPage() {
  return (
    <ProtectedRoute>
      <CampaignDashboard />
    </ProtectedRoute>
  );
}
