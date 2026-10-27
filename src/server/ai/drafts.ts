import 'server-only';

import {
  contentMeta,
  emptyContentData,
  formatChallenge,
  parseContentData,
  type ContentRef,
  type ContentType,
} from '@/@shared/content';

import { and, asc, eq } from 'drizzle-orm';

import {
  canStand,
  sketchLevel,
  takenTiles,
} from '@/@creator/campaign/lib/board-sketch';
import { CANON_KIND_FIELDS } from '@/@creator/campaign/lib/canon';
import type { PlanSpot } from '@/@creator/campaign/lib/plan-spots';
import { defaultLevelId, levelOf } from '@/@shared/battlemap/types';
import type { DdbFacts } from '@/@creator/character/lib/ddb-import';
import { ABILITY_KEYS } from '@/@creator/character/schema';
import { db } from '@/db';
import { canonEntries, encounterPlanLines, encounterPlans } from '@/db/schema';

import { getBoardTerrain } from '../battlemap';
import { staffForMap } from '../battlemap/shared';
import { requireCampaignRole } from '../campaigns';
import { listCombatantChoices, listPickableContent } from '../content';
import { previewDdbImport, type DdbPreview } from '../ddb-import';
import { partyFacts } from '../encounter-plans';
import { statChoices } from '../npcs';
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
  /**
   * The creature they fight as, picked from what this table may use — the
   * same list the card's own stat-block picker offers. Null for somebody who
   * would never pick up a sword.
   */
  statBlock: { ref: ContentRef; name: string; challengeRating: number } | null;
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

  const choices = await statChoices(campaignId);
  const byKey = new Map(choices.map(c => [c.key, c]));
  const roster = choices
    .slice(0, MAX_CANDIDATES)
    .map(c => `${c.key} | ${c.name} | CR ${formatChallenge(c.challengeRating)}`)
    .join('\n');

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
      statBlock: 'string',
    }),
    'Every value is a string. Personality, voice and looks are what the party would notice, a sentence each. `status` is usually "Alive".',
    '`dmBody` is for the DM only: what they want, what they hide, and a hook for the party — under 120 words.',
    '`statBlock` is the creature they would fight as, named by its key (the text before the first "|") from this list, or "" if they would not fight:',
    roster,
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
  const pick = byKey.get(asText(out.statBlock, 200));
  return {
    name,
    fields,
    dmBody: asText(out.dmBody, 8000),
    statBlock: pick
      ? {
          ref: pick.ref,
          name: pick.name,
          challengeRating: pick.challengeRating,
        }
      : null,
  };
}

/* --- heroes ------------------------------------------------------------- */

/**
 * A whole hero, drafted into the facts a D&D Beyond import carries.
 *
 * Deliberately the import's shape and the import's path: the preview it
 * returns is `previewDdbImport`'s, matching gear and spells to the SRD by
 * name, and the draft only becomes a character through
 * `importDdbCharacterAction` when the DM presses for it — then it opens in
 * the builder, where the rules check every pick. One road in for a sheet
 * that was not built in the builder, not two.
 */
export async function draftCharacter(prompt: string): Promise<DdbPreview> {
  const userId = await requireUserId();
  if (!(await runsATable(userId))) throw new Error('FORBIDDEN');

  const [classes, species, backgrounds] = await Promise.all([
    listPickableContent('class'),
    listPickableContent('species'),
    listPickableContent('background'),
  ]);
  const names = (list: { name: string }[]) => list.map(e => e.name).join(', ');

  const system = [
    'You build player characters for the Dungeons & Dragons 2024 rules, as a DM would for a pregenerated hero or an adventuring NPC.',
    `Class must be one of: ${names(classes)}.`,
    `Species must be one of: ${names(species)}.`,
    `Background must be one of: ${names(backgrounds)}.`,
    'Use the 2024 rules: ability scores by standard array or point buy before background increases, hit points by the class hit die averaged, gear and spells a character of that class and level would really have. Name gear and spells exactly as the 2024 System Reference Document does.',
    'Reply with one JSON object and nothing else, of this form:',
    JSON.stringify({
      name: 'string',
      class: 'string',
      subclass: 'string ("" below the level it is chosen)',
      level: 'number 1-20',
      species: 'string',
      background: 'string',
      alignment: 'string',
      abilities: Object.fromEntries(ABILITY_KEYS.map(k => [k, 'number'])),
      hitPointsMax: 'number',
      items: [{ name: 'string', quantity: 'number', equipped: 'boolean' }],
      spells: [{ name: 'string', level: 'number', prepared: 'boolean' }],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      notes: {
        backstory: 'string, under 150 words',
        personality: 'string: traits, ideal, bond, flaw',
        appearance: 'string',
      },
    }),
  ].join('\n');

  const out = (await draft(userId, system, prompt)) as Record<string, unknown>;
  return previewDdbImport(heroFacts(out, classes, species, backgrounds));
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};

