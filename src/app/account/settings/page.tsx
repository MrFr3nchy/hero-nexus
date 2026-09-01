'use client';

import { useAuth } from '@/@auth/context';
import { AuthError } from '@/@auth/types';
import { Button, Card, CardBody, CardHeader, Input } from '@heroui/react';
import { useState } from 'react';

export default function SettingsPage() {
  const { currentUser, updateEmail, updatePassword } = useAuth();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'email' | 'password'>('email');

  const handleEmailUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await updateEmail(email);
      setMessage('Email updated successfully!');
      setEmail('');
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-amber-900 to-slate-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-amber-100 mb-4">
            Please log in to view your settings
          </h1>
          <Button
            as="a"
            href="/login"
            color="primary"
            className="bg-gradient-to-r from-amber-600 to-orange-600"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-amber-900 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-amber-100 mb-2">
            Account Settings
          </h1>
          <p className="text-amber-200">
            Manage your account security and preferences
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-slate-800/50 rounded-lg p-1 border border-amber-600">
            <button
              onClick={() => setActiveTab('email')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'email'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-200 hover:text-amber-100'
              }`}
            >
              Email Settings
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`px-6 py-2 rounded-md transition-colors ${
                activeTab === 'password'
                  ? 'bg-amber-600 text-white'
                  : 'text-amber-200 hover:text-amber-100'
              }`}
            >
              Password Settings
            </button>
          </div>
        </div>

        {/* Email Settings */}
        {activeTab === 'email' && (
          <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600 border-2 shadow-2xl">
            <CardHeader className="pb-0">
              <div className="text-center w-full">
                <h2 className="text-2xl font-bold text-amber-100">
                  Email Settings
                </h2>
                <p className="text-amber-200 mt-2">Update your email address</p>
              </div>
            </CardHeader>
            <CardBody className="pt-6">
              <div className="mb-6 p-4 bg-slate-700/30 rounded-lg border border-amber-600/50">
                <p className="text-amber-200 text-sm">
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
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />

                {error && (
                  <div className="text-red-400 text-sm text-center bg-red-900/20 p-3 rounded-lg border border-red-600">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="text-green-400 text-sm text-center bg-green-900/20 p-3 rounded-lg border border-green-600">
                    {message}
                  </div>
                )}

                <Button
                  type="submit"
                  color="primary"
                  size="lg"
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold"
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
          <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600 border-2 shadow-2xl">
            <CardHeader className="pb-0">
              <div className="text-center w-full">
                <h2 className="text-2xl font-bold text-amber-100">
                  Password Settings
                </h2>
                <p className="text-amber-200 mt-2">Update your password</p>
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
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
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
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
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
                    input: 'text-amber-100',
                    inputWrapper: 'bg-slate-700/50 border-amber-600',
                    label: 'text-amber-200',
                  }}
                />

                {error && (
                  <div className="text-red-400 text-sm text-center bg-red-900/20 p-3 rounded-lg border border-red-600">
                    {error}
                  </div>
                )}

                {message && (
                  <div className="text-green-400 text-sm text-center bg-green-900/20 p-3 rounded-lg border border-green-600">
                    {message}
                  </div>
                )}

                <Button
                  type="submit"
                  color="primary"
                  size="lg"
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold"
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
