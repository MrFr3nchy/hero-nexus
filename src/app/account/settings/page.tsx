'use client';

import { useAuth } from '@/@auth/context';
import { AuthError } from '@/@auth/types';
import { Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { useEffect, useState } from 'react';

const EMAIL_NOTICES: Record<string, string> = {
  email_changed: 'Email address confirmed and updated.',
  email_error: 'That confirmation link is invalid or has expired.',
  email_taken: 'That address was claimed by another account in the meantime.',
};

export default function SettingsPage() {
  const { currentUser, updateEmail, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'email' | 'password'>('email');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of Object.keys(EMAIL_NOTICES)) {
      if (params.has(key)) {
        if (key === 'email_changed') setMessage(EMAIL_NOTICES[key]);
        else setError(EMAIL_NOTICES[key]);
        break;
      }
    }
  }, []);

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
    } catch (error: unknown) {
      const authError = error as AuthError;
      setError(
        authError.message || 'Failed to update email. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      await updatePassword(currentPassword, newPassword);
      setMessage('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: unknown) {
      const authError = error as AuthError;
      setError(
        authError.message || 'Failed to update password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-ink mb-4">
            Please log in to view your settings
          </h1>
          <Button as="a" href="/login" color="primary" className="">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-ink mb-2">Account Settings</h1>
          <p className="text-ink-muted">
            Manage your account security and preferences
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-surface/50 rounded-lg p-1 border border-line">
            <button
              onClick={() => setActiveTab('email')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'email'
                  ? 'bg-gold text-white'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Email Settings
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'password'
                  ? 'bg-gold text-white'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Password Settings
            </button>
          </div>
        </div>

        {/* Email Settings */}
        {activeTab === 'email' && (
          <Card className=" border-line shadow-2xl">
            <CardHeader className="pb-0">
              <div className="text-center w-full">
                <h2 className="text-2xl font-bold text-ink">Email Settings</h2>
                <p className="text-ink-muted mt-2">Update your email address</p>
              </div>
            </CardHeader>
            <CardBody className="pt-6">
              <div className="mb-6 p-4 bg-surface-2 rounded-lg border border-line/50">
                <p className="text-ink-muted text-sm">
                  <span className="font-medium">Current Email:</span>{' '}
                  {currentUser.email}
                </p>
              </div>

              <form onSubmit={handleEmailUpdate} className="space-y-6">
                <Input
                  type="email"
                  label="New Email Address"
                  placeholder="Enter your new email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />
                <Input
                  type="password"
                  label="Current Password"
                  placeholder="Confirm it's you"
                  value={emailPassword}
                  onChange={e => setEmailPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />

                {error && (
                  <div className="text-danger text-sm text-center bg-danger/10 p-3 rounded-lg border border-danger/40">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="text-success text-sm text-center bg-success/10 p-3 rounded-lg border border-success/40">
                    {message}
                  </div>
                )}

                <Button
                  type="submit"
                  color="primary"
                  size="lg"
                  className="w-full"
                  isLoading={loading}
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Email'}
                </Button>
              </form>
            </CardBody>
          </Card>
        )}

        {/* Password Settings */}
        {activeTab === 'password' && (
          <Card className=" border-line shadow-2xl">
            <CardHeader className="pb-0">
              <div className="text-center w-full">
                <h2 className="text-2xl font-bold text-ink">
                  Password Settings
                </h2>
                <p className="text-ink-muted mt-2">Update your password</p>
              </div>
            </CardHeader>
            <CardBody className="pt-6">
              <form onSubmit={handlePasswordUpdate} className="space-y-6">
                <Input
                  type="password"
                  label="Current Password"
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />
                <Input
                  type="password"
                  label="New Password"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />
                <Input
                  type="password"
                  label="Confirm New Password"
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  classNames={{
                    input: 'text-ink',
                    inputWrapper: 'bg-surface-2 border-line',
                    label: 'text-ink-muted',
                  }}
                />

                {error && (
                  <div className="text-danger text-sm text-center bg-danger/10 p-3 rounded-lg border border-danger/40">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="text-success text-sm text-center bg-success/10 p-3 rounded-lg border border-success/40">
                    {message}
                  </div>
                )}

                <Button
                  type="submit"
                  color="primary"
                  size="lg"
                  className="w-full"
                  isLoading={loading}
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
