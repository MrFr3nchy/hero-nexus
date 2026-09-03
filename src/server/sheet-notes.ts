import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignMembers,
  characterSecrets,
  characters,
  sheetNotes,
  users,
} from '@/db/schema';
import { requireCampaignRole } from '@/server/campaigns';
import type {
  NoteSection,
  NoteVisibility,
  SecretRow,
  SecretVisibility,
  SheetNoteRow,
} from '@/@creator/character/lib/note-sections';
import { requireUserId } from './session-user';

/**
 * DM annotations on a player's sheet, and the per-character secret log.
 *
 * Both live between one campaign and one character, so every read starts by
 * working out what the caller is to that pair — staff, the player who owns the
 * character, another player at the table, or nobody — and filters from there.
 * Nothing hidden is ever sent to a client and filtered in the browser.
 */

export {
  NOTE_SECTIONS,
  SECTION_LABEL,
  type NoteSection,
  type NoteVisibility,
  type SecretRow,
  type SecretVisibility,
  type SheetNoteRow,
} from '@/@creator/character/lib/note-sections';

type Viewer =
  | { kind: 'staff'; userId: string; campaignId: string }
  | { kind: 'owner'; userId: string; campaignId: string }
  | { kind: 'member'; userId: string; campaignId: string };

/**
 * What the caller is to this character, inside the campaign it plays at.
 *
 * The campaign is derived from the membership row rather than passed in, so a
 * player reading their own sheet does not have to know which table it belongs
 * to. Throws rather than returning null: every caller here needs access.
 */
async function viewerFor(characterId: string): Promise<Viewer> {
  const userId = await requireUserId();

  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
  if (!character) throw new Error('NOT_FOUND');

  const link = await db.query.campaignMembers.findFirst({
    where: eq(campaignMembers.characterId, characterId),
  });
  if (!link) throw new Error('NOT_IN_CAMPAIGN');

  const { role } = await requireCampaignRole(link.campaignId, [
    'gm',
    'co-gm',
    'player',
  ]);

  if (role === 'gm' || role === 'co-gm') {
    return { kind: 'staff', userId, campaignId: link.campaignId };
  }
  if (character.ownerId === userId) {
    return { kind: 'owner', userId, campaignId: link.campaignId };
  }
  return { kind: 'member', userId, campaignId: link.campaignId };
}

/**
 * The table a character plays at, from the caller's side — or null when it
 * plays at none, or the caller has no business there. Lets a page decide
 * whether to render the notes and secret surfaces at all.
 */
export async function tableContext(characterId: string): Promise<{
  campaignId: string;
  isStaff: boolean;
  isOwner: boolean;
} | null> {
  try {
    const viewer = await viewerFor(characterId);
    return {
      campaignId: viewer.campaignId,
      isStaff: viewer.kind === 'staff',
      isOwner: viewer.kind === 'owner',
    };
  } catch {
    return null;
  }
}

async function requireStaff(characterId: string): Promise<Viewer> {
  const viewer = await viewerFor(characterId);
  if (viewer.kind !== 'staff') throw new Error('FORBIDDEN');
  return viewer;
}

async function namesFor(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map(r => [r.id, r.name ?? r.email ?? 'Someone']));
}

/* --- sheet notes --------------------------------------------------------- */

/**
 * Notes on one character's sheet. Staff see every note; the player who owns
 * the sheet sees only the ones written for them; anyone else sees none.
 */
