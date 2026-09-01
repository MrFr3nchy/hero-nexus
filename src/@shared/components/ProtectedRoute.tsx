'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { DiceSpinner } from '@/@shared/components/ui';
import { useAuth } from '@/@auth/context';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <DiceSpinner size={44} label="Unrolling the map…" />
      </div>
    );
  }

  if (!currentUser) {
    return null; // Will redirect to login
  }

  return <>{children}</>;
};

export default ProtectedRoute;
