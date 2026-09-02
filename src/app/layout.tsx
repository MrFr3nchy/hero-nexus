import type { Metadata } from 'next';
import { Caveat, Cinzel, Fraunces, Inter } from 'next/font/google';

import { ConditionalLayout } from '@/@shared/components/ConditionalLayout';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['SOFT', 'opsz'],
});

const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-cinzel',
  display: 'swap',
  weight: ['500', '600'],
});

// Hand-lettered face for marginalia only (design rule 5: whimsy in the margin,
// in a different voice). Never used for headings or body copy.
const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-caveat',
  display: 'swap',
  weight: ['500'],
});

export const metadata: Metadata = {
  title: 'Hero Nexus',
  description:
    'A self-hosted campaign tool for tabletop RPG players and game masters — build characters, design homebrew, and run your table.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${cinzel.variable} ${caveat.variable}`}
    >
      <body className="grain">
        <Providers>
          <ConditionalLayout>{children}</ConditionalLayout>
        </Providers>
      </body>
    </html>
  );
}
