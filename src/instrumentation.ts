/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Applies any pending database migrations so the app "just works" after a pull.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { runMigrations } = await import('./db/migrate');
  try {
    runMigrations();
  } catch (err) {
    console.error('[instrumentation] migration failed:', err);
    throw err;
  }
}
