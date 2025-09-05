import { CampaignCreationForm } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';

export default function CreateCampaignPage() {
  return (
    <ProtectedRoute>
      <CampaignCreationForm />
    </ProtectedRoute>
  );
}
