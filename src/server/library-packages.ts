import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import {
  characterSheetSchema,
  type CharacterSheet,
} from '@/@creator/character/schema';
import { migrateStoredSheet } from '@/@creator/character/lib/migrate-sheet';
import { normaliseTags } from '@/@creator/library/lib/publication';
import { isContentType, type ContentType } from '@/@shared/content';

import { db } from '@/db';
import {
  adoptions,
  characters,
  homebrew,
  publicationItems,
  publications,
} from '@/db/schema';
import { createCharacter } from './characters';
import { creditFor, freezeHomebrew, type PublicationInput } from './library';
import { requireUserId } from './session-user';

/**
 * Packages: a listing that carries more than one thing.
 *
 * A hero is not one row. It is a sheet plus every homebrew row its refs resolve
 * to, and a sheet published without them arrives on a stranger's account with
 * its species pointing at a `homebrew.id` in somebody else's forge — which
 * renders as `Unavailable` and costs the character whatever that species gave
 * it. So the referenced content travels with the sheet, is minted into rows the
 * adopter owns, and **the sheet's refs are rewritten before the character is
 * created**. That rewriting is the whole of this module's difficulty.
 *
 * Packages are snapshots, unlike a homebrew listing. A character sheet is
 * mutable play state; a published one is a pregen, and a pregen that kept
 * changing under the table using it would be a bug rather than a feature.
 */

/** How a package names its own pieces, so refs between them survive the trip. */
type LocalKeyMap = Map<string, string>;

/* --- what a sheet points at ------------------------------------------- */

/**
 * Every `homebrew.id` a sheet mentions.
 *
 * Four places, and missing any one of them ships a broken pregen:
 * `spellcasting.spells[].ref`, `inventory[].ref`, the four `build.*Key` fields
 * whose matching `*Source` is `homebrew`, and the per-level `subclassKey` /
 * `asi.featKey` on the level-up log. The last is the one that hides: a feat
 * taken at 4th level lives in `build.levels[]`, not on the sheet's face.
 */
export function collectSheetHomebrewIds(sheet: CharacterSheet): string[] {
  const ids = new Set<string>();

  for (const spell of sheet.spellcasting.spells) {
    if (spell.ref.source === 'homebrew') ids.add(spell.ref.key);
  }
  for (const item of sheet.inventory) {
    if (item.ref?.source === 'homebrew') ids.add(item.ref.key);
  }

  const build = sheet.build;
  const pairs: [string, string][] = [
    [build.classKey, build.classSource],
    [build.subclassKey, build.subclassSource],
    [build.speciesKey, build.speciesSource],
    [build.backgroundKey, build.backgroundSource],
  ];
  for (const [key, source] of pairs) {
    if (key && source === 'homebrew') ids.add(key);
  }
  for (const level of build.levels) {
    if (level.subclassKey && level.subclassSource === 'homebrew') {
      ids.add(level.subclassKey);
    }
    const asi = level.asi;
    if (asi?.featKey && asi.featSource === 'homebrew') ids.add(asi.featKey);
  }

  return [...ids];
}

/**
 * The same sheet with every homebrew id swapped for the adopter's own.
 *
 * Ids absent from `map` are left alone rather than blanked: an id with no row
 * behind it renders as `Unavailable` and keeps the denormalised name, which
 * tells the adopter what is missing. Blanking it would silently drop a species
 * off the sheet and look like the character never had one.
 */
