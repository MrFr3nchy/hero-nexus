'use server';

import type { ScreenLayout } from './lib/screen';
import { getScreen, saveScreen, type ScreenState } from '@/server/screen';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function getScreenAction(
  campaignId: string
): Promise<ScreenState> {
  return getScreen(campaignId);
}

export async function saveScreenAction(
  campaignId: string,
  layout: unknown
): Promise<Result<ScreenLayout>> {
  try {
    return { ok: true, data: await saveScreen(campaignId, layout) };
  } catch (err) {
    const code = err instanceof Error ? err.message : '';
    const messages: Record<string, string> = {
      NOT_AUTHENTICATED: 'You are not signed in.',
      NOT_FOUND: 'That table no longer exists.',
      FORBIDDEN: 'You are not at this table.',
    };
    if (!messages[code]) console.error('[action] saveScreen', err);
    return { ok: false, error: messages[code] ?? 'Failed to save the screen.' };
  }
}
