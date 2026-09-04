'use client';

import { Button, Input, Link } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CandleScene, FormSpread } from '@/@shared/components/ui';
import { useAuth } from '../context';
import { AuthError } from '../types';

const NOTICES: Record<string, string> = {
  verified: 'Email confirmed. You can sign in now.',
  reset: 'Password updated. Sign in with your new password.',
  verify_error: 'That verification link is invalid or has expired.',
};

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of Object.keys(NOTICES)) {
      if (params.has(key)) {
        setNotice(NOTICES[key]);
        break;
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setResent(false);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const authErr = err as AuthError;
      if (authErr.code === 'email-not-verified') setUnverified(true);
      setError(authErr.message || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResent(true);
    await fetch('/api/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
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
      {notice && (
        <p className="mb-4 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
          {notice}
        </p>
      )}
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
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            <p>{error}</p>
            {unverified && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resent || !email}
                className="mt-1 font-medium underline disabled:opacity-50"
              >
                {resent
                  ? 'Verification link sent'
                  : 'Resend verification email'}
              </button>
            )}
          </div>
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
