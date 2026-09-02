import Link from 'next/link';

import { FormSpread, SealedLetterScene } from '@/@shared/components/ui';

export default function ForgotPasswordPage() {
  return (
    <FormSpread
      scene={<SealedLetterScene />}
      title="No raven to send"
      blurb="a self-hosted table keeps no mailroom"
      footer={
        <Link href="/login" className="text-ink-muted hover:text-ink">
          ← Back to sign in
        </Link>
      }
    >
      <div className="space-y-3 text-sm text-ink-muted">
        <p>
          Hero Nexus is self-hosted and this instance doesn&apos;t send email,
          so there&apos;s no self-service reset.
        </p>
        <p>
          If you&apos;re signed in, change your password from{' '}
          <Link href="/account/settings" className="text-gold hover:underline">
            Account settings
          </Link>
          . Otherwise, ask whoever runs this instance to reset it for you.
        </p>
      </div>
    </FormSpread>
  );
}
