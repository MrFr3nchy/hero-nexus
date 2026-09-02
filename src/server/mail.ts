/**
 * Transactional email.
 *
 * Sends over Resend's HTTP API — deliberately not SMTP from the droplet. A
 * fresh DigitalOcean IP has no sending reputation, so mail sent directly from
 * it is dropped or spam-filed. Routing through a provider (Resend / Postmark /
 * SES) with a warmed, DKIM-signed domain is required, not optional.
 *
 * Swapping providers is a one-file change: reimplement `sendMail`.
 */
import 'server-only';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(message: MailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Email is not configured: set RESEND_API_KEY and MAIL_FROM.'
      );
    }
    // Dev convenience: no provider wired up, so print what would have been sent.
    console.warn(
      `[mail] not configured — would send to ${message.to}\n` +
        `  subject: ${message.subject}\n` +
        message.text.replace(/^/gm, '  ')
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
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
