import { notFound } from 'next/navigation';

import { Marginalia, PageHeader, PageShell } from '@/@shared/components/ui';
import { listOutbox } from '@/server/mail-outbox';

import { MailInbox } from './MailInbox';

export const metadata = { title: 'Local mail — Hero Nexus' };

/** Never cache: the whole point is seeing the message that just got written. */
export const dynamic = 'force-dynamic';

/**
 * The local inbox. Anything `sendMail` produces while the outbox transport is
 * active shows up here, links and all — no provider account, no real delivery.
 *
 * Development only. A deployed build has no outbox to read and this route 404s.
 */
export default async function DevMailPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const messages = await listOutbox();

  return (
    <PageShell width="wide">
      <PageHeader
        title="Local mail"
        description="Every message the app tried to send on this machine, captured to data/outbox/ instead of handed to a provider. Development only — this route does not exist in a production build."
      />
      <Marginalia dash>
        No provider account, no deliverability, no waiting on a real inbox.
      </Marginalia>
      <div className="mt-6">
        <MailInbox messages={messages} />
      </div>
    </PageShell>
  );
}
