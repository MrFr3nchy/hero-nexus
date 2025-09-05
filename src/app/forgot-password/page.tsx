'use client';

import { useAuth } from '@/@auth/context';
import { FirebaseError } from '@/@auth/types';
import { AUTH_ERRORS, AuthErrorCode } from '@/@auth/types/constants';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Input,
} from '@heroui/react';
import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { sendPasswordResetEmail } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await sendPasswordResetEmail(email);
      setMessage(
        'Password reset email sent! Check your inbox and follow the instructions.'
      );
    } catch (error: unknown) {
      const firebaseError = error as FirebaseError;
      const errorCode = firebaseError.code as AuthErrorCode;
      setError(
        AUTH_ERRORS[errorCode] ||
          'Failed to send password reset email. Please try again.'
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
            Forgot your password?
          </h2>
          <p className="mt-2 text-sm text-amber-200">
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </p>
        </div>
        <Card className="bg-slate-800/50 backdrop-blur-sm border-amber-600 border-2 shadow-2xl">
          <CardHeader className="pb-0">
            <div className="text-center w-full">
              <h3 className="text-2xl font-bold text-amber-100">
                Reset Password
              </h3>
              <p className="text-amber-200 mt-2">
                We&apos;ll help you get back into your account
              </p>
            </div>
          </CardHeader>
          <CardBody className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                type="email"
                label="Email address"
                placeholder="Enter your email address"
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
                {loading ? 'Sending...' : 'Send Reset Email'}
              </Button>
            </form>
            <Divider className="my-6 bg-amber-600" />
            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-yellow-300 hover:text-yellow-200 transition-colors"
              >
                ← Back to Login
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