export function remapSheetHomebrewIds(
  sheet: CharacterSheet,
  map: LocalKeyMap
): CharacterSheet {
  const swap = (key: string): string => map.get(key) ?? key;

  return {
    ...sheet,
    spellcasting: {
      ...sheet.spellcasting,
      spells: sheet.spellcasting.spells.map(spell =>
        spell.ref.source === 'homebrew'
          ? { ...spell, ref: { ...spell.ref, key: swap(spell.ref.key) } }
          : spell
      ),
    },
    inventory: sheet.inventory.map(item =>
      item.ref?.source === 'homebrew'
        ? { ...item, ref: { ...item.ref, key: swap(item.ref.key) } }
        : item
    ),
    build: {
      ...sheet.build,
      classKey:
        sheet.build.classSource === 'homebrew'
          ? swap(sheet.build.classKey)
          : sheet.build.classKey,
      subclassKey:
        sheet.build.subclassSource === 'homebrew'
          ? swap(sheet.build.subclassKey)
          : sheet.build.subclassKey,
      speciesKey:
        sheet.build.speciesSource === 'homebrew'
          ? swap(sheet.build.speciesKey)
          : sheet.build.speciesKey,
      backgroundKey:
        sheet.build.backgroundSource === 'homebrew'
          ? swap(sheet.build.backgroundKey)
          : sheet.build.backgroundKey,
      levels: sheet.build.levels.map(level => ({
        ...level,
        subclassKey:
          level.subclassSource === 'homebrew'
            ? swap(level.subclassKey)
            : level.subclassKey,
        asi:
          level.asi && level.asi.featSource === 'homebrew'
            ? { ...level.asi, featKey: swap(level.asi.featKey) }
            : level.asi,
      })),
    },
  };
}

/**
 * The sheet as it should leave the account that wrote it.
 *
 * A shared hero is a pregen, not a play record. `provenance` is the player's own
 * mirror of how they rolled their scores at their table — it is theirs, it names
 * dice they threw on a particular evening, and it means nothing on somebody
 * else's sheet. Everything else about a character that could embarrass its owner
 * lives in tables this never touches: `character_secrets`, `sheet_notes`,
 * `character_history` and `character_audit_log` are not part of `characters.sheet`
 * and so cannot travel by accident.
 */
function sheetForPublishing(sheet: CharacterSheet): CharacterSheet {
  return { ...sheet, provenance: [] };
}

/* --- publishing a hero ------------------------------------------------ */

export interface CharacterPackagePayload {
  sheet: CharacterSheet;
  /** The homebrew ids the sheet mentions, as they were in the author's forge. */
  homebrewKeys: string[];
}

/**
 * Put one of your heroes on the shelf.
 *
 * The referenced homebrew is frozen into `publication_items`, keyed by its id in
 * the author's forge — that key is what `adoptCharacter` maps from, and it is
 * only meaningful inside the package.
 */
export async function publishCharacter(
  characterId: string,
  input: PublicationInput
): Promise<string> {
  const userId = await requireUserId();

  const row = await db.query.characters.findFirst({
    where: and(eq(characters.id, characterId), eq(characters.ownerId, userId)),
  });
  if (!row) throw new Error('NOT_YOUR_CHARACTER');
  // Publishing freezes a snapshot somebody else will adopt whole. An
  // unfinished build has nothing coherent to freeze.
  if (row.status === 'draft') throw new Error('CHARACTER_IS_DRAFT');

  const sheet = sheetForPublishing(
    characterSheetSchema.parse(migrateStoredSheet(row.sheet))
  );
  const referenced = collectSheetHomebrewIds(sheet);

  // Only the author's own rows. A sheet may reference homebrew that reached it
  // through a campaign library — somebody else's content, which is theirs to
  // publish and not this author's, so it travels as a ref that will read as
  // `Unavailable` until the adopter finds it on the shelf themselves.
  const owned =
    referenced.length > 0
      ? await db
          .select()
          .from(homebrew)
          .where(
            and(inArray(homebrew.id, referenced), eq(homebrew.ownerId, userId))
          )
      : [];

  const payload: CharacterPackagePayload = {
    sheet,
    homebrewKeys: owned.map(h => h.id),
  };

  const patch = {
    title: input.title.trim() || row.name,
    summary: input.summary?.trim() ?? '',
    tags: normaliseTags(input.tags),
    visibility: input.visibility ?? ('public' as const),
    payload,
    updatedAt: new Date().toISOString(),
  };

  // One listing per hero, like one per homebrew row. Publishing the same
  // character again re-freezes the sheet and bumps the version rather than
  // putting a second copy of them on the shelf.
  const existing = await db.query.publications.findFirst({
    columns: { id: true, ownerId: true, version: true },
    where: eq(publications.characterId, characterId),
  });

  let publicationId: string;
  if (existing) {
    if (existing.ownerId !== userId) throw new Error('NOT_YOUR_PUBLICATION');
    await db
      .update(publications)
      .set({ ...patch, status: 'listed', version: existing.version + 1 })
      .where(eq(publications.id, existing.id));
    publicationId = existing.id;
    // The package is rebuilt from scratch: a hero who has lost a homebrew item
    // since the last publish must not keep shipping it.
    await db
      .delete(publicationItems)
      .where(eq(publicationItems.publicationId, publicationId));
  } else {
    const [created] = await db
      .insert(publications)
      .values({
        ownerId: userId,
        kind: 'character',
        characterId,
        credit: await creditFor(userId),
        contentType: null,
        ...patch,
      })
      .returning({ id: publications.id });
    publicationId = created.id;
  }

  if (owned.length > 0) {
    await db.insert(publicationItems).values(
      owned.map((item, index) => ({
        publicationId,
        kind: 'homebrew' as const,
        contentType: item.type,
        name: item.name,
        localKey: item.id,
        sortOrder: index,
        payload: freezeHomebrew({
          type: item.type,
          name: item.name,
          description: item.description,
          data: item.data,
        }),
      }))
    );
  }

  return publicationId;
}

