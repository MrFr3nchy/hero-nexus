'use client';

import { AuthProvider } from '@auth/context';
import { HeroUIProvider } from '@heroui/react';
import { ThemeProvider } from 'next-themes';

import { DiceTrayProvider } from '@/@shared/components/dice';
import { OfflineSupport } from '@/@shared/offline/OfflineSupport';
import { Announcements, TableProvider } from '@/@shared/table';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <HeroUIProvider>
        <AuthProvider>
          <DiceTrayProvider>
            {/*
              Inside AuthProvider, because the table has to know who is
              reading before it can say "your turn" rather than naming
              somebody the reader has to recognise as themselves.
            */}
            <TableProvider>
              {children}
              <Announcements />
              <OfflineSupport />
            </TableProvider>
          </DiceTrayProvider>
        </AuthProvider>
      </HeroUIProvider>
    </ThemeProvider>
  );
}
