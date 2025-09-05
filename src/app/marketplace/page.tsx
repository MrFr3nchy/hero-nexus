import { PublicHomebrewMarketplace } from '@/@creator/campaign/components';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';

export default function MarketplacePage() {
  return (
    <ProtectedRoute>
      <PublicHomebrewMarketplace />
    </ProtectedRoute>
  );
}
