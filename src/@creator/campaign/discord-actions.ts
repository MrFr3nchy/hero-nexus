'use server';

import { z } from 'zod';

import { DISCORD_TRIGGERS } from '@/@creator/campaign/lib/discord';
import {
  getDiscordSettings,
  getMyDiscord,
  saveDiscordSettings,
  sendDiscordTest,
  setMyDiscordUserId,
  type DiscordSettingsView,
} from '@/server/discord';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That campaign is not yours to change.',
    FORBIDDEN: 'Only the DM connects Discord.',
    BAD_WEBHOOK:
      'That is not a Discord webhook URL. In Discord: channel settings → Integrations → Webhooks → Copy Webhook URL.',
    NO_WEBHOOK: 'Paste a webhook URL first.',
    BAD_DISCORD_ID:
      'A Discord user ID is 17 to 20 digits. Copy it from your profile with Developer Mode on.',
    RATE_LIMITED: 'That is enough tests for a minute.',
  };
  if (!messages[code]) console.error('[discord-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

export async function getDiscordSettingsAction(
  campaignId: string
): Promise<Result<DiscordSettingsView>> {
  try {
    return { ok: true, data: await getDiscordSettings(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the Discord settings.');
  }
}

const saveSchema = z.object({
  webhookUrl: z.string().max(400).nullable().optional(),
  events: z
    .object(Object.fromEntries(DISCORD_TRIGGERS.map(t => [t, z.boolean()])))
    .partial()
    .optional(),
});

/** Post to Discord: save the webhook and which moments it hears. */
export async function saveDiscordSettingsAction(
  campaignId: string,
  input: unknown
): Promise<Result<DiscordSettingsView>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That did not read.' };
  try {
    return {
      ok: true,
      data: await saveDiscordSettings(campaignId, parsed.data),
    };
  } catch (err) {
    return fail(err, 'Could not save the Discord settings.');
  }
}

export async function sendDiscordTestAction(
  campaignId: string
): Promise<Result<{ error: string | null }>> {
  try {
    const res = await sendDiscordTest(campaignId);
    return { ok: true, data: { error: res.error } };
  } catch (err) {
    return fail(err, 'Could not send a test message.');
  }
}

export async function getMyDiscordAction(
  campaignId: string
): Promise<Result<{ connected: boolean; discordUserId: string | null }>> {
  try {
    return { ok: true, data: await getMyDiscord(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read your Discord ID.');
  }
}

export async function setMyDiscordUserIdAction(
  campaignId: string,
  discordUserId: string | null
): Promise<Result> {
  if (discordUserId !== null && typeof discordUserId !== 'string') {
    return { ok: false, error: 'That did not read.' };
  }
  try {
    await setMyDiscordUserId(campaignId, discordUserId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save your Discord ID.');
  }
}
