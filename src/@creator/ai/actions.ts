'use server';

import { z } from 'zod';

import { CONTENT_TYPES } from '@/@shared/content';

import {
  draftEncounter,
  draftHomebrew,
  draftNpc,
  MAX_PROMPT,
  type EncounterDraft,
  type HomebrewDraft,
  type NpcDraft,
} from '@/server/ai/drafts';
import {
  getAiSettings,
  listAiModels,
  removeAiKey,
  saveAiKey,
  setAiModel,
  type AiSettings,
} from '@/server/ai/keys';

import { AI_ERRORS, AI_PROVIDERS } from './lib';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  if (!AI_ERRORS[code]) console.error('[ai]', fallback, err);
  return { ok: false, error: AI_ERRORS[code] ?? fallback };
}

export async function getAiSettingsAction(): Promise<Result<AiSettings>> {
  try {
    return { ok: true, data: await getAiSettings() };
  } catch (err) {
    return fail(err, 'Failed to read your AI settings.');
  }
}

const keySchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().trim().min(8, 'That does not look like a key.').max(400),
});

export async function saveAiKeyAction(
  input: unknown
): Promise<Result<{ models: string[]; model: string }>> {
  const parsed = keySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    return {
      ok: true,
      data: await saveAiKey(parsed.data.provider, parsed.data.apiKey),
    };
  } catch (err) {
    return fail(err, 'Failed to save the key.');
  }
}

export async function listAiModelsAction(): Promise<Result<string[]>> {
  try {
    return { ok: true, data: await listAiModels() };
  } catch (err) {
    return fail(err, 'Failed to ask the provider for its models.');
  }
}

export async function setAiModelAction(model: unknown): Promise<Result> {
  const parsed = z.string().trim().min(1).max(120).safeParse(model);
  if (!parsed.success) return { ok: false, error: 'Pick a model.' };
  try {
    await setAiModel(parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to change the model.');
  }
}

export async function removeAiKeyAction(): Promise<Result> {
  try {
    await removeAiKey();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to remove the key.');
  }
}

const promptSchema = z
  .string()
  .trim()
  .min(3, 'Say what you want drafted.')
  .max(MAX_PROMPT, `Keep it under ${MAX_PROMPT} characters.`);

export async function draftHomebrewAction(
  type: unknown,
  prompt: unknown
): Promise<Result<HomebrewDraft>> {
  const t = z.enum(CONTENT_TYPES).safeParse(type);
  const p = promptSchema.safeParse(prompt);
  if (!t.success) return { ok: false, error: 'Pick a kind of homebrew.' };
  if (!p.success) {
    return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    return { ok: true, data: await draftHomebrew(t.data, p.data) };
  } catch (err) {
    return fail(err, 'Failed to draft it.');
  }
}

export async function draftEncounterAction(
  campaignId: string,
  prompt: unknown
): Promise<Result<EncounterDraft>> {
  const p = promptSchema.safeParse(prompt);
  if (!p.success) {
    return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    return { ok: true, data: await draftEncounter(campaignId, p.data) };
  } catch (err) {
    return fail(err, 'Failed to draft the fight.');
  }
}

export async function draftNpcAction(
  campaignId: string,
  placeId: string | null,
  prompt: unknown
): Promise<Result<NpcDraft>> {
  const p = promptSchema.safeParse(prompt);
  if (!p.success) {
    return { ok: false, error: p.error.issues[0]?.message ?? 'Invalid.' };
  }
  try {
    return { ok: true, data: await draftNpc(campaignId, placeId, p.data) };
  } catch (err) {
    return fail(err, 'Failed to draft them.');
  }
}
