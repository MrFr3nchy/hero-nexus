'use client';

import { Avatar, Button, Input, Link } from '@heroui/react';
import { useEffect, useState } from 'react';

import { useAuth } from '@/@auth/context';
import { AuthError } from '@/@auth/types';
import {
  CandleScene,
  EmptyState,
  Marginalia,
  PageHeader,
  PageShell,
  SectionCard,
} from '@/@shared/components/ui';

/**
 * One page for the account, not two.
 *
 * Profile and settings used to be separate routes reached from different
 * places — the top bar offered both, the spine offered only one — and each
 * was a single short form on its own page. What the reader has is one
 * account: a face and a name the table sees, and two keys they sign in with.
 * It reads as one sheet, with the keys folded under the face. The old paths
 * redirect here (`next.config.ts`) so bookmarks and the email-confirmation
 * link still land.
 */

type Key = 'email' | 'password';

const EMAIL_NOTICES: Record<string, { tone: 'ok' | 'error'; text: string }> = {
  email_changed: { tone: 'ok', text: 'Email address confirmed and updated.' },
  email_error: {
    tone: 'error',
    text: 'That confirmation link is invalid or has expired.',
  },
  email_taken: {
    tone: 'error',
    text: 'That address was claimed by another account in the meantime.',
  },
};

function Notice({
  tone,
  children,
}: {
  tone: 'ok' | 'error';
  children: string;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-sm ${
        tone === 'error'
          ? 'border-danger/40 bg-danger/10 text-danger'
          : 'border-success/40 bg-success/10 text-success'
      }`}
    >
      {children}
    </p>
  );
}

function ProfileSheet() {
  const { currentUser, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.name || '');
      setPhotoURL(currentUser.image || '');
    }
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await updateProfile({
        displayName: displayName.trim() || undefined,
        image: photoURL.trim() || undefined,
      });
      setMessage('Profile updated.');
    } catch (err: unknown) {
      setError(
        (err as AuthError).message || 'Failed to update profile. Try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <SectionCard framed>
      <div className="mb-6 flex items-center gap-4">
        <Avatar
          src={photoURL.trim() || currentUser.image || undefined}
          name={currentUser.name || currentUser.email?.split('@')[0] || 'You'}
          className="h-16 w-16 text-large"
        />
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-ink">
            {displayName.trim() || currentUser.name || 'No display name set'}
          </p>
          <p className="truncate text-sm text-ink-muted">{currentUser.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Display name"
          placeholder="What the party calls you"
          value={displayName}
          onValueChange={setDisplayName}
          autoComplete="nickname"
        />
        <Input
          type="url"
          label="Portrait URL"
          placeholder="https://…"
          description="Fetched by each player's browser, never by Hero Nexus."
          value={photoURL}
          onValueChange={setPhotoURL}
        />

        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="ok">{message}</Notice>}

        <Button
          type="submit"
          color="primary"
          className="w-full"
          isLoading={loading}
        >
          Save profile
        </Button>
      </form>
    </SectionCard>
  );
}

function KeysSheet() {
  const { currentUser, updateEmail, updatePassword } = useAuth();
  const [key, setKey] = useState<Key>('email');
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // The confirmation link from a changed email lands back here with a flag.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const [flag, notice] of Object.entries(EMAIL_NOTICES)) {
      if (params.has(flag)) {
        if (notice.tone === 'ok') setMessage(notice.text);
        else setError(notice.text);
        break;
      }
    }
  }, []);

  const pick = (next: Key) => {
    setKey(next);
    setError('');
    setMessage('');
  };

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await updateEmail(email, emailPassword);
      setMessage(
        'Almost done — click the confirmation link we sent to the new address.'
      );
      setEmail('');
      setEmailPassword('');
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

  if (!currentUser) return null;

  return (
    <SectionCard
      title="Your keys"
      description="The email and password you sign in with."
      actions={
        <div
          role="tablist"
          aria-label="Which key to change"
          className="inline-flex rounded-md border border-line bg-surface-2 p-1"
        >
          {(['email', 'password'] as Key[]).map(k => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={key === k}
              onClick={() => pick(k)}
              className={`rounded px-3 py-1 text-sm capitalize transition-colors ${
                key === k
                  ? 'bg-gold font-medium text-bg'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      }
    >
      {key === 'email' ? (
        <form onSubmit={handleEmailUpdate} className="flex flex-col gap-4">
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
          <Input
            type="password"
            label="Current password"
            description="Confirms it's you before the address changes."
            value={emailPassword}
            onValueChange={setEmailPassword}
            isRequired
            autoComplete="current-password"
          />
          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice tone="ok">{message}</Notice>}
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
        <form onSubmit={handlePasswordUpdate} className="flex flex-col gap-4">
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
          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice tone="ok">{message}</Notice>}
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
  );
}

export default function AccountPage() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return (
      <PageShell width="narrow">
        <EmptyState
          scene={<CandleScene />}
          title="No one is sitting here"
          description="Sign in and your name, face and tables come back with you."
          action={
            <Button as={Link} href="/login" color="primary">
              Sign in
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        rule={false}
        title="Your account"
        description="The name and face other players see at the table, and the keys you sign in with."
      />
      <Marginalia dash className="mb-5">
        the party will use a nickname anyway
      </Marginalia>

      <div className="flex flex-col gap-6">
        <ProfileSheet />
        <KeysSheet />
      </div>

      <Marginalia className="mt-5">
        the portrait shows up on your card at every table you sit at
      </Marginalia>
    </PageShell>
  );
}
