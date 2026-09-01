import 'server-only';

import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';

import { auth } from '@/auth';
import { db } from '@/db';
import {
  campaignMembers,
  characterAuditLog,
  characterHomebrew,
  characters,
  homebrew,
} from '@/db/schema';
import { requireCampaignRole } from '@/server/campaigns';
import {
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

export interface CharacterWithSheet extends CharacterRow {
  sheet: CharacterSheet;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error('NOT_AUTHENTICATED');
  return id;
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

export async function updateCharacter(
  id: string,
  input: unknown
): Promise<void> {
  const userId = await requireUserId();
  const sheet = characterSheetSchema.parse(input);
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
}

/** DM / co-DM: the change log a character brought into the campaign. */
export async function getCharacterAuditForCampaign(
  campaignId: string,
  characterId: string
): Promise<CharacterAuditEntry[]> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm']);
  const link = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, campaignId),
      eq(campaignMembers.characterId, characterId)
    ),
  });
  if (!link) return [];

  const rows = await db
    .select()
    .from(characterAuditLog)
    .where(eq(characterAuditLog.characterId, characterId))
    .orderBy(desc(characterAuditLog.occurredAt));

  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    detail: r.detail,
    rolls: r.rolls ? (JSON.parse(r.rolls) as number[]) : null,
    occurredAt: r.occurredAt,
  }));
}

export async function deleteCharacter(id: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(characters)
    .where(and(eq(characters.id, id), eq(characters.ownerId, userId)));
}
