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
  await startDiscordReminders();
}

/**
 * The day-ahead Discord reminder (0066). Every 15 minutes, post for each
 * planned session due one; `campaign_sessions.reminded_at` is what keeps a
 * restart or a deploy from sending it twice. `unref` so the timer never
 * holds the process open on shutdown.
 */
async function startDiscordReminders() {
  const g = globalThis as { __heroNexusReminders?: NodeJS.Timeout };
  if (g.__heroNexusReminders) return;
  const { sendDueReminders } = await import('./server/discord');
  const tick = () =>
    sendDueReminders().catch(err =>
      console.error('[discord] reminder loop failed:', err)
    );
  g.__heroNexusReminders = setInterval(tick, 15 * 60_000);
  g.__heroNexusReminders.unref();
  void tick();
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
