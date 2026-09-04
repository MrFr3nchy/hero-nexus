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

export default function ProfilePage() {
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
        title="Your profile"
        description="The name and face other players see at the table."
      />
      <Marginalia dash className="mb-5">
        the party will use a nickname anyway
      </Marginalia>

      <SectionCard framed>
        <div className="mb-6 flex items-center gap-4">
          <Avatar
            src={currentUser.image || undefined}
            name={currentUser.name || currentUser.email?.split('@')[0] || 'You'}
            className="h-16 w-16 text-large"
          />
          <div>
            <p className="font-display text-lg text-ink">
              {currentUser.name || 'No display name set'}
            </p>
            <p className="text-sm text-ink-muted">{currentUser.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Display name"
            placeholder="What the party calls you"
            value={displayName}
            onValueChange={setDisplayName}
          />
          <Input
            type="url"
            label="Portrait URL"
            placeholder="https://…"
            value={photoURL}
            onValueChange={setPhotoURL}
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
            Save profile
          </Button>
        </form>
      </SectionCard>

      <Marginalia className="mt-5">
        the portrait shows up on your card at every table you sit at
      </Marginalia>
    </PageShell>
  );
}
