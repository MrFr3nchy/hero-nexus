import 'server-only';

import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';

import { requireUserId } from './session-user';
import { db } from '@/db';
import {
  campaignMembers,
  campaigns,
  characterAuditLog,
  characterHistory,
  characterHomebrew,
  characters,
  homebrew,
  users,
} from '@/db/schema';
import { mergeCampaignSettings, requireCampaignRole } from '@/server/campaigns';
import { checkSheetAgainstRules } from '@/@creator/campaign/lib/rules';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  characterSheetSchema,
  type CharacterSheet,
  type HomebrewEntry,
} from '@/@creator/character/schema';

export interface CharacterRow {
  id: string;
  name: string;
  class: string;
  species: string;
  level: number;
  background: string;
  rpgSystem: string;
  hasHomebrew: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterAuditEntry {
  id: string;
  kind: string;
  label: string;
  detail: string;
  rolls: number[] | null;
  occurredAt: string;
}

export interface CharacterHistoryEntry {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  kind: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  detail: string;
  rolls: number[] | null;
  occurredAt: string;
}

/** DM-facing view of a linked character: creation trail + post-creation history. */
export interface CharacterAudit {
  provenance: CharacterAuditEntry[];
  history: CharacterHistoryEntry[];
}

export interface CharacterWithSheet extends CharacterRow {
  sheet: CharacterSheet;
}

const listColumns = {
  id: characters.id,
  name: characters.name,
  class: characters.class,
  species: characters.species,
  level: characters.level,
  background: characters.background,
  rpgSystem: characters.rpgSystem,
  hasHomebrew: characters.hasHomebrew,
  createdAt: characters.createdAt,
  updatedAt: characters.updatedAt,
};

export async function listCharacters(): Promise<CharacterRow[]> {
  const userId = await requireUserId();
  return db
    .select(listColumns)
    .from(characters)
    .where(eq(characters.ownerId, userId))
    .orderBy(desc(characters.updatedAt));
}

export async function getCharacter(
  id: string
): Promise<CharacterWithSheet | null> {
  const userId = await requireUserId();
  const row = await db.query.characters.findFirst({
    where: and(eq(characters.id, id), eq(characters.ownerId, userId)),
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    class: row.class,
    species: row.species,
    level: row.level,
    background: row.background,
    rpgSystem: row.rpgSystem,
    hasHomebrew: row.hasHomebrew,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sheet: characterSheetSchema.parse(row.sheet),
  };
}

/**
 * DM / co-DM read-only access to a member's linked character sheet.
 * The caller must be gm/co-gm of the campaign AND the character must be the
 * linked character of one of that campaign's members.
 */
export async function getCharacterForCampaign(
  campaignId: string,
  characterId: string
): Promise<CharacterWithSheet | null> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);

  const link = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId)
    ),
  });
  if (!link) return null;

  const row = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    class: row.class,
    species: row.species,
    level: row.level,
    background: row.background,
    rpgSystem: row.rpgSystem,
    hasHomebrew: row.hasHomebrew,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sheet: characterSheetSchema.parse(row.sheet),
  };
}

function denormalize(sheet: CharacterSheet) {
  return {
    name: sheet.identity.name,
    class: sheet.identity.class,
    species: sheet.identity.species,
    level: sheet.identity.level,
    background: sheet.identity.background,
    rpgSystem: sheet.rpgSystem,
    hasHomebrew: sheet.homebrew.isHomebrew || sheet.homebrew.entries.length > 0,
  };
}

const KIND_TO_HOMEBREW_TYPE: Record<
  HomebrewEntry['kind'],
  'class' | 'spell' | 'item' | 'species' | 'subclass' | 'background' | 'feat'
> = {
  species: 'species',
  class: 'class',
  subclass: 'subclass',
  background: 'background',
  feat: 'feat',
  other: 'item',
};

function entryDescription(entry: HomebrewEntry): string {
  if (entry.traits.length === 0) return '';
  return entry.traits
    .map(t => {
      const parts = [t.name];
      if (t.description) parts.push(t.description);
      if (t.mechanic) parts.push(`(${t.mechanic})`);
      return parts.join(' — ');
    })
    .join('\n');
}

