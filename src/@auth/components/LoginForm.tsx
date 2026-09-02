'use client';

import { Button, Input, Link } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CandleScene, FormSpread } from '@/@shared/components/ui';
import { useAuth } from '../context';
import { AuthError } from '../types';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      setError(
        (err as AuthError).message || 'Failed to sign in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormSpread
      scene={<CandleScene />}
      title="Welcome back"
      blurb="the table remembers you"
      footer={
        <>
          New here?{' '}
          <Link href="/register" size="sm" className="text-gold">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
          value={password}
          onValueChange={setPassword}
          isRequired
          autoComplete="current-password"
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
          Sign in
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/forgot-password" size="sm" className="text-ink-muted">
          Forgot your password?
        </Link>
      </p>
    </FormSpread>
  );
}
