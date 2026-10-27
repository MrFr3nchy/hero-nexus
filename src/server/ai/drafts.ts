import 'server-only';

import {
  contentMeta,
  emptyContentData,
  formatChallenge,
  parseContentData,
  type ContentRef,
  type ContentType,
} from '@/@shared/content';

import { and, eq } from 'drizzle-orm';

import { CANON_KIND_FIELDS } from '@/@creator/campaign/lib/canon';
import { db } from '@/db';
import { canonEntries } from '@/db/schema';

import { requireCampaignRole } from '../campaigns';
import { listCombatantChoices } from '../content';
import { partyFacts } from '../encounter-plans';
import { rateLimit } from '../rate-limit';
import { MAX_CREATURE_COPIES } from '../session';
import { requireUserId } from '../session-user';
import { keyForDrafting, noteAiOutcome, runsATable } from './keys';
import { extractJson, generateJson } from './providers';

/**
 * Drafting with the user's own AI key.
 *
 * **The AI drafts; the DM saves.** Nothing in this module writes game content.
 * A homebrew draft comes back as the fields the Forge's form holds, and an
 * encounter draft as the lines the planner would add — the DM reads it, edits
 * it, and saves it through the same actions as anything they typed. That
 * keeps the DM the one ruling on what is in their game, and keeps every write
 * on the paths that already validate it.
 */

/** A user's prompt, at most. Long enough for a paragraph of notes. */
export const MAX_PROMPT = 2000;

function limitDrafting(userId: string) {
  const hit = rateLimit(`ai-draft:${userId}`, 30, 60 * 60_000);
  if (!hit.ok) throw new Error('AI_SLOW_DOWN');
}

/** Run one call, keeping the outcome on the key row for the settings card. */
async function draft(
  userId: string,
  system: string,
  prompt: string
): Promise<unknown> {
  limitDrafting(userId);
  const key = await keyForDrafting(userId);
  try {
    const text = await generateJson({ ...key, system, prompt });
    const out = extractJson(text);
    await noteAiOutcome(userId, null);
    return out;
  } catch (err) {
    await noteAiOutcome(
      userId,
      err instanceof Error ? err.message : 'AI_FAILED'
    );
    throw err;
  }
}

function asText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/* --- homebrew ----------------------------------------------------------- */

export interface HomebrewDraft {
  type: ContentType;
  name: string;
  description: string;
  /** Already through the type's schema, so it is safe to put in the form. */
  data: unknown;
}

export async function draftHomebrew(
  type: ContentType,
  prompt: string
): Promise<HomebrewDraft> {
  const userId = await requireUserId();
  if (!(await runsATable(userId))) throw new Error('FORBIDDEN');

  const meta = contentMeta(type);
  // The empty data is the contract: every field the form and the stat block
  // read, with a value of the right type in it. Showing the model that shape
  // is what keeps a draft inside the content model rather than beside it.
  const shape = JSON.stringify(emptyContentData(type), null, 1);
  const system = [
    'You write homebrew content for a Dungeons & Dragons 2024 (5th edition, 2024 rules) campaign tool.',
    `The DM wants a ${meta.label.toLowerCase()}: ${meta.description}`,
    'Reply with one JSON object and nothing else, of this form:',
    '{"name": string, "description": string, "data": object}',
    '`description` is the prose a rulebook entry opens with, in that voice, under 150 words.',
    '`data` must use exactly the field names and value types of this template — fill it in, do not add fields, keep arrays as arrays and numbers as numbers:',
    shape,
    'Keep it balanced against the 2024 rules for its level, rarity or challenge rating.',
  ].join('\n');

  const out = (await draft(userId, system, prompt)) as Record<string, unknown>;
  return {
    type,
    name: asText(out.name, 120),
    description: asText(out.description, 8000),
    // Every leaf degrades on its own (content-model rule 4): a field the model
    // got wrong costs that field, not the draft.
    data: parseContentData(type, out.data),
  };
}

/* --- encounters --------------------------------------------------------- */

export interface EncounterDraftLine {
  ref: ContentRef;
  name: string;
  count: number;
  challengeRating: number;
}

export interface EncounterDraft {
  name: string;
  notes: string;
  lines: EncounterDraftLine[];
}

/** More than a table can track, and more than a prompt should carry. */
const MAX_LINES = 6;
const MAX_CANDIDATES = 400;

