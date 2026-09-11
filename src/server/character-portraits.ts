import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  campaignMembers,
  campaigns,
  characterPortraits,
  characters,
} from '@/db/schema';
import { requireUserId } from './session-user';
import { UPLOADS_DIR } from './uploads';

/**
 * A character's portrait: one per hero, uploaded or linked.
 *
 * Access is judged from the character, not from a campaign — see the note on
 * `characterPortraits` in `src/db/schema.ts` for why this is its own table.
 * The owner may always read and write; anyone sitting at the same table may
 * read, because a party that cannot see each other's faces is the whole point
 * of having them.
 */

export const MAX_PORTRAIT_BYTES = 4 * 1024 * 1024;

/** Formats a browser renders inline, and the extension each is saved as. */
export const PORTRAIT_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export interface PortraitRow {
  id: string;
  alt: string;
  /**
   * Where the browser fetches it.
   *
   * For an upload this is our own route, which re-checks access. For a link it
   * is the author's URL, loaded by the reader's browser — never by the server,
   * because Hero Nexus makes no outbound calls at runtime.
   */
  url: string;
  /** True when `url` points off-site. Surfaces in the UI; not a detail. */
  remote: boolean;
}

export function portraitUrl(characterId: string): string {
  return `/api/characters/${characterId}/portrait`;
}

/**
 * Only `http(s)` links, and never a `data:` URI.
 *
 * A `data:` portrait would put an unbounded blob in the row this is meant to
 * keep out of the database, and every other scheme is either useless in an
 * `<img>` or a way to point the reader's browser somewhere it should not go.
 */
export function isAllowedRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The row itself, with no permission check. Callers do the judging. */
export async function portraitRecord(characterId: string) {
  return (
    (await db.query.characterPortraits.findFirst({
      where: eq(characterPortraits.characterId, characterId),
    })) ?? null
  );
}

/**
 * The portrait to actually render for a character, following one fork.
 *
 * A campaign instance has no portrait of its own — `forkCharacterForCampaign`
 * deliberately does not copy the row, so the bytes exist once and no delete
 * can unlink a file another row still points at. It wears its blueprint's face
 * instead, resolved here rather than at the URL, so the URL always names the
 * instance and access is judged on the row that has a seat.
 *
 * One hop, not a loop: an instance is never forked again.
 */
export async function resolvedPortraitRecord(characterId: string) {
  const own = await portraitRecord(characterId);
  if (own) return own;

  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
    columns: { forkedFrom: true },
  });
  if (!character?.forkedFrom) return null;
  return portraitRecord(character.forkedFrom);
}

/**
 * Whether the signed-in user may see this character's face.
 *
 * Deliberately broader than `getCharacter`, which is owner-only: a DM and the
 * rest of the party need the portrait for the initiative list and the party
 * cards, and they reach the character through membership rather than
 * ownership.
 */
export async function canViewCharacter(characterId: string): Promise<boolean> {
  const userId = await requireUserId();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
    columns: { ownerId: true },
  });
  if (!character) return false;
  if (character.ownerId === userId) return true;

  // Same table as the hero: find the seat this character holds, then ask
  // whether the viewer holds a seat at that same campaign.
  const seat = await db.query.campaignMembers.findFirst({
    where: eq(campaignMembers.characterId, characterId),
    columns: { campaignId: true },
  });
  if (!seat) return false;

  const viewerSeat = await db.query.campaignMembers.findFirst({
    where: and(
      eq(campaignMembers.campaignId, seat.campaignId),
      eq(campaignMembers.userId, userId)
    ),
    columns: { id: true },
  });
  if (viewerSeat) return true;

  // The GM has no member row — the trap every targets table in this schema
  // records — and the DM is the one person at the table who must see every
  // face on the board. Found when the DM's sand table drew the party as
  // initials while the players' drew their portraits.
  const table = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, seat.campaignId),
    columns: { gmId: true },
  });
  return table?.gmId === userId;
}

