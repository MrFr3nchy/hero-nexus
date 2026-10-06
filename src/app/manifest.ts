import type { MetadataRoute } from 'next';

/**
 * `/manifest.webmanifest` — what makes Hero Nexus installable to a phone's
 * home screen. Public in `auth.config.ts`: a browser fetches the manifest
 * without cookies, and a redirect to /login here fails the install silently.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hero Nexus',
    short_name: 'Hero Nexus',
    description:
      'Build characters, forge homebrew, and run your table — at the table.',
    start_url: '/campaigns',
    display: 'standalone',
    background_color: '#16130f',
    theme_color: '#16130f',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
