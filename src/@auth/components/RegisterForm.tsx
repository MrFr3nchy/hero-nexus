'use client';

import { Button, Input, Link } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { FormSpread, SealedLetterScene } from '@/@shared/components/ui';
import { useAuth } from '../context';
import { AuthError } from '../types';

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resent, setResent] = useState(false);
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
      setRegisteredEmail(email);
    } catch (err: unknown) {
      setError(
        (err as AuthError).message ||
          'Failed to create account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResent(true);
    await fetch('/api/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registeredEmail }),
    }).catch(() => {});
  };

  if (registeredEmail) {
    return (
      <FormSpread
        scene={<SealedLetterScene />}
        title="Check your inbox"
        blurb="a letter is on its way"
        footer={
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-ink-muted hover:text-ink"
          >
            ← Back to sign in
          </button>
        }
      >
        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            We sent a verification link to{' '}
            <span className="text-ink">{registeredEmail}</span>. Click it to
            activate your account, then sign in.
          </p>
          <p>
            Nothing arrived? Check spam, then{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={resent}
              className="text-gold hover:underline disabled:opacity-50"
            >
              {resent ? 'link sent' : 'send it again'}
            </button>
            .
          </p>
        </div>
      </FormSpread>
    );
  }

  return (
    <FormSpread
      scene={<SealedLetterScene />}
      title="Pull up a chair"
      blurb="every chronicle starts with a name"
      footer={
        <>
          Already have one?{' '}
          <Link href="/login" size="sm" className="text-gold">
            Sign in
          </Link>
        </>
      }
    >
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
    </FormSpread>
  );
}
