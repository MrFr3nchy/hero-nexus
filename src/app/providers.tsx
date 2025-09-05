'use client';

import { AuthProvider } from '@auth/context';
import { HeroUIProvider } from '@heroui/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeroUIProvider>
        <AuthProvider>{children}</AuthProvider>
      </HeroUIProvider>
    </>
  );
}
