'use client';

import Link from 'next/link';

import { Card, CardBody, CardHeader } from '@heroui/react';

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-amber-900 to-slate-900 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-amber-100">
            Forgot your password?
          </h2>
        </div>
        <Card className="border-2 border-amber-600 bg-slate-800/50 shadow-2xl backdrop-blur-sm">
          <CardHeader className="pb-0">
            <div className="w-full text-center">
              <h3 className="text-2xl font-bold text-amber-100">
                Self-service reset isn&apos;t available yet
              </h3>
            </div>
          </CardHeader>
          <CardBody className="space-y-4 pt-6 text-center text-amber-200">
            <p>
              Hero Nexus is self-hosted and this instance doesn&apos;t send
              email. Contact your instance admin to reset your password, or sign
              in and change it from{' '}
              <Link
                href="/account/settings"
                className="text-yellow-300 hover:text-yellow-200"
              >
                Account Settings
              </Link>{' '}
              if you remember your current one.
            </p>
            <Link
              href="/login"
              className="inline-block text-sm text-yellow-300 hover:text-yellow-200"
            >
              ← Back to Login
            </Link>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