async function requireOwner(characterId: string): Promise<string> {
  const userId = await requireUserId();
  const character = await db.query.characters.findFirst({
    where: and(eq(characters.id, characterId), eq(characters.ownerId, userId)),
    columns: { id: true },
  });
  if (!character) throw new Error('FORBIDDEN');
  return userId;
}

/** The portrait to render, or null. Returns nothing to a viewer who may not look. */
export async function getPortrait(
  characterId: string
): Promise<PortraitRow | null> {
  if (!(await canViewCharacter(characterId))) return null;
  const row = await resolvedPortraitRecord(characterId);
  if (!row) return null;
  return {
    id: row.id,
    alt: row.alt,
    // Versioned by the row, so a replaced portrait is a new URL and the
    // route's five-minute cache serves the new face rather than the old.
    url: row.remoteUrl || `${portraitUrl(characterId)}?v=${row.id}`,
    remote: Boolean(row.remoteUrl),
  };
}

/** Portraits for a set of characters, for the roster and the party list. */
export async function portraitsFor(
  characterIds: string[]
): Promise<Map<string, PortraitRow>> {
  const out = new Map<string, PortraitRow>();
  // One membership check per character rather than one query: the set is a
  // party or a roster, never a page of hundreds, and the alternative is
  // reimplementing `canViewCharacter` as a join that can drift from it.
  for (const id of [...new Set(characterIds)]) {
    const portrait = await getPortrait(id);
    if (portrait) out.set(id, portrait);
  }
  return out;
}

/** Drop the current portrait and its file, if there is one. */
export async function clearPortrait(characterId: string): Promise<void> {
  await requireOwner(characterId);
  const row = await portraitRecord(characterId);
  if (!row) return;
  await db
    .delete(characterPortraits)
    .where(eq(characterPortraits.characterId, characterId));
  if (row.filePath) {
    await unlink(join(UPLOADS_DIR, row.filePath)).catch(() => {});
  }
}

/**
 * Store an uploaded portrait, replacing any existing one.
 *
 * The caller has already checked type and size; this writes the bytes and
 * records the row. Replacing goes through `clearPortrait` so the old file is
 * removed rather than orphaned — one row per character means nothing else can
 * ever reach it again.
 */
export async function savePortraitUpload(
  characterId: string,
  file: File,
  alt: string
): Promise<PortraitRow> {
  await requireOwner(characterId);

  const ext = PORTRAIT_EXTENSIONS[file.type];
  if (!ext) throw new Error('UNSUPPORTED_TYPE');
  if (file.size > MAX_PORTRAIT_BYTES) throw new Error('TOO_LARGE');

  await clearPortrait(characterId);

  const dir = join(UPLOADS_DIR, 'characters', characterId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()));

  const [row] = await db
    .insert(characterPortraits)
    .values({
      characterId,
      filePath: `characters/${characterId}/${name}`,
      mime: file.type,
      bytes: file.size,
      alt: alt.trim().slice(0, 200),
    })
    .returning({ id: characterPortraits.id });

  return {
    id: characterId,
    alt: alt.trim().slice(0, 200),
    url: `${portraitUrl(characterId)}?v=${row.id}`,
    remote: false,
  };
}

/** Point the portrait at an off-site image, replacing any existing one. */
export async function savePortraitLink(
  characterId: string,
  url: string,
  alt: string
): Promise<PortraitRow> {
  await requireOwner(characterId);
  const trimmed = url.trim();
  if (!isAllowedRemoteUrl(trimmed)) throw new Error('BAD_URL');

  await clearPortrait(characterId);

  await db.insert(characterPortraits).values({
    characterId,
    remoteUrl: trimmed.slice(0, 2000),
    alt: alt.trim().slice(0, 200),
  });

  return {
    id: characterId,
    alt: alt.trim().slice(0, 200),
    url: trimmed,
    remote: true,
  };
}
