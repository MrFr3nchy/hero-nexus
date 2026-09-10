import 'server-only';

import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';

import { requireUserId } from './session-user';
import { db } from '@/db';
import {
  campaignHomebrew,
  campaignMembers,
  campaigns,
  characterAuditLog,
  characterHistory,
  characterHomebrew,
  characterPortraits,
  characters,
  homebrew,
  homebrewApprovals,
  users,
} from '@/db/schema';
import {
  mergeCampaignSettings,
  requireCampaignRole,
  setMemberCharacter,
  submitCharacterHomebrewForApproval,
} from '@/server/campaigns';
import {
  checkSheetAgainstRules,
  type RuleViolation,
} from '@/@creator/campaign/lib/rules';
import { listContentIdsForCampaigns } from './campaign-content';
import { migrateStoredSheet } from '@/@creator/character/lib/migrate-sheet';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  characterSheetSchema,
  type CharacterSheet,
  type HomebrewEntry,
} from '@/@creator/character/schema';

/**
 * `draft` — the guided build still owes decisions. Everything else in the app
 * treats a draft as a normal character; the two exceptions are `campaigns.ts`
 * and `library-packages.ts`, which refuse to hand an unfinished sheet to
 * anybody else.
 */
export type CharacterStatus = 'draft' | 'ready';

export interface CharacterRow {
  id: string;
  name: string;
  class: string;
  species: string;
  level: number;
  background: string;
  rpgSystem: string;
  hasHomebrew: boolean;
  status: CharacterStatus;
  createdAt: string;
  updatedAt: string;
  /**
   * The table this hero sits at, or null. Denormalised onto the row because
   * the roster is the one surface that has to say it, and a card that cannot
   * name its campaign is the reason a player opens five sheets looking for
   * the one their DM meant.
   */
  table: { campaignId: string; name: string } | null;
  /** The hero's face, or null. Same reasoning as `table`: the roster shows it. */
  portrait: { url: string; alt: string } | null;
  /**
   * The blueprint this instance was forked from, or null.
   *
   * Null on a blueprint, and also null on a hero who was already seated before
   * instancing existed — `campaignId` is what distinguishes those two, not
   * this.
   */
  forkedFrom: string | null;
  /** The table this row plays at, or null for a blueprint. */
  campaignId: string | null;
  /**
   * Whether this instance currently holds the seat at its table.
   *
   * An instance keeps its `campaignId` after being swapped out, because it
   * really is the hero who played those levels there and detaching it would
   * throw that away. But `table` alone would then read "playing at Locandras"
   * for somebody who was benched a month ago, so the two facts are separate:
   * `table` is where they played, this is whether they still hold the chair.
   * Always false for a blueprint.
   */
  seated: boolean;
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
  status: characters.status,
  createdAt: characters.createdAt,
  updatedAt: characters.updatedAt,
  campaignId: characters.campaignId,
  forkedFrom: characters.forkedFrom,
};

/**
 * The table a character plays at, or null for a blueprint.
 *
 * A column read now that a hero at a table is an instance of their own. This
 * used to join through `campaign_members` and take the first row it found,
 * which quietly picked one of several when a character was seated at two
 * tables — a state nothing prevented. An instance has exactly one campaign
 * because it *is* one campaign's copy.
 */
export async function characterTable(
  characterId: string
): Promise<{ campaignId: string; name: string } | null> {
  const row = await db
    .select({ campaignId: campaigns.id, name: campaigns.name })
    .from(characters)
    .innerJoin(campaigns, eq(campaigns.id, characters.campaignId))
    .where(eq(characters.id, characterId))
    .limit(1);
  return row[0] ?? null;
}

/**
 * One character's portrait, shaped for a row. No permission check.
 *
 * An instance with no face of its own falls back to its blueprint's, so a
 * fork does not have to copy the bytes — and deleting one portrait cannot
 * unlink a file the other is still pointing at.
 */
async function portraitFor(
  characterId: string,
  forkedFrom: string | null = null
): Promise<{ url: string; alt: string } | null> {
  const own = await db.query.characterPortraits.findFirst({
    where: eq(characterPortraits.characterId, characterId),
  });
  const row =
    own ??
    (forkedFrom
      ? await db.query.characterPortraits.findFirst({
          where: eq(characterPortraits.characterId, forkedFrom),
        })
      : undefined);
  if (!row) return null;
  return {
    // Always the asking character's own route, even when the bytes belong to
    // its blueprint. The route resolves the fallback, so access is judged on
    // the instance — which has a seat — rather than on a blueprint that plays
    // nowhere and would 404 for the DM.
    url: row.remoteUrl || `/api/characters/${characterId}/portrait`,
    alt: row.alt,
  };
}

