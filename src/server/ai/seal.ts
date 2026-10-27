import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

/**
 * Sealing a user's AI provider key at rest.
 *
 * AES-256-GCM under a key derived from `AI_KEY_SECRET`, with the owner's user
 * id as associated data, so a sealed value copied onto another user's row does
 * not open. Its own secret rather than `AUTH_SECRET`: rotating the session
 * secret should sign everybody out, not silently destroy every saved key.
 *
 * What this protects against is a copy of the database — a stolen file, a
 * backup in somebody else's bucket. It does not protect against whoever runs
 * the server, who holds the secret; the settings page says so.
 */

const VERSION = 'v1';

function secretKey(): Buffer {
  const secret = process.env.AI_KEY_SECRET;
  if (!secret || secret.length < 16) throw new Error('AI_NOT_CONFIGURED');
  return createHash('sha256').update(secret).digest();
}

/** True when the operator has set a secret, so keys can be saved at all. */
export function sealingConfigured(): boolean {
  const secret = process.env.AI_KEY_SECRET;
  return Boolean(secret && secret.length >= 16);
}

export function seal(plain: string, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  cipher.setAAD(Buffer.from(userId));
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    body.toString('base64'),
  ].join('.');
}

export function unseal(sealed: string, userId: string): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error('AI_KEY_UNREADABLE');
  }
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      secretKey(),
      Buffer.from(iv, 'base64')
    );
    decipher.setAAD(Buffer.from(userId));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // A changed AI_KEY_SECRET lands here. The key is gone; the user re-enters it.
    throw new Error('AI_KEY_UNREADABLE');
  }
}
