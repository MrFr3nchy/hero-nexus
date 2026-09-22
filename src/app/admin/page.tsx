import { notFound } from 'next/navigation';

import { AdminConsole } from '@/@creator/admin/components/AdminConsole';
import ProtectedRoute from '@/@shared/components/ProtectedRoute';
import { PageHeader, PageShell } from '@/@shared/components/ui';
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
        {/*
          No marginalia and no in-world voice on this page: it is read while
          something is going wrong, by the person who owns the machine. The
          naming document's vocabulary governs the app, not the console.
        */}
        <PageHeader
          rule={false}
          title="Admin"
          description="What this install is holding, and what an operator can do about it. Counts and sizes only — nothing here reads a campaign, a notebook or a sheet."
        />
        <div className="mb-5" />
        <AdminConsole />
      </PageShell>
    </ProtectedRoute>
  );
}
