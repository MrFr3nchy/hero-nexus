'use client';

import { Button, Input, Link } from '@heroui/react';
import { useState } from 'react';

import { useAuth } from '@/@auth/context';
import { AuthError } from '@/@auth/types';
import { PageHeader, PageShell, SectionCard } from '@/@shared/components/ui';

type Tab = 'email' | 'password';

export default function SettingsPage() {
  const { currentUser, updateEmail, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('email');

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await updateEmail(email);
      setMessage('Email updated.');
      setEmail('');
    } catch (err: unknown) {
      setError((err as AuthError).message || 'Failed to update email.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setMessage('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError((err as AuthError).message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <PageShell width="narrow">
        <div className="py-16 text-center">
          <h1 className="font-display text-2xl text-ink">
            Sign in to change your settings
          </h1>
          <Button as={Link} href="/login" color="primary" className="mt-4">
            Go to sign in
          </Button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Account settings"
        description="Change the email and password you sign in with."
      />

      <div className="mb-5 inline-flex rounded-md border border-line bg-surface-2 p-1">
        {(['email', 'password'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setError('');
              setMessage('');
            }}
            className={`rounded px-4 py-1.5 text-sm capitalize transition-colors ${
              tab === t
                ? 'bg-gold font-medium text-bg'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <SectionCard>
        {tab === 'email' ? (
          <form onSubmit={handleEmailUpdate} className="space-y-4">
            <p className="text-sm text-ink-muted">
              Current: <span className="text-ink">{currentUser.email}</span>
            </p>
            <Input
              type="email"
              label="New email address"
              value={email}
              onValueChange={setEmail}
              isRequired
              autoComplete="email"
            />
            {error && (
              <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {message && (
              <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                {message}
              </p>
            )}
            <Button
              type="submit"
              color="primary"
              className="w-full"
              isLoading={loading}
            >
              Update email
            </Button>
          </form>
        ) : (
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <Input
              type="password"
              label="Current password"
              value={currentPassword}
              onValueChange={setCurrentPassword}
              isRequired
              autoComplete="current-password"
            />
            <Input
              type="password"
              label="New password"
              description="At least 8 characters."
              value={newPassword}
              onValueChange={setNewPassword}
              isRequired
              autoComplete="new-password"
            />
            <Input
              type="password"
              label="Confirm new password"
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
            {message && (
              <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                {message}
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
      </SectionCard>
    </PageShell>
  );
}
