import { ConditionalLayout } from '@/@shared/components/ConditionalLayout';
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Hero Nexus - Tabletop RPG Character Creator',
  description:
    'Create epic characters for your tabletop adventures. Choose from powerful classes, craft unique abilities, and embark on legendary quests with your custom hero.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <ConditionalLayout>{children}</ConditionalLayout>
        </Providers>
      </body>
    </html>
  );
}
