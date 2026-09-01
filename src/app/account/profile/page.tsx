'use client';

import { useAuth } from '@/@auth/context';
import { AuthError } from '@/@auth/types';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
  User,
} from '@heroui/react';
import { useEffect, useState } from 'react';

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
      setMessage('Profile updated successfully!');
    } catch (error: unknown) {
      const authError = error as AuthError;
      setError(
        authError.message || 'Failed to update profile. Please try again.'
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
            Please log in to view your profile
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
            Profile Settings
          </h1>
          <p className="text-amber-200">
            Manage your personal information and preferences
          </p>
        </div>

        <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600 border-2 shadow-2xl">
          <CardHeader className="pb-0">
            <div className="text-center w-full">
              <h2 className="text-2xl font-bold text-amber-100">
                Personal Information
              </h2>
              <p className="text-amber-200 mt-2">
                Update your display name and profile picture
              </p>
            </div>
          </CardHeader>
          <CardBody className="pt-6">
            <div className="flex flex-col items-center mb-6">
              <Avatar
                src={currentUser.image || undefined}
                name={
                  currentUser.name || currentUser.email?.split('@')[0] || 'User'
                }
                className="w-24 h-24 text-large mb-4"
                classNames={{
                  base: 'bg-gradient-to-r from-amber-600 to-orange-600',
                  name: 'text-white font-bold text-2xl',
                }}
              />
              <User
                name={currentUser.name || 'No display name set'}
                description={currentUser.email}
                className="text-center"
                classNames={{
                  name: 'text-amber-100 text-lg font-semibold',
                  description: 'text-amber-200',
                }}
              />
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                type="text"
                label="Display Name"
                placeholder="Enter your display name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="text-amber-100"
                classNames={{
                  input: 'text-amber-100',
                  inputWrapper: 'bg-slate-700/50 border-amber-600',
                  label: 'text-amber-200',
                }}
              />
              <Input
                type="url"
                label="Profile Picture URL"
                placeholder="Enter URL for your profile picture"
                value={photoURL}
                onChange={e => setPhotoURL(e.target.value)}
                className="text-amber-100"
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
                {loading ? 'Updating...' : 'Update Profile'}
              </Button>
            </form>

            <Divider className="my-6 bg-amber-600" />

            <div className="text-center">
              <h3 className="text-lg font-semibold text-amber-100 mb-2">
                Account Information
              </h3>
              <div className="space-y-2 text-sm text-amber-200">
                <p>
                  <span className="font-medium">Email:</span>{' '}
                  {currentUser.email}
                </p>
                <p>
                  <span className="font-medium">User ID:</span> {currentUser.id}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
