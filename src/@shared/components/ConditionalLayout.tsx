'use client';

import { useAuth } from '@/@auth/context';
import { usePathname } from 'next/navigation';
import { Navigation } from './Navigation';
import { SideNavigation } from './SideNavigation';

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

// Public routes that should show the top navigation
const publicRoutes = [
  '/',
  '/about',
  '/faq',
  '/login',
  '/register',
  '/forgot-password',
];

// Private routes that should show the side navigation
const privateRoutes = [
  '/dashboard',
  '/campaigns',
  '/characters',
  '/spells',
  '/classes',
  '/items',
  '/marketplace',
  '/creator',
  '/account',
  '/test-firestore',
];

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const { currentUser, loading } = useAuth();
  const pathname = usePathname();

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">✨</div>
          <div className="text-2xl text-white">Loading your adventure...</div>
        </div>
      </div>
    );
  }

  // Determine if this is a private route
  const isPrivateRoute = privateRoutes.some(route =>
    pathname.startsWith(route)
  );
  const isPublicRoute = publicRoutes.some(route => pathname === route);

  // If user is logged in and on a private route, show side navigation
  if (currentUser && isPrivateRoute) {
    return (
      <div className="flex min-h-screen">
        <SideNavigation />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    );
  }

  // For public routes or when not logged in, show top navigation
  if (isPublicRoute || !currentUser) {
    return (
      <>
        <Navigation />
        {children}
      </>
    );
  }

  // Default fallback
  return (
    <>
      <Navigation />
      {children}
    </>
  );
}
