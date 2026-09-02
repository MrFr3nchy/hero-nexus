'use client';

import { Button, Input, Link } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { DeckledEdge, SectionCard } from '@/@shared/components/ui';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get('email') ?? '');
    setToken(params.get('token') ?? '');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, password }),
    }).catch(() => null);
    setLoading(false);

    if (res?.ok) {
      router.push('/login?reset=1');
      return;
    }
    const data = (await res?.json().catch(() => ({}))) as { error?: string };
    setError(
      data.error ?? 'Could not reset your password. Request a new link.'
    );
  };

  const linkMissing = !email || !token;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl text-ink">Set a new password</h1>
        </div>
        <div className="relative">
          <SectionCard>
            {linkMissing ? (
              <p className="text-sm text-ink-muted">
                This page needs the link from your reset email. Request a new
                one from{' '}
                <Link href="/forgot-password" size="sm" className="text-gold">
                  Forgot your password?
                </Link>
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="password"
                  label="New password"
                  description="At least 8 characters."
                  value={password}
                  onValueChange={setPassword}
                  isRequired
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  label="Confirm new password"
                  value={confirm}
                  onValueChange={setConfirm}
                  isRequired
                  autoComplete="new-password"
                />
                {error && (
                  <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  color="primary"
                  className="w-full"
                  isLoading={loading}
                >
                  Update password
                </Button>
              </form>
            )}
            <div className="mt-5">
              <Link href="/login" size="sm" className="text-ink-muted">
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