export async function draftEncounter(
  campaignId: string,
  prompt: string
): Promise<EncounterDraft> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const [choices, party] = await Promise.all([
    listCombatantChoices(campaignId),
    partyFacts(campaignId),
  ]);
  if (choices.length === 0) throw new Error('AI_NO_CREATURES');

  // The model picks from the bestiary this table can use, by key — it never
  // invents a monster here. Anything it names that is not on the list is
  // dropped below.
  const ceiling = (party.averageLevel ?? 5) + 5;
  const pool =
    choices.length > MAX_CANDIDATES
      ? choices.filter(c => c.challengeRating <= ceiling)
      : choices;
  const byKey = new Map(pool.map(c => [c.key, c]));

  const roster = pool
    .slice(0, MAX_CANDIDATES)
    .map(
      c =>
        `${c.key} | ${c.name} | CR ${formatChallenge(c.challengeRating)} | AC ${c.armorClass} | HP ${c.hitPoints}`
    )
    .join('\n');

  const system = [
    'You plan fights for a Dungeons & Dragons 2024 DM.',
    party.averageLevel !== null
      ? `The party is ${party.size} characters at an average level of ${party.averageLevel}.`
      : `The party is ${party.size} characters; their level is not known.`,
    'Choose creatures ONLY from this list, naming each by its key (the text before the first "|"):',
    roster,
    'Reply with one JSON object and nothing else:',
    `{"name": string, "notes": string, "lines": [{"key": string, "count": number}]}`,
    `At most ${MAX_LINES} lines and ${MAX_CREATURE_COPIES} of any one creature.`,
    '`name` is a short title for the fight. `notes` is for the DM: the set-up, the terrain, how the creatures fight — under 150 words.',
  ].join('\n');

  const out = (await draft(userId, system, prompt)) as Record<string, unknown>;
  const lines: EncounterDraftLine[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(out.lines) ? out.lines : []) {
    const line = raw as Record<string, unknown>;
    const choice = byKey.get(String(line.key ?? ''));
    if (!choice || seen.has(choice.key)) continue;
    seen.add(choice.key);
    const count = Math.trunc(Number(line.count)) || 1;
    lines.push({
      ref: choice.ref,
      name: choice.name,
      count: Math.max(1, Math.min(MAX_CREATURE_COPIES, count)),
      challengeRating: choice.challengeRating,
    });
    if (lines.length >= MAX_LINES) break;
  }
  if (lines.length === 0) throw new Error('AI_BAD_REPLY');

  return {
    name: asText(out.name, 160) || 'Encounter',
    notes: asText(out.notes, 8000),
    lines,
  };
}

/* --- NPCs --------------------------------------------------------------- */

export interface NpcDraft {
  name: string;
  /** The card's facts, by `CANON_KIND_FIELDS.npc` key. Empty ones left out. */
  fields: Record<string, string>;
  /** What only the DM knows: motive, secret, what they want from the party. */
  dmBody: string;
}

/**
 * Somebody who lives in a place, drafted. The place's name and the DM's own
 * notes on it go in, so the innkeeper of a drowned-coast tavern sounds like
 * one; nothing about the party or other NPCs does.
 */
export async function draftNpc(
  campaignId: string,
  placeId: string | null,
  prompt: string
): Promise<NpcDraft> {
  const { userId } = await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const place = placeId
    ? await db.query.canonEntries.findFirst({
        where: and(
          eq(canonEntries.id, placeId),
          eq(canonEntries.campaignId, campaignId)
        ),
        columns: { title: true, dmBody: true },
      })
    : null;

  const defs = CANON_KIND_FIELDS.npc;
  const system = [
    'You write non-player characters for a Dungeons & Dragons 2024 DM.',
    place
      ? `They live in ${place.title}.${place.dmBody ? ` The DM's notes on it: ${place.dmBody.slice(0, 1200)}` : ''}`
      : '',
    'Reply with one JSON object and nothing else, of this form:',
    JSON.stringify({
      name: 'string',
      ...Object.fromEntries(defs.map(d => [d.key, d.label])),
      dmBody: 'string',
    }),
    'Every value is a string. Personality, voice and looks are what the party would notice, a sentence each. `status` is usually "Alive".',
    '`dmBody` is for the DM only: what they want, what they hide, and a hook for the party — under 120 words.',
  ]
    .filter(Boolean)
    .join('\n');

  const out = (await draft(userId, system, prompt)) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const def of defs) {
    const text = asText(out[def.key], def.long ? 400 : 120);
    if (text) fields[def.key] = text;
  }
  const name = asText(out.name, 120);
  if (!name) throw new Error('AI_BAD_REPLY');
  return { name, fields, dmBody: asText(out.dmBody, 8000) };
}
