/**
 * Plain-text bodies for the transactional emails. Text-only on purpose: fewer
 * ways to trip spam filters, nothing to render wrong.
 */
import { appUrl } from './app-url';

import type { MailMessage } from './mail';

export function verificationEmail(email: string, token: string): MailMessage {
  const link = appUrl(
    `/api/verify-email?email=${encodeURIComponent(email)}&token=${token}`
  );
  return {
    to: email,
    subject: 'Confirm your Hero Nexus email',
    text: [
      'Welcome to Hero Nexus.',
      '',
      'Confirm this address to finish setting up your account:',
      link,
      '',
      "This link expires in 24 hours. If you didn't create an account, ignore this email.",
    ].join('\n'),
  };
}

export function passwordResetEmail(email: string, token: string): MailMessage {
  const link = appUrl(
    `/reset-password?email=${encodeURIComponent(email)}&token=${token}`
  );
  return {
    to: email,
    subject: 'Reset your Hero Nexus password',
    text: [
      'Someone asked to reset the password for this Hero Nexus account.',
      '',
      'Set a new password here:',
      link,
      '',
      "This link expires in 1 hour. If it wasn't you, ignore this email — your password is unchanged.",
    ].join('\n'),
  };
}

export function emailChangeConfirmEmail(
  userId: string,
  newEmail: string,
  token: string
): MailMessage {
  const link = appUrl(
    `/api/account/confirm-email?uid=${encodeURIComponent(
      userId
    )}&email=${encodeURIComponent(newEmail)}&token=${token}`
  );
  return {
    to: newEmail,
    subject: 'Confirm your new Hero Nexus email',
    text: [
      'A Hero Nexus account asked to change its email address to this one.',
      '',
      'Confirm the change:',
      link,
      '',
      "This link expires in 1 hour. If you didn't request this, ignore this email — nothing changes.",
    ].join('\n'),
  };
}
