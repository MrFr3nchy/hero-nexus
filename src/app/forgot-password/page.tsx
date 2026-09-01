import Link from 'next/link';

import { DeckledEdge, SectionCard } from '@/@shared/components/ui';

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl text-ink">
            Forgot your password?
          </h1>
        </div>
        <div className="relative">
          <SectionCard>
            <div className="space-y-3 text-sm text-ink-muted">
              <p>
                Hero Nexus is self-hosted and this instance doesn&apos;t send
                email, so there&apos;s no self-service reset.
              </p>
              <p>
                If you&apos;re signed in, you can change your password from{' '}
                <Link
                  href="/account/settings"
                  className="text-gold hover:underline"
                >
                  Account settings
                </Link>
                . Otherwise, ask whoever runs this instance to reset it for you.
              </p>
            </div>
            <div className="mt-5">
              <Link
                href="/login"
                className="text-sm text-ink-muted hover:text-ink"
              >
                ← Back to sign in
              </Link>
            </div>
          </SectionCard>
          <DeckledEdge />
        </div>
      </div>
    </div>
  );
}
