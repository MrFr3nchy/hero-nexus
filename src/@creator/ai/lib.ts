/**
 * The providers AI drafting can use, for the server and the settings page
 * alike. No React, no db, no network.
 */

export const AI_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  gemini: 'Google (Gemini)',
};

/** Where each provider hands out keys, for the line under the field. */
export const AI_KEY_PAGE: Record<AiProvider, string> = {
  openai: 'platform.openai.com/api-keys',
  anthropic: 'console.anthropic.com/settings/keys',
  gemini: 'aistudio.google.com/apikey',
};

/**
 * What each failure code means, said to the person who hit it. Here rather
 * than in the actions so the account page can say why the last draft failed
 * from the code stored on the key.
 */
export const AI_ERRORS: Record<string, string> = {
  NOT_AUTHENTICATED: 'You are not signed in.',
  SESSION_STALE: 'Your session is out of date. Sign in again.',
  NOT_FOUND: 'That no longer exists.',
  FORBIDDEN: 'AI drafting is for DMs — run a table to use it.',
  AI_NOT_CONFIGURED:
    'This server has not been set up for AI drafting. Whoever runs it needs to set AI_KEY_SECRET.',
  AI_NO_KEY: 'Add an AI key on your account page first.',
  AI_KEY_UNREADABLE:
    'Your saved key can no longer be read — the server’s secret changed. Enter it again.',
  AI_KEY_REJECTED: 'The provider turned that key down. Check it and try again.',
  AI_RATE_LIMITED:
    'The provider says this key is over its limit or out of credit.',
  AI_MODEL_MISSING:
    'That model is not available to this key. Pick another on your account page.',
  AI_NO_MODELS: 'That key works, but it cannot use any text models.',
  AI_TIMEOUT: 'The provider took too long to answer. Try again.',
  AI_UNREACHABLE: 'The provider could not be reached.',
  AI_BAD_REPLY: 'The draft came back unreadable. Try again, or reword it.',
  AI_NO_CREATURES: 'There are no creatures in the bestiary to choose from.',
  AI_NOTHING_TO_PLACE: 'Put a creature in the fight first.',
  AI_BOARD_TOO_BIG:
    'That floor is too big to send whole. Place them by hand, or on a smaller floor.',
  AI_SLOW_DOWN:
    'That is a lot of drafting for one hour. Give it a little while.',
  AI_FAILED: 'The provider could not write that draft.',
};
