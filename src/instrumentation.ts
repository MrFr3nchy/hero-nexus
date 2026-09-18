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

  warnIfProductionCannotSendMail();
}

/**
 * Email is load-bearing: an account cannot sign in until its verification
 * link is clicked, and `src/server/mail.ts` refuses every other transport in
 * production. Without these two settings the server boots and serves pages
 * normally, and the first person to register is the one who finds out. Say
 * so at boot instead, where `journalctl -u hero-nexus` shows it.
 *
 * A warning, not a throw: the operator may want the site up to check it over
 * before the sending domain has verified at Resend.
 */
function warnIfProductionCannotSendMail() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return;
  console.error(
    '[instrumentation] RESEND_API_KEY / MAIL_FROM are not set. ' +
      'Registration and password reset will fail, and no new account can sign in. ' +
      'See docs/ops/deploy.md.'
  );
}
