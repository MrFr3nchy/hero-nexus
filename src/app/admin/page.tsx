import { notFound } from 'next/navigation';

import { AdminConsole } from '@/@creator/admin/components/AdminConsole';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';
import { isSuperAdmin } from '@/server/admin';

export const dynamic = 'force-dynamic';

/**
 * The operator's page.
 *
 * A 404 rather than a 403 for everybody else, the same answer the rest of
 * this app gives about things that are none of a stranger's business: whether
 * this install has an admin page is not information anyone is owed.
 */
export default async function AdminPage() {
  if (!(await isSuperAdmin())) notFound();

  return (
    <ProtectedRoute>
      <PageShell width="wide">
        <PageHeader
          rule={false}
          title="Running the box"
          description="What this install is holding, and the few handles an operator has on it."
        />
        <Marginalia dash className="mb-5">
          the shape of the place, not what anybody wrote in it
        </Marginalia>
        <AdminConsole />
      </PageShell>
    </ProtectedRoute>
  );
}
