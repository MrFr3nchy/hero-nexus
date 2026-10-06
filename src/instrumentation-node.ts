/**
 * Startup that needs Node: the database, and the timers that read it.
 *
 * Its own module, imported by `register()` in `instrumentation.ts` only
 * inside a `NEXT_RUNTIME === 'nodejs'` branch — Next's documented pattern.
 * `instrumentation.ts` is compiled for the Edge runtime too, and an import
 * the bundler cannot see is guarded (one in a helper function, say) is
 * traced into the Edge bundle, which cannot load better-sqlite3 or argon2.
 */
import { runMigrations } from './db/migrate';
import { sendDueReminders } from './server/discord';

export function startNode(): void {
  try {
    runMigrations();
  } catch (err) {
    console.error('[instrumentation] migration failed:', err);
    throw err;
  }

  warnIfProductionCannotSendMail();
  startDiscordReminders();
}

/**
 * The day-ahead Discord reminder (0066). Every 15 minutes, post for each
 * planned session due one; `campaign_sessions.reminded_at` is what keeps a
 * restart or a deploy from sending it twice. `unref` so the timer never
 * holds the process open on shutdown.
 */
function startDiscordReminders(): void {
  const g = globalThis as { __heroNexusReminders?: NodeJS.Timeout };
  if (g.__heroNexusReminders) return;
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
function warnIfProductionCannotSendMail(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return;
  console.error(
    '[instrumentation] RESEND_API_KEY / MAIL_FROM are not set. ' +
      'Registration and password reset will fail, and no new account can sign in. ' +
      'See docs/ops/deploy.md.'
  );
}
