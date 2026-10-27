import 'server-only';

/**
 * The three hosted providers, called with the user's own key.
 *
 * Each host is a constant here and nothing a user types can change it — the
 * same guard `validateWebhookUrl` is for Discord. There is no "custom base
 * URL": a URL a user enters is a URL the server will fetch, and that is an
 * SSRF hole.
 *
 * Plain `fetch` with JSON mode rather than an SDK per provider: three small
 * request shapes, no new dependencies, and every outbound byte visible in one
 * file. Output is not trusted to match a schema — the caller runs it through
 * the content schemas, whose every leaf degrades on its own (content-model
 * rule 4).
 */

import type { AiProvider } from '@/@creator/ai/lib';

export { AI_PROVIDERS, type AiProvider } from '@/@creator/ai/lib';

const OPENAI = 'https://api.openai.com';
const ANTHROPIC = 'https://api.anthropic.com';
const GEMINI = 'https://generativelanguage.googleapis.com';

/** Long enough for a full class to be written; short enough to give up. */
const DRAFT_TIMEOUT_MS = 90_000;
const LIST_TIMEOUT_MS = 10_000;

/** What went wrong, as a code the action layer turns into a sentence. */
function failure(status: number): Error {
  if (status === 401 || status === 403) return new Error('AI_KEY_REJECTED');
  if (status === 429) return new Error('AI_RATE_LIMITED');
  if (status === 404) return new Error('AI_MODEL_MISSING');
  return new Error('AI_FAILED');
}

async function call(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('AI_TIMEOUT');
    }
    throw new Error('AI_UNREACHABLE');
  }
  if (!res.ok) throw failure(res.status);
  return res.json();
}

/**
 * The text models this key can use, newest-looking first.
 *
 * Doubles as the key check on save: a key that cannot list models cannot
 * draft either, and listing costs nothing.
 */
export async function listModels(
  provider: AiProvider,
  apiKey: string
): Promise<string[]> {
  if (provider === 'openai') {
    const body = (await call(
      `${OPENAI}/v1/models`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      LIST_TIMEOUT_MS
    )) as { data?: { id?: string }[] };
    return (body.data ?? [])
      .map(m => m.id ?? '')
      .filter(
        id =>
          /^(gpt-|o\d|chatgpt-)/.test(id) &&
          !/(audio|realtime|tts|transcribe|image|search|embedding|instruct)/.test(
            id
          )
      )
      .sort()
      .reverse();
  }
  if (provider === 'anthropic') {
    const body = (await call(
      `${ANTHROPIC}/v1/models?limit=100`,
      {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      },
      LIST_TIMEOUT_MS
    )) as { data?: { id?: string }[] };
    // Already newest first.
    return (body.data ?? []).map(m => m.id ?? '').filter(Boolean);
  }
  const body = (await call(
    `${GEMINI}/v1beta/models?pageSize=200`,
    { headers: { 'x-goog-api-key': apiKey } },
    LIST_TIMEOUT_MS
  )) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[];
  };
  return (body.models ?? [])
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => (m.name ?? '').replace(/^models\//, ''))
    .filter(
      id => id.startsWith('gemini') && !/(embedding|image|tts|live)/.test(id)
    )
    .sort()
    .reverse();
}

/** A sensible first pick from a key's models: mid-sized, not the priciest. */
export function defaultModel(provider: AiProvider, models: string[]): string {
  const prefer: Record<AiProvider, RegExp[]> = {
    openai: [/^gpt-[\d.]+-mini$/, /mini/],
    anthropic: [/sonnet/],
    gemini: [/flash(?!.*lite)/],
  };
  for (const pattern of prefer[provider]) {
    const hit = models.find(m => pattern.test(m));
    if (hit) return hit;
  }
  return models[0] ?? '';
}

export interface DraftCall {
  provider: AiProvider;
  model: string;
  apiKey: string;
  system: string;
  prompt: string;
}

/** One request, one JSON object back. Returns the model's raw text. */
export async function generateJson(req: DraftCall): Promise<string> {
  const { provider, model, apiKey, system, prompt } = req;

  if (provider === 'openai') {
    const body = (await call(
      `${OPENAI}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      },
      DRAFT_TIMEOUT_MS
    )) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? '';
  }

  if (provider === 'anthropic') {
    const body = (await call(
      `${ANTHROPIC}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8000,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      },
      DRAFT_TIMEOUT_MS
    )) as { content?: { type?: string; text?: string }[] };
    return (body.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('');
  }

  const body = (await call(
    `${GEMINI}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
    DRAFT_TIMEOUT_MS
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map(p => p.text ?? '')
    .join('');
}

/**
 * The JSON object in a model's reply. A model asked for bare JSON still
 * sometimes fences it, says a sentence first, or writes one object, thinks
 * better of it and writes a corrected one after — so every complete
 * top-level object is found, braces inside strings ignored, and the last one
 * that parses is the answer.
 */
export function extractJson(text: string): unknown {
  let found: unknown = undefined;
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"' && depth > 0) inString = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        try {
          found = JSON.parse(text.slice(start, i + 1));
        } catch {
          // Not an object after all; keep looking.
        }
      }
    }
  }
  if (found === undefined || found === null || typeof found !== 'object') {
    throw new Error('AI_BAD_REPLY');
  }
  return found;
}
