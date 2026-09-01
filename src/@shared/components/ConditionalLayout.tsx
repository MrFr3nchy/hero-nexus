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
];

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const { currentUser, loading } = useAuth();
  const pathname = usePathname();

  // Show loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span className="animate-pulse font-display text-lg text-ink-muted">
          Hero Nexus
        </span>
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
