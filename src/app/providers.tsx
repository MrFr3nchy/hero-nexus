'use client';

import { AuthProvider } from '@auth/context';
import { HeroUIProvider } from '@heroui/react';
import { ThemeProvider } from 'next-themes';

import { DiceTrayProvider } from '@/@shared/components/dice';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <HeroUIProvider>
        <AuthProvider>
          <DiceTrayProvider>{children}</DiceTrayProvider>
        </AuthProvider>
      </HeroUIProvider>
    </ThemeProvider>
  );
}