/** Reconcile the homebrew rows + links a character's custom entries imply. */
async function syncCharacterHomebrew(
  characterId: string,
  ownerId: string,
  sheet: CharacterSheet
): Promise<void> {
  const entries = sheet.homebrew.entries;
  const links = await db
    .select()
    .from(characterHomebrew)
    .where(eq(characterHomebrew.characterId, characterId));
  const linkByEntry = new Map(links.map(l => [l.entryId, l]));
  const keepEntryIds = new Set(entries.map(e => e.id));

  // Drop links (and their spawned homebrew rows) for removed entries.
  const stale = links.filter(l => !keepEntryIds.has(l.entryId));
  if (stale.length) {
    await db.delete(characterHomebrew).where(
      inArray(
        characterHomebrew.id,
        stale.map(l => l.id)
      )
    );
    await db.delete(homebrew).where(
      inArray(
        homebrew.id,
        stale.map(l => l.homebrewId)
      )
    );
  }

  for (const entry of entries) {
    const data = {
      source: 'character-creator' as const,
      kind: entry.kind,
      field: entry.field,
      traits: entry.traits,
    };
    const existing = linkByEntry.get(entry.id);
    if (existing) {
      await db
        .update(homebrew)
        .set({
          type: KIND_TO_HOMEBREW_TYPE[entry.kind],
          name: entry.name,
          description: entryDescription(entry),
          data,
          rpgSystem: sheet.rpgSystem,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(homebrew.id, existing.homebrewId));
    } else {
      const [hb] = await db
        .insert(homebrew)
        .values({
          ownerId,
          type: KIND_TO_HOMEBREW_TYPE[entry.kind],
          name: entry.name,
          description: entryDescription(entry),
          data,
          visibility: 'private',
          rpgSystem: sheet.rpgSystem,
        })
        .returning({ id: homebrew.id });
      await db.insert(characterHomebrew).values({
        characterId,
        homebrewId: hb.id,
        entryId: entry.id,
      });
    }
  }
}

/** Mirror the sheet's provenance array into the queryable audit-log table. */
async function syncCharacterAuditLog(
  characterId: string,
  sheet: CharacterSheet
): Promise<void> {
  const entries = sheet.provenance ?? [];
  const ids = entries.map(e => e.id);

  if (ids.length === 0) {
    await db
      .delete(characterAuditLog)
      .where(eq(characterAuditLog.characterId, characterId));
    return;
  }

  await db
    .delete(characterAuditLog)
    .where(
      and(
        eq(characterAuditLog.characterId, characterId),
        notInArray(characterAuditLog.entryId, ids)
      )
    );

  const existing = await db
    .select({ entryId: characterAuditLog.entryId })
    .from(characterAuditLog)
    .where(eq(characterAuditLog.characterId, characterId));
  const known = new Set(existing.map(r => r.entryId));

  const fresh = entries.filter(e => !known.has(e.id));
  if (fresh.length) {
    await db.insert(characterAuditLog).values(
      fresh.map(e => ({
        characterId,
        entryId: e.id,
        kind: e.kind,
        label: e.label,
        detail: e.detail,
        rolls: e.rolls ? JSON.stringify(e.rolls) : null,
        occurredAt: e.at,
      }))
    );
  }
}

export async function createCharacter(input: unknown): Promise<string> {
  const userId = await requireUserId();
  const sheet = characterSheetSchema.parse(input);
  const [row] = await db
    .insert(characters)
    .values({ ownerId: userId, ...denormalize(sheet), sheet })
    .returning({ id: characters.id });
  await syncCharacterHomebrew(row.id, userId, sheet);
  await syncCharacterAuditLog(row.id, sheet);
  return row.id;
}

/**
 * A character linked to one or more campaigns must stay legal for each of
 * those tables. Throws with a reader-facing message naming the campaign(s) and
 * the broken rules; the character can always be unlinked and edited freely.
 */
async function assertSheetLegalForLinkedCampaigns(
  characterId: string,
  sheet: CharacterSheet
): Promise<void> {
  const links = await db
    .select({ campaignId: campaignMembers.campaignId })
    .from(campaignMembers)
    .where(eq(campaignMembers.characterId, characterId));
  if (links.length === 0) return;

  const camps = await db
    .select({
      name: campaigns.name,
      settings: campaigns.settings,
    })
    .from(campaigns)
    .where(
      inArray(
        campaigns.id,
        links.map(l => l.campaignId)
      )
    );

  const problems: string[] = [];
  for (const c of camps) {
    const settings = mergeCampaignSettings(c.settings);
    const violations = checkSheetAgainstRules(sheet, settings.rules, {
      allowHomebrew: settings.allowHomebrew,
    });
    if (violations.length) {
      problems.push(`${c.name}: ${violations.map(v => v.message).join(' ')}`);
    }
  }

  if (problems.length) {
    throw new Error(
      `This character can't be saved while linked to a table it breaks the rules of — ${problems.join(' | ')}`
    );
  }
}

interface HistoryDraft {
  kind: string;
  field: string;
  fromValue: string | null;
  toValue: string | null;
  detail: string;
}

const asValue = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === '' ? null : s;
};

