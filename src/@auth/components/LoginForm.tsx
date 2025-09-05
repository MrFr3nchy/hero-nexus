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
import { FirebaseError } from '../types';
import { AUTH_ERRORS, AuthErrorCode } from '../types/constants';

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
      router.push('/');
    } catch (error: unknown) {
      const firebaseError = error as FirebaseError;
      const errorCode = firebaseError.code as AuthErrorCode;
      setError(AUTH_ERRORS[errorCode] || 'Failed to log in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-amber-900 to-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-amber-100">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-amber-200">
            Or{' '}
            <Link
              href="/register"
              className="font-medium text-yellow-300 hover:text-yellow-200 transition-colors"
            >
              create a new account
            </Link>
          </p>
        </div>
        <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600 border-2 shadow-2xl">
          <CardHeader className="pb-0">
            <div className="text-center w-full">
              <h3 className="text-2xl font-bold text-amber-100">
                Welcome Back
              </h3>
              <p className="text-amber-200 mt-2">
                Enter your credentials to continue
              </p>
            </div>
          </CardHeader>
          <CardBody className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
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
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
            <Divider className="my-6 bg-amber-600" />
            <div className="text-center">
              <Link
                href="/forgot-password"
                className="text-sm text-yellow-300 hover:text-yellow-200 transition-colors"
              >
                Forgot your password?
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
