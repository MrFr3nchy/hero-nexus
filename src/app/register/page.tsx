'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/@auth/context';
import RegisterForm from '@auth/components/RegisterForm';

export default function RegisterPage() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && currentUser) {
      router.replace('/dashboard');
    }
  }, [currentUser, loading, router]);

  if (loading || currentUser) {
    return null;
  }

  return <RegisterForm />;
}