/**
 * Diff two versions of a sheet into history rows. Curated to the fields a DM
 * cares about seeing move over time — identity, level, ability scores, ability
 * method, homebrew entries — not every keystroke. One row per changed field.
 */
function diffSheets(
  before: CharacterSheet,
  after: CharacterSheet
): HistoryDraft[] {
  const out: HistoryDraft[] = [];
  const push = (
    kind: string,
    field: string,
    from: unknown,
    to: unknown,
    detail: string
  ): void => {
    const fromValue = asValue(from);
    const toValue = asValue(to);
    if (fromValue === toValue) return;
    out.push({ kind, field, fromValue, toValue, detail });
  };

  const b = before.identity;
  const a = after.identity;
  const dash = (s: string): string => s || '—';
  push(
    'identity',
    'identity.name',
    b.name,
    a.name,
    `Name: ${dash(b.name)} → ${dash(a.name)}`
  );
  push(
    'identity',
    'identity.species',
    b.species,
    a.species,
    `Species: ${dash(b.species)} → ${dash(a.species)}`
  );
  push(
    'identity',
    'identity.class',
    b.class,
    a.class,
    `Class: ${dash(b.class)} → ${dash(a.class)}`
  );
  push(
    'identity',
    'identity.subclass',
    b.subclass,
    a.subclass,
    `Subclass: ${dash(b.subclass)} → ${dash(a.subclass)}`
  );
  push(
    'identity',
    'identity.background',
    b.background,
    a.background,
    `Background: ${dash(b.background)} → ${dash(a.background)}`
  );
  push(
    'identity',
    'identity.alignment',
    b.alignment,
    a.alignment,
    `Alignment: ${dash(b.alignment)} → ${dash(a.alignment)}`
  );

  if (b.level !== a.level) {
    push(
      'level',
      'identity.level',
      b.level,
      a.level,
      a.level > b.level
        ? `Levelled up: ${b.level} → ${a.level}`
        : `Level: ${b.level} → ${a.level}`
    );
  }

  for (const key of ABILITY_KEYS) {
    const bs = before.abilities[key]?.score;
    const as = after.abilities[key]?.score;
    if (bs !== as) {
      push(
        'ability',
        `abilities.${key}.score`,
        bs,
        as,
        `${ABILITY_LABELS[key]}: ${bs} → ${as}`
      );
    }
  }

  const bm = before.generation?.abilityMethod;
  const am = after.generation?.abilityMethod;
  if (bm !== am) {
    push(
      'method',
      'generation.abilityMethod',
      bm,
      am,
      `Ability score method: ${bm} → ${am}`
    );
  }

  const beforeEntries = new Map(before.homebrew.entries.map(e => [e.id, e]));
  const afterEntries = new Map(after.homebrew.entries.map(e => [e.id, e]));
  for (const [eid, e] of afterEntries) {
    if (!beforeEntries.has(eid)) {
      push(
        'homebrew',
        `homebrew.${eid}`,
        null,
        e.name,
        `Added homebrew ${e.kind}: "${e.name}"`
      );
    }
  }
  for (const [eid, e] of beforeEntries) {
    if (!afterEntries.has(eid)) {
      push(
        'homebrew',
        `homebrew.${eid}`,
        e.name,
        null,
        `Removed homebrew ${e.kind}: "${e.name}"`
      );
    }
  }

  return out;
}

