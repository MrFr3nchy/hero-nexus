'use server';

import { z } from 'zod';

import type { DdbFacts } from '@/@creator/character/lib/ddb-import';
import {
  importDdbCharacter,
  previewDdbImport,
  type DdbPreview,
} from '@/server/ddb-import';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
  };
  if (!messages[code]) console.error('[ddb-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const text = (max: number) => z.string().max(max);
const score = z.number().int().min(1).max(30);

/**
 * The facts the browser extracted. Re-checked here, because they came from
 * the client: the sheet schema would refuse nonsense later anyway, but a
 * refusal here says which part.
 */
const factsSchema = z.object({
  name: text(80),
  classes: z
    .array(
      z.object({
        name: text(60),
        subclass: text(60),
        level: z.number().int().min(1).max(20),
        hitDie: z.number().int().min(4).max(12),
      })
    )
    .max(12),
  level: z.number().int().min(1).max(20),
  species: text(80),
  background: text(80),
  alignment: text(40),
  xp: z.number().int().min(0).max(10_000_000),
  abilities: z.object({
    strength: score,
    dexterity: score,
    constitution: score,
    intelligence: score,
    wisdom: score,
    charisma: score,
  }),
  hitPointsMax: z.number().int().min(1).max(9999).nullable(),
  items: z
    .array(
      z.object({
        name: text(160).min(1),
        quantity: z.number().int().min(1).max(9999),
        equipped: z.boolean(),
      })
    )
    .max(200),
  spells: z
    .array(
      z.object({
        name: text(120).min(1),
        level: z.number().int().min(0).max(9).nullable(),
        prepared: z.boolean(),
      })
    )
    .max(500),
  currency: z.object({
    cp: z.number().int().min(0),
    sp: z.number().int().min(0),
    ep: z.number().int().min(0),
    gp: z.number().int().min(0),
    pp: z.number().int().min(0),
  }),
  notes: z.object({
    backstory: text(4000),
    personality: text(10000),
    appearance: text(2000),
    other: text(14000),
  }),
  warnings: z.array(text(400)).max(20),
});

function read(input: unknown): DdbFacts | null {
  const parsed = factsSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export async function previewDdbImportAction(
  facts: unknown
): Promise<Result<DdbPreview>> {
  const clean = read(facts);
  if (!clean) return { ok: false, error: 'That character did not read.' };
  try {
    return { ok: true, data: await previewDdbImport(clean) };
  } catch (err) {
    return fail(err, 'Could not read that character.');
  }
}

export async function importDdbCharacterAction(
  facts: unknown
): Promise<Result<{ id: string }>> {
  const clean = read(facts);
  if (!clean) return { ok: false, error: 'That character did not read.' };
  try {
    return { ok: true, data: { id: await importDdbCharacter(clean) } };
  } catch (err) {
    return fail(err, 'Could not import that character.');
  }
}