/** The name as the catalog spells it, or as the model did when nothing matched. */
function canonical(name: string, list: { name: string }[]): string {
  const lower = name.toLowerCase();
  return list.find(e => e.name.toLowerCase() === lower)?.name ?? name;
}

/**
 * The model's reply, held to what the import's own schema accepts. Every
 * field is clamped or defaulted rather than refused: a hero with a missing
 * backstory is still a hero to finish in the builder.
 */
export function heroFacts(
  out: Record<string, unknown>,
  classes: { name: string; data: unknown }[],
  species: { name: string }[],
  backgrounds: { name: string }[]
): DdbFacts {
  const name = asText(out.name, 80);
  if (!name) throw new Error('AI_BAD_REPLY');

  const className = canonical(asText(out.class, 60), classes);
  const classData = obj(classes.find(c => c.name === className)?.data);
  const hitDie = int(classData.hitDie, 4, 12, 8);
  const level = int(out.level, 1, 20, 1);

  const abilitiesIn = obj(out.abilities);
  const abilities = Object.fromEntries(
    ABILITY_KEYS.map(k => [k, int(abilitiesIn[k], 3, 20, 10)])
  ) as DdbFacts['abilities'];

  const items = (Array.isArray(out.items) ? out.items : [])
    .slice(0, 40)
    .map(raw => {
      const i = obj(raw);
      return {
        name: asText(i.name, 160),
        quantity: int(i.quantity, 1, 999, 1),
        equipped: i.equipped === true,
      };
    })
    .filter(i => i.name);

  const spells = (Array.isArray(out.spells) ? out.spells : [])
    .slice(0, 60)
    .map(raw => {
      const sp = obj(raw);
      return {
        name: asText(sp.name, 120),
        level: Number.isFinite(Number(sp.level))
          ? int(sp.level, 0, 9, 0)
          : null,
        prepared: sp.prepared !== false,
      };
    })
    .filter(sp => sp.name);

  const coin = obj(out.currency);
  const notes = obj(out.notes);
  const hp = Number(out.hitPointsMax);

  return {
    name,
    classes: className
      ? [
          {
            name: className,
            subclass: asText(out.subclass, 60),
            level,
            hitDie,
          },
        ]
      : [],
    level,
    species: canonical(asText(out.species, 80), species),
    background: canonical(asText(out.background, 80), backgrounds),
    alignment: asText(out.alignment, 40),
    xp: 0,
    abilities,
    hitPointsMax: Number.isFinite(hp) && hp >= 1 ? int(hp, 1, 999, 1) : null,
    items,
    spells,
    currency: {
      cp: int(coin.cp, 0, 100_000, 0),
      sp: int(coin.sp, 0, 100_000, 0),
      ep: int(coin.ep, 0, 100_000, 0),
      gp: int(coin.gp, 0, 100_000, 0),
      pp: int(coin.pp, 0, 100_000, 0),
    },
    notes: {
      backstory: asText(notes.backstory, 4000),
      personality: asText(notes.personality, 4000),
      appearance: asText(notes.appearance, 2000),
      other: '',
    },
    warnings: [
      'Drafted with AI. Check every pick in the builder before this hero plays — the rules check runs there, not here.',
    ],
  };
}