/**
 * Append server-observed changes to `character_history`. Best-effort: a failure
 * here (e.g. an old stored sheet that won't parse) must never block a save.
 */
async function recordCharacterHistory(
  characterId: string,
  actorUserId: string,
  storedSheet: unknown,
  nextSheet: CharacterSheet
): Promise<void> {
  try {
    const parsed = characterSheetSchema.safeParse(storedSheet);
    if (!parsed.success) return;
    const drafts = diffSheets(parsed.data, nextSheet);
    if (drafts.length === 0) return;
    const now = new Date().toISOString();
    await db.insert(characterHistory).values(
      drafts.map(d => ({
        characterId,
        actorUserId,
        kind: d.kind,
        field: d.field,
        fromValue: d.fromValue,
        toValue: d.toValue,
        detail: d.detail,
        occurredAt: now,
      }))
    );
  } catch {
    // history is a nice-to-have; swallow and move on
  }
}

export async function updateCharacter(
  id: string,
  input: unknown
): Promise<void> {
  const userId = await requireUserId();
  const sheet = characterSheetSchema.parse(input);

  const owned = await db.query.characters.findFirst({
    where: and(eq(characters.id, id), eq(characters.ownerId, userId)),
  });
  if (!owned) throw new Error('NOT_FOUND');

  await assertSheetLegalForLinkedCampaigns(id, sheet);

  const result = await db
    .update(characters)
    .set({
      ...denormalize(sheet),
      sheet,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(characters.id, id), eq(characters.ownerId, userId)))
    .returning({ id: characters.id });
  if (result.length === 0) throw new Error('NOT_FOUND');
  await syncCharacterHomebrew(id, userId, sheet);
  await syncCharacterAuditLog(id, sheet);
  await recordCharacterHistory(id, userId, owned.sheet, sheet);
}

/**
 * DM / co-DM: how a linked character came to be. Two parts —
 *  - `provenance`: the creation-time trail (method, dice, custom values) the
 *    client recorded. A snapshot, not a history.
 *  - `history`: the server's own append-only record of what changed since,
 *    ordered oldest first. A player cannot retroactively edit this.
 */
export async function getCharacterAuditForCampaign(
  campaignId: string,
  characterId: string
): Promise<CharacterAudit> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const link = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId)
    ),
  });
  if (!link) return { provenance: [], history: [] };

  const auditRows = await db
    .select()
    .from(characterAuditLog)
    .where(eq(characterAuditLog.characterId, characterId))
    .orderBy(desc(characterAuditLog.occurredAt));

  const historyRows = await db
    .select({
      id: characterHistory.id,
      actorUserId: characterHistory.actorUserId,
      actorName: users.name,
      kind: characterHistory.kind,
      field: characterHistory.field,
      fromValue: characterHistory.fromValue,
      toValue: characterHistory.toValue,
      detail: characterHistory.detail,
      rolls: characterHistory.rolls,
      occurredAt: characterHistory.occurredAt,
      createdAt: characterHistory.createdAt,
    })
    .from(characterHistory)
    .leftJoin(users, eq(users.id, characterHistory.actorUserId))
    .where(eq(characterHistory.characterId, characterId))
    .orderBy(characterHistory.occurredAt, characterHistory.createdAt);

  return {
    provenance: auditRows.map(r => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      detail: r.detail,
      rolls: r.rolls ? (JSON.parse(r.rolls) as number[]) : null,
      occurredAt: r.occurredAt,
    })),
    history: historyRows.map(r => ({
      id: r.id,
      actorUserId: r.actorUserId,
      actorName: r.actorName,
      kind: r.kind,
      field: r.field,
      fromValue: r.fromValue,
      toValue: r.toValue,
      detail: r.detail,
      rolls: r.rolls ? (JSON.parse(r.rolls) as number[]) : null,
      occurredAt: r.occurredAt,
    })),
  };
}

export async function deleteCharacter(id: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(characters)
    .where(and(eq(characters.id, id), eq(characters.ownerId, userId)));
}
