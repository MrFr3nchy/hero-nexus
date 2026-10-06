'use server';

import { z } from 'zod';

import {
  MAX_ENTRIES,
  MAX_ENTRY_TEXT,
  MAX_TITLE,
  type RandomTableRow,
} from '@/@creator/campaign/lib/random-tables';
import {
  createRandomTable,
  deleteRandomTable,
  findRandomTable,
  listRandomTables,
  rollRandomTable,
  updateRandomTable,
  type RandomTableResult,
} from '@/server/random-tables';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That random table is not at this campaign.',
    FORBIDDEN: 'Random tables are the DM’s.',
    NO_TITLE: 'A random table needs a name.',
    EMPTY_TABLE: 'That random table has nothing on it to roll.',
  };
  if (!messages[code]) console.error('[random-table-action]', fallback, err);
  return { ok: false, error: messages[code] ?? fallback };
}

const entries = z
  .array(
    z.object({
      text: z.string().max(MAX_ENTRY_TEXT),
      weight: z.number().int().min(1).max(100),
    })
  )
  .max(MAX_ENTRIES);

export async function listRandomTablesAction(
  campaignId: string
): Promise<Result<RandomTableRow[]>> {
  try {
    return { ok: true, data: await listRandomTables(campaignId) };
  } catch (err) {
    return fail(err, 'Could not read the random tables.');
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE),
  entries: entries.optional(),
});

export async function createRandomTableAction(
  campaignId: string,
  input: unknown
): Promise<Result<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'A random table needs a name.' };
  try {
    return {
      ok: true,
      data: { id: await createRandomTable(campaignId, parsed.data) },
    };
  } catch (err) {
    return fail(err, 'Could not write that random table.');
  }
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE).optional(),
  entries: entries.optional(),
});

export async function updateRandomTableAction(
  id: string,
  input: unknown
): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That did not read.' };
  try {
    await updateRandomTable(id, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save that random table.');
  }
}

export async function deleteRandomTableAction(id: string): Promise<Result> {
  try {
    await deleteRandomTable(id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not take that random table down.');
  }
}

export async function rollRandomTableAction(
  id: string,
  show: boolean
): Promise<Result<RandomTableResult>> {
  try {
    return { ok: true, data: await rollRandomTable(id, show === true) };
  } catch (err) {
    return fail(err, 'The dice did not land.');
  }
}

/** The capture box's `roll <name>`: find it by name, then roll it. */
export async function rollRandomTableByNameAction(
  campaignId: string,
  title: string
): Promise<Result<RandomTableResult>> {
  try {
    const table = await findRandomTable(campaignId, String(title));
    if (!table) {
      return { ok: false, error: `No random table called “${title}”.` };
    }
    return { ok: true, data: await rollRandomTable(table.id, false) };
  } catch (err) {
    return fail(err, 'The dice did not land.');
  }
}
