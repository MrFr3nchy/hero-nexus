'use client';

import { useAuth } from '@/@auth/context';
import { usePathname } from 'next/navigation';
import { Navigation } from './Navigation';
import { NAV_HREFS, SideNavigation } from './SideNavigation';
import { SittingBar } from './SittingBar';

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

/**
 * Private routes that should show the side navigation.
 *
 * Derived from the sidebar's own link list rather than typed out again: this
 * was a hand-kept copy, and the copy went stale the moment three shelves were
 * added — they appeared in the nav and then rendered with the public top bar,
 * signed in, with no sidebar to go back to. `NAV_HREFS` is the sidebar's
 * answer to "what do I link to"; anything it links to gets the shell.
 *
 * The extras below are the private routes that deliberately have no nav row of
 * their own — they are reached from inside the app. Matching is by prefix, so
 * `/campaigns` covers `/campaigns/[id]/manage` and `/creator` covers both
 * creators.
 */
const privateRoutes = [...new Set([...NAV_HREFS, '/creator', '/account'])];

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
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Above the page, not inside it: a table that has sat down is the
              app's business, not this route's. It is also what puts the
              reader on the table's stream from wherever they are standing. */}
          <SittingBar />
          <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        </div>
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
