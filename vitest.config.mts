import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig says `jsx: preserve` for Next; a server module that imports a
  // component (Glyph's names) still needs the automatic runtime here.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./test/stubs/server-only.ts', import.meta.url)
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./test/setup-db.ts'],
  },
});
