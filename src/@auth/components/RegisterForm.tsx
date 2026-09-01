'use client';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
} from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, displayName);
      router.push('/');
    } catch (error: unknown) {
      const authError = error as AuthError;
      setError(
        authError.message || 'Failed to create account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-amber-900 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-amber-100">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-amber-200">
            Or{' '}
            <Link
              href="/login"
              className="font-medium text-yellow-300 hover:text-yellow-200 transition-colors"
            >
              sign in to existing account
            </Link>
          </p>
        </div>
        <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600 border-2 shadow-2xl">
          <CardHeader className="pb-0">
            <div className="text-center w-full">
              <h3 className="text-2xl font-bold text-amber-100">
                Join Hero Nexus
              </h3>
              <p className="text-amber-200 mt-2">
                Start your epic adventure today
              </p>
            </div>
          </CardHeader>
          <CardBody className="pt-6">
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
                type="email"
                label="Email address"
                placeholder="Enter your email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="text-amber-100"
                classNames={{
                  input: 'text-amber-100',
                  inputWrapper: 'bg-slate-700/50 border-amber-600',
                  label: 'text-amber-200',
                }}
              />
              <Input
                type="password"
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="text-amber-100"
                classNames={{
                  input: 'text-amber-100',
                  inputWrapper: 'bg-slate-700/50 border-amber-600',
                  label: 'text-amber-200',
                }}
              />
              <Input
                type="password"
                label="Confirm Password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
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
              <Button
                type="submit"
                color="primary"
                size="lg"
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold"
                isLoading={loading}
                disabled={loading}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
            <Divider className="my-6 bg-amber-600" />
            <div className="text-center text-sm text-amber-200">
              By creating an account, you agree to our{' '}
              <Link
                href="/terms"
                className="text-yellow-300 hover:text-yellow-200"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="text-yellow-300 hover:text-yellow-200"
              >
                Privacy Policy
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
