'use server';

import { z } from 'zod';

import {
  castSpell,
  dropConcentration,
  listCastable,
  revertForm,
  takeForm,
  type CastableSpell,
  type CastResult,
} from '@/server/casting';
import { requestCheckFrom } from '@/server/checks';
import { RuleRefusal } from '@/server/table-rules';

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | Refusal;

/**
 * `overridable` is set only when the rules refused and the caller is staff:
 * the control shows "Do it anyway" and re-sends with `{ ruling: true }`.
 * Decided on the server (`RuleRefusal`), never in the browser.
 */
type Refusal = { ok: false; error: string; overridable?: boolean };

function fail(err: unknown, fallback: string): Refusal {
  const code = err instanceof Error ? err.message : '';
  const messages: Record<string, string> = {
    NOT_AUTHENTICATED: 'You are not signed in.',
    SESSION_STALE: 'Your session is out of date. Sign in again.',
    NOT_FOUND: 'That is no longer here.',
    FORBIDDEN: 'That is not yours to do.',
    NO_SUCH_SPELL: 'That spell is not on any shelf this table can see.',
    NO_FIGHT:
      'Naming combatants needs a fight running; at the desk, name party members.',
    NO_BOARD: 'An area needs a board on the table.',
    NO_SLOT: 'No slot of that level is left.',
    ALREADY_ACTED: 'The action is spent this turn.',
    INCAPACITATED: 'They cannot act this turn.',
    NO_SUCH_CREATURE: 'That creature is not in the bestiary.',
    BAD_NOTATION: 'The spell carries no dice the app can roll.',
  };
  if (!messages[code]) console.error('[casting-action]', fallback, err);
  return {
    ok: false,
    error: messages[code] ?? fallback,
    ...(err instanceof RuleRefusal && err.overridable
      ? { overridable: true }
      : {}),
  };
}

const tile = z.object({
  x: z.number().int().min(0).max(200),
  y: z.number().int().min(0).max(200),
});

const targetsSchema = z.union([
  z.object({ entryIds: z.array(z.string().min(1).max(64)).max(50) }),
  z.object({ characterIds: z.array(z.string().min(1).max(64)).max(20) }),
  z.object({
    area: z.object({
      shape: z.enum([
        'sphere',
        'cube',
        'cone',
        'line',
        'cylinder',
        'emanation',
      ]),
      level: z.string().min(1).max(32).optional(),
      origin: tile,
      direction: tile.optional(),
      size: z.number().int().min(5).max(1000),
      width: z.number().int().min(0).max(100).optional(),
    }),
  }),
  z.object({ none: z.literal(true) }),
]);

const castSchema = z.object({
  campaignId: z.string().min(1).max(64),
  characterId: z.string().min(1).max(64),
  spellKey: z.string().min(1).max(200),
  slotLevel: z.number().int().min(0).max(9).nullable(),
  ritual: z.boolean().optional(),
  targets: targetsSchema,
  ruling: z.boolean().optional(),
});

export type CastActionInput = z.infer<typeof castSchema>;

/**
 * Cast. The server pays, rolls, lands and asks; the asks it hands back — a
 * save for a hero, a fellow player's consent — are put to the table here.
 */
export async function castSpellAction(
  input: unknown
): Promise<Result<CastResult>> {
  const parsed = castSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'That casting makes no sense.' };
  try {
    const result = await castSpell(parsed.data);
    for (const ask of result.asks) {
      await requestCheckFrom(parsed.data.campaignId, ask.asker, ask.input);
    }
    return { ok: true, data: result };
  } catch (err) {
    return fail(err, 'The spell fizzled.');
  }
}

/** Drop what is held, on purpose. The holder's player, or staff. */
export async function dropConcentrationAction(
  entryId: string
): Promise<Result> {
  try {
    await dropConcentration(entryId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not drop that.');
  }
}

const formSchema = z.object({
  creatureRef: z.object({
    source: z.enum(['srd', 'homebrew']),
    type: z.literal('creature'),
    key: z.string().min(1).max(200),
  }),
  carryExcess: z.boolean().optional(),
  rounds: z.number().int().min(1).max(1000).nullable().optional(),
  concentration: z.boolean().optional(),
  sourceEntryId: z.string().max(64).nullable().optional(),
});

/** Polymorph, Wild Shape: wear another block. Staff only. */
export async function takeFormAction(
  entryId: string,
  input: unknown
): Promise<Result> {
  const parsed = formSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'That shape makes no sense.' };
  try {
    await takeForm(entryId, parsed.data);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not change their shape.');
  }
}

export async function revertFormAction(entryId: string): Promise<Result> {
  try {
    await revertForm(entryId);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not revert them.');
  }
}

/** The caster's spells, as the Cast panel lists them. Owner or staff. */
export async function listCastableAction(
  campaignId: string,
  characterId: string
): Promise<CastableSpell[]> {
  try {
    return await listCastable(campaignId, characterId);
  } catch {
    return [];
  }
}