export async function listSheetNotes(
  characterId: string
): Promise<SheetNoteRow[]> {
  const viewer = await viewerFor(characterId);
  if (viewer.kind === 'member') return [];

  const rows = await db
    .select()
    .from(sheetNotes)
    .where(eq(sheetNotes.characterId, characterId))
    .orderBy(asc(sheetNotes.createdAt));

  const visible =
    viewer.kind === 'staff'
      ? rows
      : rows.filter(r => r.visibility === 'shared');
  const names = await namesFor(visible.map(r => r.authorUserId));

  return visible.map(r => ({
    id: r.id,
    section: r.section as NoteSection,
    body: r.body,
    visibility: r.visibility,
    authorName: r.authorUserId ? (names.get(r.authorUserId) ?? null) : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function addSheetNote(
  characterId: string,
  section: NoteSection,
  body: string,
  visibility: NoteVisibility
): Promise<void> {
  const viewer = await requireStaff(characterId);
  const text = body.trim();
  if (!text) throw new Error('EMPTY');

  await db.insert(sheetNotes).values({
    campaignId: viewer.campaignId,
    characterId,
    section,
    body: text,
    authorUserId: viewer.userId,
    visibility,
  });
}

/** Show a private note to the player, or take a shared one back. */
export async function setSheetNoteVisibility(
  noteId: string,
  visibility: NoteVisibility
): Promise<void> {
  const note = await db.query.sheetNotes.findFirst({
    where: eq(sheetNotes.id, noteId),
  });
  if (!note) throw new Error('NOT_FOUND');
  await requireStaff(note.characterId);

  await db
    .update(sheetNotes)
    .set({ visibility, updatedAt: new Date().toISOString() })
    .where(eq(sheetNotes.id, noteId));
}

export async function deleteSheetNote(noteId: string): Promise<void> {
  const note = await db.query.sheetNotes.findFirst({
    where: eq(sheetNotes.id, noteId),
  });
  if (!note) throw new Error('NOT_FOUND');
  await requireStaff(note.characterId);
  await db.delete(sheetNotes).where(eq(sheetNotes.id, noteId));
}

/* --- secrets ------------------------------------------------------------- */

/**
 * The secret log for one character. Staff see everything; the owning player
 * sees what has been released to them or to the party; another player at the
 * table sees only what was revealed to the whole party.
 */
export async function listSecrets(characterId: string): Promise<SecretRow[]> {
  const viewer = await viewerFor(characterId);

  const rows = await db
    .select()
    .from(characterSecrets)
    .where(eq(characterSecrets.characterId, characterId))
    .orderBy(asc(characterSecrets.createdAt));

  const visible = rows.filter(r => {
    if (viewer.kind === 'staff') return true;
    if (viewer.kind === 'owner') return r.visibility !== 'dm';
    return r.visibility === 'party';
  });
  const names = await namesFor(visible.map(r => r.authorUserId));

  return visible.map(r => ({
    id: r.id,
    body: r.body,
    visibility: r.visibility,
    authorRole: r.authorRole,
    authorName: r.authorUserId ? (names.get(r.authorUserId) ?? null) : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // A DM entry is hidden, never erased; a player may take back their own.
    canDelete: r.authorRole === 'player' && r.authorUserId === viewer.userId,
  }));
}

/**
 * Write a secret. Staff choose who it is for; the player who owns the sheet
 * writes for themselves and their DM, and cannot publish to the party — that
 * is the DM's call, later.
 */
export async function addSecret(
  characterId: string,
  body: string,
  visibility: SecretVisibility
): Promise<void> {
  const viewer = await viewerFor(characterId);
  if (viewer.kind === 'member') throw new Error('FORBIDDEN');

  const text = body.trim();
  if (!text) throw new Error('EMPTY');

  await db.insert(characterSecrets).values({
    campaignId: viewer.campaignId,
    characterId,
    authorUserId: viewer.userId,
    authorRole: viewer.kind === 'staff' ? 'gm' : 'player',
    body: text,
    visibility: viewer.kind === 'staff' ? visibility : 'player',
  });
}

/** Widen or withdraw a secret: dm → player → party, and back. */
export async function setSecretVisibility(
  secretId: string,
  visibility: SecretVisibility
): Promise<void> {
  const secret = await db.query.characterSecrets.findFirst({
    where: eq(characterSecrets.id, secretId),
  });
  if (!secret) throw new Error('NOT_FOUND');
  await requireStaff(secret.characterId);

  await db
    .update(characterSecrets)
    .set({ visibility, updatedAt: new Date().toISOString() })
    .where(eq(characterSecrets.id, secretId));
}

/**
 * Remove a secret. Only the player who wrote it can, and only their own: a
 * DM-written entry is part of the record and is hidden rather than deleted.
 */
export async function deleteSecret(secretId: string): Promise<void> {
  const userId = await requireUserId();
  const secret = await db.query.characterSecrets.findFirst({
    where: eq(characterSecrets.id, secretId),
  });
  if (!secret) throw new Error('NOT_FOUND');
  if (secret.authorRole !== 'player' || secret.authorUserId !== userId) {
    throw new Error('FORBIDDEN');
  }
  await db.delete(characterSecrets).where(eq(characterSecrets.id, secretId));
}

/** Everything at this table that has been revealed to the whole party. */
export async function listPartySecrets(campaignId: string): Promise<
  (SecretRow & {
    characterId: string;
    characterName: string;
  })[]
> {
  await requireCampaignRole(campaignId, ['gm', 'co-gm', 'player']);

  const rows = await db
    .select({
      secret: characterSecrets,
      characterName: characters.name,
    })
    .from(characterSecrets)
    .innerJoin(characters, eq(characters.id, characterSecrets.characterId))
    .where(
      and(
        eq(characterSecrets.campaignId, campaignId),
        eq(characterSecrets.visibility, 'party')
      )
    )
    .orderBy(asc(characterSecrets.updatedAt));

  const names = await namesFor(rows.map(r => r.secret.authorUserId));

  return rows.map(({ secret: r, characterName }) => ({
    id: r.id,
    body: r.body,
    visibility: r.visibility,
    authorRole: r.authorRole,
    authorName: r.authorUserId ? (names.get(r.authorUserId) ?? null) : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    canDelete: false,
    characterId: r.characterId,
    characterName,
  }));
}
