'use client';

import { Button, Input, Link } from '@heroui/react';
import { useState } from 'react';

import { FormSpread, SealedLetterScene } from '@/@shared/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Always succeeds from the user's point of view — the endpoint never says
    // whether an account exists.
    await fetch('/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  };

  return (
    <FormSpread
      scene={<SealedLetterScene />}
      title="Forgot your password?"
      blurb="a sealed letter, sent the long way round"
      footer={
        <Link href="/login" className="text-ink-muted hover:text-ink">
          ← Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            If an account exists for <span className="text-ink">{email}</span>,
            a reset link is on its way. It expires in an hour.
          </p>
          <p>Check your spam folder if it doesn&apos;t arrive soon.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Enter your email and we&apos;ll send you a link to set a new
            password.
          </p>
          <Input
            type="email"
            label="Email"
            value={email}
            onValueChange={setEmail}
            isRequired
            autoComplete="email"
          />
          <Button
            type="submit"
            color="primary"
            className="w-full"
            isLoading={loading}
          >
            Send reset link
          </Button>
        </form>
      )}
    </FormSpread>
  );
}