/* --- placing an encounter on a battle board ------------------------------ */

export interface PlacementDraft {
  mapId: string;
  /** Which line stands where. A line may come back with fewer spots than copies. */
  lines: { lineId: string; name: string; count: number; spots: PlanSpot[] }[];
  /** How the model set them out, for the DM to read before keeping it. */
  notes: string;
}

/** A floor larger than this is more grid than a prompt should carry. */
const MAX_TILES = 64 * 64;

/**
 * Where a planned fight's creatures stand on one floor of a board.
 *
 * The model is shown the floor as text — tiles, walls, rooms, who is
 * already there — and answers with tiles per line. Every tile is checked
 * against the floor with `canStand` and the rest dropped; the result is
 * only ever kept through `setPlanLineSpotsAction`, the same as tapping the
 * tiles in by hand.
 */
export async function draftPlacement(
  planId: string,
  mapId: string,
  levelId: string | null,
  prompt: string
): Promise<PlacementDraft> {
  const plan = await db.query.encounterPlans.findFirst({
    where: eq(encounterPlans.id, planId),
  });
  if (!plan) throw new Error('NOT_FOUND');
  const { userId } = await requireCampaignRole(plan.campaignId, [
    'gm',
    'co-gm',
  ]);
  const { map } = await staffForMap(mapId);
  if (map.campaignId !== plan.campaignId) throw new Error('NOT_FOUND');

  const lines = await db
    .select()
    .from(encounterPlanLines)
    .where(eq(encounterPlanLines.planId, planId))
    .orderBy(asc(encounterPlanLines.sortOrder));
  if (lines.length === 0) throw new Error('AI_NOTHING_TO_PLACE');

  const { terrain, taken } = await getBoardTerrain(mapId);
  const level = levelOf(terrain, levelId);
  if (level.w * level.h > MAX_TILES) throw new Error('AI_BOARD_TOO_BIG');
  const blocked = takenTiles(taken.filter(t => t.level === level.id));

  const system = [
    'You set out a Dungeons & Dragons fight on a battle board for the DM, before the party arrives.',
    sketchLevel(level, blocked),
    'The creatures, by line number:',
    ...lines.map((l, i) => `${i + 1}. ${l.count} × ${l.name}`),
    'Put each copy on its own tile marked . ~ or p. Use the walls, rooms and cover the way these creatures would fight.',
    'Reply with one JSON object and nothing else:',
    '{"lines": [{"line": number, "spots": [[x, y]]}], "notes": string}',
    '`notes` is one or two sentences for the DM on the set-up.',
  ].join('\n');

  const out = (await draft(userId, system, prompt)) as Record<string, unknown>;

  const used = new Set(blocked);
  const floor = level.id === defaultLevelId(terrain) ? {} : { level: level.id };
  const byLine = new Map<number, unknown[]>();
  for (const raw of Array.isArray(out.lines) ? out.lines : []) {
    const entry = raw as Record<string, unknown>;
    const n = Math.trunc(Number(entry.line));
    if (Array.isArray(entry.spots)) byLine.set(n, entry.spots);
  }

  const placed = lines.map((line, i) => {
    const spots: PlanSpot[] = [];
    for (const raw of byLine.get(i + 1) ?? []) {
      if (spots.length >= line.count) break;
      const pair = Array.isArray(raw)
        ? raw
        : [
            (raw as Record<string, unknown>)?.x,
            (raw as Record<string, unknown>)?.y,
          ];
      const x = Number(pair[0]);
      const y = Number(pair[1]);
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      if (!canStand(level, used, x, y)) continue;
      used.add(`${x},${y}`);
      spots.push({ mapId, x, y, ...floor });
    }
    return { lineId: line.id, name: line.name, count: line.count, spots };
  });
  if (placed.every(l => l.spots.length === 0)) throw new Error('AI_BAD_REPLY');

  return { mapId, lines: placed, notes: asText(out.notes, 1000) };
}