/** Whether this row currently holds a chair at its table. */
async function isSeated(characterId: string): Promise<boolean> {
  const row = await db.query.campaignMembers.findFirst({
    where: eq(campaignMembers.characterId, characterId),
    columns: { id: true },
  });
  return Boolean(row);
}

export async function listCharacters(): Promise<CharacterRow[]> {
  const userId = await requireUserId();
  const rows = await db
    .select(listColumns)
    .from(characters)
    .where(eq(characters.ownerId, userId))
    .orderBy(desc(characters.updatedAt));

  // Campaign names for the instances in this roster, in one query. The
  // instance carries its own `campaignId`, so this only needs the name.
  const campaignIds = [
    ...new Set(rows.map(r => r.campaignId).filter((c): c is string => !!c)),
  ];
  const tables = campaignIds.length
    ? await db
        .select({ id: campaigns.id, name: campaigns.name })
        .from(campaigns)
        .where(inArray(campaigns.id, campaignIds))
    : [];
  const tableName = new Map(tables.map(t => [t.id, t.name]));

  // Which instances actually hold their chair. One query for the roster.
  const seatedIds = new Set(
    (
      await db
        .select({ characterId: campaignMembers.characterId })
        .from(campaignMembers)
        .where(eq(campaignMembers.userId, userId))
    )
      .map(r => r.characterId)
      .filter((id): id is string => !!id)
  );

  // Every portrait for this owner's heroes in one query. Ownership is the
  // access check here — these are all the caller's own characters — so this
  // does not go through `getPortrait`, which re-derives that per row.
  const faces = await db
    .select({
      characterId: characterPortraits.characterId,
      filePath: characterPortraits.filePath,
      remoteUrl: characterPortraits.remoteUrl,
      alt: characterPortraits.alt,
    })
    .from(characterPortraits)
    .innerJoin(characters, eq(characters.id, characterPortraits.characterId))
    .where(eq(characters.ownerId, userId));

  const byPortrait = new Map(
    faces.map(f => [
      f.characterId,
      {
        url: f.remoteUrl || `/api/characters/${f.characterId}/portrait`,
        alt: f.alt,
      },
    ])
  );

  return rows.map(row => ({
    ...row,
    seated: seatedIds.has(row.id),
    table:
      row.campaignId && tableName.has(row.campaignId)
        ? { campaignId: row.campaignId, name: tableName.get(row.campaignId)! }
        : null,
    // An instance with no face of its own wears the blueprint's. The bytes
    // exist once, and a fork does not duplicate the file — see
    // `forkCharacterForCampaign`.
    portrait:
      byPortrait.get(row.id) ??
      (row.forkedFrom ? (byPortrait.get(row.forkedFrom) ?? null) : null),
  }));
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
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    table: await characterTable(row.id),
    campaignId: row.campaignId,
    seated: await isSeated(row.id),
    portrait: await portraitFor(row.id, row.forkedFrom),
    forkedFrom: row.forkedFrom,
    sheet: characterSheetSchema.parse(migrateStoredSheet(row.sheet)),
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
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    table: await characterTable(row.id),
    campaignId: row.campaignId,
    seated: await isSeated(row.id),
    portrait: await portraitFor(row.id, row.forkedFrom),
    forkedFrom: row.forkedFrom,
    sheet: characterSheetSchema.parse(migrateStoredSheet(row.sheet)),
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

  /*
   * Unlink removed entries — and delete the homebrew row they spawned only if
   * nothing else still points at it.
   *
   * This used to delete the row unconditionally, which cascaded away the DM's
   * approval decision and (now) pulled the content out of every campaign
   * library it had been approved into. Two consequences a player could trigger
   * by editing their own sheet: a decision the DM had made vanished, and
   * removing then re-adding an entry minted a fresh id whose approval state
   * was back to "never submitted".
   */
  const stale = links.filter(l => !keepEntryIds.has(l.entryId));
  if (stale.length) {
    const staleHomebrewIds = stale.map(l => l.homebrewId);

    await db.delete(characterHomebrew).where(
      inArray(
        characterHomebrew.id,
        stale.map(l => l.id)
      )
    );

    const [reviewed, inPlay, stillLinked] = await Promise.all([
      db
        .select({ id: homebrewApprovals.homebrewId })
        .from(homebrewApprovals)
        .where(inArray(homebrewApprovals.homebrewId, staleHomebrewIds)),
      db
        .select({ id: campaignHomebrew.homebrewId })
        .from(campaignHomebrew)
        .where(inArray(campaignHomebrew.homebrewId, staleHomebrewIds)),
      // Another character of this player's may have spawned a link to the
      // same row.
      db
        .select({ id: characterHomebrew.homebrewId })
        .from(characterHomebrew)
        .where(inArray(characterHomebrew.homebrewId, staleHomebrewIds)),
    ]);

    const spokenFor = new Set([
      ...reviewed.map(r => r.id),
      ...inPlay.map(r => r.id),
      ...stillLinked.map(r => r.id),
    ]);
    const orphans = staleHomebrewIds.filter(id => !spokenFor.has(id));
    if (orphans.length) {
      await db.delete(homebrew).where(inArray(homebrew.id, orphans));
    }
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

/**
 * `status` is the caller's word, not the sheet's.
 *
 * Completeness is a property of the *build* — `findBuildIssues` — and the
 * sheet schema deliberately parses a half-finished one, because every leaf
 * carries a default. So the server cannot recompute "is this finished?" from
 * the row, and does not try: the builder says which button was pressed, and
 * the places that matter (a table, the shelf) check the flag rather than
 * re-deriving it.
 */
export async function createCharacter(
  input: unknown,
  status: CharacterStatus = 'ready'
): Promise<string> {
  const userId = await requireUserId();
  const sheet = characterSheetSchema.parse(input);
  const [row] = await db
    .insert(characters)
    .values({ ownerId: userId, ...denormalize(sheet), sheet, status })
    .returning({ id: characters.id });
  await syncCharacterHomebrew(row.id, userId, sheet);
  await syncCharacterAuditLog(row.id, sheet);
  return row.id;
}

/**
 * Copy a hero onto a table.
 *
 * Taking a character to a campaign mints a new `characters` row and *that* is
 * what plays: it levels, collects loot, takes conditions and can die, while
 * the blueprint it came from stays on the shelf untouched. See the third model
 * decision in `docs/handoff/the-long-campaign/README.md` for why this is a
 * fork rather than a link.
 *
 * Two things are deliberately **not** copied:
 *
 * - **`character_history`.** The instance starts its own log. The DM's record
 *   is of what happened at *this* table, and carrying a previous table's
 *   history into it would put another campaign's decisions in front of a DM as
 *   though they were made at theirs. The temptation to carry it over is
 *   strong; it is wrong.
 * - **The portrait row.** The instance reads the blueprint's face through
 *   `forkedFrom` instead, so the bytes exist once. Copying the row would leave
 *   two rows pointing at one file and a delete that unlinks it out from under
 *   the other.
 *
 * `provenance` and the inventory *are* copied: they are part of the sheet, and
 * a hero who arrives at a table with no record of how they were built is
 * exactly what the provenance log exists to prevent.
 */
export async function forkCharacterForCampaign(
  characterId: string,
  campaignId: string
): Promise<string> {
  const userId = await requireUserId();

  const source = await db.query.characters.findFirst({
    where: and(eq(characters.id, characterId), eq(characters.ownerId, userId)),
  });
  if (!source) throw new Error('NOT_YOUR_CHARACTER');
  if (source.status === 'draft') throw new Error('CHARACTER_IS_DRAFT');

  // Seating an instance seats the instance, not a copy of a copy. Re-forking
  // one would strand its history and its loot on a row nothing points at.
  if (source.campaignId === campaignId) return source.id;
  if (source.campaignId) throw new Error('ALREADY_AT_A_TABLE');

  const sheet = characterSheetSchema.parse(
    migrateStoredSheet(structuredClone(source.sheet))
  );

  const [row] = await db
    .insert(characters)
    .values({
      ownerId: userId,
      ...denormalize(sheet),
      sheet,
      status: source.status,
      campaignId,
      forkedFrom: source.id,
    })
    .returning({ id: characters.id });

  await syncCharacterHomebrew(row.id, userId, sheet);
  await syncCharacterAuditLog(row.id, sheet);
  return row.id;
}

/**
 * Take a hero to a table: fork them, then seat the fork.
 *
 * This is the operation every UI path should call. `setMemberCharacter` in
 * `campaigns.ts` is the half that points the membership row, and it refuses
 * anything that is not already an instance of that campaign — so the fork
 * cannot be skipped by a caller that forgets.
 *
 * Passing an id that is already this table's instance re-seats it unchanged,
 * which is what makes re-picking the same hero idempotent rather than a way to
 * stack copies.
 */
export async function seatCharacterAtCampaign(
  campaignId: string,
  characterId: string | null
): Promise<RuleViolation[]> {
  if (!characterId) return setMemberCharacter(campaignId, null);
  const instanceId = await forkCharacterForCampaign(characterId, campaignId);
  return setMemberCharacter(campaignId, instanceId);
}

/**
 * Marks an error whose message is written for the player, not for a log.
 *
 * Errors out of this module are codes (`NOT_FOUND`, `FORBIDDEN`) that the
 * action layer maps to sentences, so a message that is already a sentence fell
 * through to the generic "Failed to save character." — which is how a save
 * refused for breaking a table's rules told the player nothing about which
 * rule, or even that a table was involved.
 */
export const RULES_ERROR = 'RULES:';

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
      id: campaigns.id,
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

  // What each table has in play, in one query rather than one per campaign.
  const inPlay = await listContentIdsForCampaigns(camps.map(c => c.id));

  const problems: string[] = [];
  for (const c of camps) {
    const settings = mergeCampaignSettings(c.settings);
    const violations = checkSheetAgainstRules(sheet, settings.rules, {
      allowHomebrew: settings.allowHomebrew,
      // A table that does not review homebrew has no decision to enforce, so
      // it is handed nothing and the check is skipped.
      contentInPlay: settings.requireHomebrewApproval
        ? (inPlay.get(c.id) ?? new Set<string>())
        : undefined,
    });
    if (violations.length) {
      problems.push(`${c.name}: ${violations.map(v => v.message).join(' ')}`);
    }
  }

  if (problems.length) {
    throw new Error(
      `${RULES_ERROR}This character can't be saved while linked to a table it breaks the rules of — ${problems.join(' | ')}`
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

  if (b.xp !== a.xp) {
    push(
      'level',
      'identity.xp',
      b.xp,
      a.xp,
      a.xp > b.xp
        ? `Experience: ${b.xp} → ${a.xp} (+${a.xp - b.xp})`
        : `Experience: ${b.xp} → ${a.xp}`
    );
  }

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
  const traitSummary = (entry: { traits: { name: string }[] }): string =>
    entry.traits
      .map(t => t.name)
      .filter(Boolean)
      .join(', ');

  for (const [eid, e] of afterEntries) {
    const was = beforeEntries.get(eid);
    if (!was) {
      push(
        'homebrew',
        `homebrew.${eid}`,
        null,
        e.name,
        `Added homebrew ${e.kind}: "${e.name}"`
      );
      continue;
    }
    // Renames and trait edits used to pass unnoticed: only adds and removes
    // were diffed, so a player could rename an approved entry or rewrite what
    // it does and the DM's log would say nothing.
    if (was.name !== e.name) {
      push(
        'homebrew',
        `homebrew.${eid}.name`,
        was.name,
        e.name,
        `Renamed homebrew ${e.kind}: "${was.name}" → "${e.name}"`
      );
    }
    const wasTraits = traitSummary(was);
    const nowTraits = traitSummary(e);
    if (JSON.stringify(was.traits) !== JSON.stringify(e.traits)) {
      push(
        'homebrew',
        `homebrew.${eid}.traits`,
        wasTraits || 'none',
        nowTraits || 'none',
        `Edited what "${e.name}" does${
          wasTraits !== nowTraits
            ? ` (${wasTraits || 'none'} → ${nowTraits || 'none'})`
            : ''
        }`
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

  /* ---- spells ---- */
  const spellKey = (r: { source: string; key: string }) =>
    `${r.source}:${r.key}`;
  const beforeSpells = new Map(
    before.spellcasting.spells.map(s => [spellKey(s.ref), s])
  );
  const afterSpells = new Map(
    after.spellcasting.spells.map(s => [spellKey(s.ref), s])
  );

  for (const [key, spell] of afterSpells) {
    const was = beforeSpells.get(key);
    if (!was) {
      push(
        'spell',
        `spell.${key}`,
        null,
        spell.ref.name,
        `Learned ${spell.ref.source === 'homebrew' ? 'homebrew ' : ''}spell: "${spell.ref.name}"`
      );
      continue;
    }
    if (was.prepared !== spell.prepared) {
      push(
        'spell',
        `spell.${key}.prepared`,
        was.prepared ? 'prepared' : 'unprepared',
        spell.prepared ? 'prepared' : 'unprepared',
        `${spell.prepared ? 'Prepared' : 'Unprepared'} "${spell.ref.name}"`
      );
    }
  }
  for (const [key, spell] of beforeSpells) {
    if (!afterSpells.has(key)) {
      push(
        'spell',
        `spell.${key}`,
        spell.ref.name,
        null,
        `Forgot spell: "${spell.ref.name}"`
      );
    }
  }

  /* ---- inventory ---- */
  const beforeItems = new Map(before.inventory.map(i => [i.id, i]));
  const afterItems = new Map(after.inventory.map(i => [i.id, i]));

  for (const [id, item] of afterItems) {
    const was = beforeItems.get(id);
    if (!was) {
      const qty = item.quantity === 1 ? '' : ` x${item.quantity}`;
      push(
        'inventory',
        `inventory.${id}`,
        null,
        item.name,
        `Picked up: "${item.name}"${qty}${
          item.ref?.source === 'homebrew' ? ' (homebrew)' : ''
        }`
      );
      continue;
    }
    if (was.quantity !== item.quantity) {
      push(
        'inventory',
        `inventory.${id}.quantity`,
        was.quantity,
        item.quantity,
        `"${item.name}": ${was.quantity} → ${item.quantity}`
      );
    }
    if (was.equipped !== item.equipped) {
      push(
        'inventory',
        `inventory.${id}.equipped`,
        was.equipped ? 'equipped' : 'stowed',
        item.equipped ? 'equipped' : 'stowed',
        `${item.equipped ? 'Equipped' : 'Stowed'} "${item.name}"`
      );
    }
    // Attunement is the one a DM most often wants to have noticed.
    if (was.attuned !== item.attuned) {
      push(
        'inventory',
        `inventory.${id}.attuned`,
        was.attuned ? 'attuned' : 'not attuned',
        item.attuned ? 'attuned' : 'not attuned',
        `${item.attuned ? 'Attuned to' : 'Broke attunement with'} "${item.name}"`
      );
    }
  }
  for (const [id, item] of beforeItems) {
    if (!afterItems.has(id)) {
      push(
        'inventory',
        `inventory.${id}`,
        item.name,
        null,
        `Dropped: "${item.name}"`
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
    // The baseline is a stored sheet, so it migrates too — otherwise every
    // pre-inventory character would diff as "added 12 items" on its next save.
    const parsed = characterSheetSchema.safeParse(
      migrateStoredSheet(storedSheet)
    );
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

/**
 * Write a sheet on behalf of somebody who does not own it, with history.
 *
 * **This function does not authorize.** The caller has already decided the
 * writer is allowed — the DM handing out experience is the case it exists for
 * — and passes its own `actorUserId` so the history row names the right
 * person. Anything reachable from a player's browser must go through
 * `updateCharacter`, which checks ownership.
 *
 * Table rules are still enforced: a DM cannot push a character into a state
 * their own table would reject.
 */
export async function writeSheetAsStaff(
  characterId: string,
  actorUserId: string,
  sheet: CharacterSheet
): Promise<void> {
  const existing = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!existing) throw new Error('NOT_FOUND');

  await assertSheetLegalForLinkedCampaigns(characterId, sheet);

  await db
    .update(characters)
    .set({
      ...denormalize(sheet),
      sheet,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(characters.id, characterId));

  await recordCharacterHistory(characterId, actorUserId, existing.sheet, sheet);
}

/**
 * `status` omitted leaves the row's own status alone — a DM-side or sheet-view
 * save of a finished hero must not quietly demote them to a draft, and a draft
 * saved again from the raw sheet view stays a draft.
 */
export async function updateCharacter(
  id: string,
  input: unknown,
  status?: CharacterStatus
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
      ...(status ? { status } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(characters.id, id), eq(characters.ownerId, userId)))
    .returning({ id: characters.id });
  if (result.length === 0) throw new Error('NOT_FOUND');
  await syncCharacterHomebrew(id, userId, sheet);
  await syncCharacterAuditLog(id, sheet);
  await recordCharacterHistory(id, userId, owned.sheet, sheet);
  await queueHomebrewForLinkedCampaigns(id, userId);
}

/**
 * Put any not-yet-reviewed homebrew on this character into the queues of the
 * tables it is linked to.
 *
 * Queueing used to happen only when a character was *linked* to a campaign, so
 * homebrew added afterwards never reached the DM at all: a player could join a
 * table with a clean sheet and then invent anything they liked. Running it on
 * every save closes that. `submitCharacterHomebrewForApproval` is idempotent —
 * it skips homebrew the campaign has already seen — so re-running it is free.
 *
 * Best-effort, like history: a failure here must not cost a player their save.
 */
async function queueHomebrewForLinkedCampaigns(
  characterId: string,
  userId: string
): Promise<void> {
  try {
    const links = await db
      .select({ campaignId: campaignMembers.campaignId })
      .from(campaignMembers)
      .where(eq(campaignMembers.characterId, characterId));
    for (const link of links) {
      await submitCharacterHomebrewForApproval(
        link.campaignId,
        characterId,
        userId
      );
    }
  } catch {
    // The character is saved either way; the queue catches up on the next save.
  }
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
