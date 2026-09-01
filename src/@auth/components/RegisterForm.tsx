'use client';

import { Button, Input, Link } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { DeckledEdge, SectionCard } from '@/@shared/components/ui';
import { useAuth } from '../context';
import { AuthError } from '../types';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register(email, password, displayName || undefined);
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(
        (err as AuthError).message ||
          'Failed to create account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl text-ink">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Already have one?{' '}
            <Link href="/login" size="sm" className="text-gold">
              Sign in
            </Link>
          </p>
        </div>
        <div className="relative">
          <SectionCard>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Display name"
                value={displayName}
                onValueChange={setDisplayName}
                autoComplete="nickname"
              />
              <Input
                type="email"
                label="Email"
                value={email}
                onValueChange={setEmail}
                isRequired
                autoComplete="email"
              />
              <Input
                type="password"
                label="Password"
                description="At least 8 characters."
                value={password}
                onValueChange={setPassword}
                isRequired
                autoComplete="new-password"
              />
              <Input
                type="password"
                label="Confirm password"
                value={confirmPassword}
                onValueChange={setConfirmPassword}
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
                Create account
              </Button>
            </form>
          </SectionCard>
          <DeckledEdge />
        </div>
      </div>
    </div>
  );
}
