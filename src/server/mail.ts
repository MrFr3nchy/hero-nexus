/**
 * Transactional email.
 *
 * Two transports:
 *
 * - `resend` — Resend's HTTP API, deliberately not SMTP from the droplet. A
 *   fresh DigitalOcean IP has no sending reputation, so mail sent directly
 *   from it is dropped or spam-filed. Routing through a provider (Resend /
 *   Postmark / SES) with a warmed, DKIM-signed domain is required, not
 *   optional.
 * - `outbox` — writes the message to `data/outbox/` for `/dev/mail` to render.
 *   Development default, and refused outright in production.
 *
 * `MAIL_TRANSPORT` picks one; unset means "Resend if it's configured, outbox
 * if it isn't". Swapping in a third provider is a one-file change: another
 * branch in `sendMail`.
 */
import 'server-only';

import { appendToOutbox, OUTBOX_URL } from './mail-outbox';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export type MailTransport = 'resend' | 'outbox';

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

/**
 * Which transport this environment sends over.
 *
 * Production must reach a real inbox, so it never falls back to the outbox and
 * never honours a request for it — a `MAIL_TRANSPORT=outbox` left in a
 * deployed environment would silently swallow every password reset.
 */
export function mailTransport(): MailTransport {
  const isProduction = process.env.NODE_ENV === 'production';
  const requested = process.env.MAIL_TRANSPORT;

  if (requested === 'outbox') {
    if (isProduction) {
      throw new Error(
        'MAIL_TRANSPORT=outbox is a development-only sink and cannot be used in production.'
      );
    }
    return 'outbox';
  }

  if (requested === 'resend') {
    if (!mailConfigured()) {
      throw new Error(
        'MAIL_TRANSPORT=resend but RESEND_API_KEY / MAIL_FROM are not set.'
      );
    }
    return 'resend';
  }

  if (requested) {
    throw new Error(
      `Unknown MAIL_TRANSPORT "${requested}" — expected "resend" or "outbox".`
    );
  }

  if (mailConfigured()) return 'resend';

  if (isProduction) {
    throw new Error(
      'Email is not configured: set RESEND_API_KEY and MAIL_FROM.'
    );
  }

  return 'outbox';
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (mailTransport() === 'outbox') {
    await appendToOutbox(message);
    console.info(
      `[mail] captured locally → http://localhost:3000${OUTBOX_URL}\n` +
        `  to: ${message.to}\n` +
        `  subject: ${message.subject}\n` +
        message.text.replace(/^/gm, '  ')
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Email send failed (${res.status}): ${detail.slice(0, 300)}`
    );
  }
}