/**
 * Take a hero home.
 *
 * Order matters: the bundled homebrew is minted first, then the sheet's refs are
 * rewritten to point at the new rows, and only then is the character created. A
 * character created before the remap would be saved with refs into a stranger's
 * forge, and `createCharacter` writes `character_homebrew` links off the sheet it
 * is handed — so the wrong order does not just look wrong, it records the wrong
 * links.
 */
export async function adoptCharacter(publicationId: string): Promise<string> {
  const userId = await requireUserId();

  const listing = await db.query.publications.findFirst({
    where: eq(publications.id, publicationId),
  });
  if (!listing) throw new Error('NOT_FOUND');
  if (listing.kind !== 'character') throw new Error('WRONG_KIND');
  if (listing.ownerId === userId) throw new Error('OWN_PUBLICATION');
  if (listing.status !== 'listed') throw new Error('WITHDRAWN');

  const payload = listing.payload as Partial<CharacterPackagePayload> | null;
  if (!payload?.sheet) throw new Error('CONTENT_GONE');

  const items = await db
    .select()
    .from(publicationItems)
    .where(
      and(
        eq(publicationItems.publicationId, publicationId),
        eq(publicationItems.kind, 'homebrew')
      )
    );

  const map = await mintHomebrewItems(userId, publicationId, items);

  // Through the schema on the way in. A package written by an older build is not
  // to be trusted to be shaped right, and `migrateStoredSheet` is how every
  // other read of a stored sheet earns that trust.
  const parsed = characterSheetSchema.parse(migrateStoredSheet(payload.sheet));
  const remapped = remapSheetHomebrewIds(parsed, map);

  const characterId = await createCharacter(remapped);

  await db
    .insert(adoptions)
    .values({
      userId,
      publicationId,
      mode: 'forked',
      characterId,
      version: listing.version,
    })
    .onConflictDoUpdate({
      target: [adoptions.userId, adoptions.publicationId],
      set: { mode: 'forked', characterId, version: listing.version },
    });

  return characterId;
}

/**
 * Mint the adopter's own rows for every homebrew item in a package.
 *
 * Returns the package's `localKey` -> new `homebrew.id` map. `forkedFrom` holds
 * the publication, not the source row: the listing is what stays reachable, and
 * it is what a provenance line should link to.
 */
export async function mintHomebrewItems(
  userId: string,
  publicationId: string,
  items: {
    contentType: string | null;
    name: string;
    payload: unknown;
    localKey: string;
  }[]
): Promise<LocalKeyMap> {
  const map: LocalKeyMap = new Map();
  for (const item of items) {
    const frozen = item.payload as {
      type?: string;
      name?: string;
      description?: string;
      data?: unknown;
    } | null;
    const type = frozen?.type ?? item.contentType ?? '';
    if (!isContentType(type)) continue;

    const [row] = await db
      .insert(homebrew)
      .values({
        ownerId: userId,
        type: type as ContentType,
        name: frozen?.name ?? item.name,
        description: frozen?.description ?? '',
        data: frozen?.data ?? {},
        // Private. Re-publishing somebody else's work under your own name is a
        // decision, not a side effect of taking their hero.
        visibility: 'private',
        forkedFrom: publicationId,
      })
      .returning({ id: homebrew.id });
    if (item.localKey) map.set(item.localKey, row.id);
  }
  return map;
}
