'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  adopt,
  fork,
  listAdoptions,
  unadopt,
  type AdoptionRow,
} from '@/server/adoptions';
import {
  deletePublication,
  getPublication,
  listMyHomebrewPublications,
  listMyPublications,
  listShelf,
  publicationForHomebrew,
  publishHomebrew,
  publishImage,
  setPublicationStatus,
  updatePublication,
  type PublicationDetail,
  type ShelfFilters,
} from '@/server/library';
import { publishCampaign } from '@/server/library-campaign-package';
import { publishCharacter } from '@/server/library-packages';

import { CONTENT_TYPES } from '@/@shared/content';
import { PUBLICATION_KINDS, type PublicationCard } from './lib/publication';

/**
 * The Wandering Library, from the browser's side.
 *
 * Every failure comes back as `{ ok, error }` with a sentence a person can act
 * on, rather than as a thrown code — the same shape
 * `submitHomebrewToCampaignAction` settled on, and for the same reason: a
 * server action's throw reaches the client as "an error occurred".
 */

const publicationInput = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().max(2000).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  visibility: z.enum(['public', 'unlisted']).optional(),
});

const shelfFilters = z.object({
  kind: z.enum(PUBLICATION_KINDS).optional(),
  contentType: z.enum(CONTENT_TYPES).optional(),
  tag: z.string().max(32).optional(),
  query: z.string().max(120).optional(),
  ownerId: z.string().max(64).optional(),
  sort: z.enum(['newest', 'adopted']).optional(),
});

export interface LibraryResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * What each thrown code means to a reader.
 *
 * `WITHDRAWN` and `CONTENT_GONE` are the two that will actually happen: an
 * author tidying their forge while somebody else has the page open is normal,
 * not exceptional.
 */
const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'You are not signed in.',
  SESSION_STALE: 'Your session has expired. Sign in again.',
  NOT_FOUND: 'That listing is not on the shelf.',
  NOT_YOUR_HOMEBREW: 'That homebrew is not yours to publish.',
  NOT_YOUR_PUBLICATION: 'That listing is not yours.',
  NOT_YOUR_CHARACTER: 'That hero is not yours to publish.',
  WRONG_KIND: 'That listing does not carry what this was asked to take.',
  OWN_PUBLICATION: 'You wrote this one — it is already yours.',
  WITHDRAWN: 'The author has taken this off the shelf.',
  CONTENT_GONE: 'The author has deleted what this listing pointed at.',
  KIND_NOT_ADOPTABLE_YET:
    'Taking a bundle home is not built yet — everything else on the shelf is.',
  NOT_STAFF_OF_CAMPAIGN: 'Only a table’s DM can publish it.',
  CAMPAIGN_REQUIRED: 'Choose which of your tables the picture should go to.',
  IMAGE_NOT_FOUND: 'That picture is no longer there.',
  UNSUPPORTED_TYPE: 'That file is not a kind of image this app serves.',
  TOO_LARGE: 'That file is too big.',
  NOT_STAFF: 'Only a table’s DM can do that.',
};

function fail(err: unknown): LibraryResult {
  const code = err instanceof Error ? err.message : '';
  return { ok: false, error: MESSAGES[code] ?? 'Something went wrong.' };
}

export async function listShelfAction(
  filters: unknown = {}
): Promise<PublicationCard[]> {
  const parsed = shelfFilters.safeParse(filters ?? {});
  return listShelf((parsed.success ? parsed.data : {}) as ShelfFilters);
}

export async function getPublicationAction(
  id: string
): Promise<PublicationDetail | null> {
  return getPublication(id);
}

export async function listMyPublicationsAction(): Promise<PublicationCard[]> {
  return listMyPublications();
}

/** The author's own listings, so the Forge can mark what is already out. */
export async function listMyHomebrewPublicationsAction(): Promise<
  PublicationCard[]
> {
  return listMyHomebrewPublications();
}

export async function publicationForHomebrewAction(
  homebrewId: string
): Promise<PublicationCard | null> {
  return publicationForHomebrew(homebrewId);
}

export async function publishHomebrewAction(
  homebrewId: string,
  input: unknown
): Promise<LibraryResult> {
  const parsed = publicationInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Give the listing a title.',
    };
  }
  try {
    const id = await publishHomebrew(homebrewId, parsed.data);
    revalidatePath('/library');
    revalidatePath('/creator/homebrew');
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Put a campaign on the shelf: the prep, never the table.
 *
 * See `@/server/library-campaign-package` for the allow-list — no members, no
 * invites, no join code, no characters, no record of sessions played.
 */
export async function publishCampaignAction(
  campaignId: string,
  input: unknown
): Promise<LibraryResult> {
  const parsed = publicationInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Give the listing a title.',
    };
  }
  try {
    const id = await publishCampaign(campaignId, parsed.data);
    revalidatePath('/library');
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

/** Put one of your heroes on the shelf, with the homebrew it needs. */
export async function publishCharacterAction(
  characterId: string,
  input: unknown
): Promise<LibraryResult> {
  const parsed = publicationInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Give the listing a title.',
    };
  }
  try {
    const id = await publishCharacter(characterId, parsed.data);
    revalidatePath('/library');
    revalidatePath('/characters');
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

/** Put one of a campaign's pictures on the shelf. Staff of that table only. */
export async function publishImageAction(
  campaignImageId: string,
  input: unknown
): Promise<LibraryResult> {
  const parsed = publicationInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Give the listing a title.',
    };
  }
  try {
    const id = await publishImage(campaignImageId, parsed.data);
    revalidatePath('/library');
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePublicationAction(
  id: string,
  input: unknown
): Promise<LibraryResult> {
  const parsed = publicationInput.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'That listing could not be updated.' };
  }
  try {
    await updatePublication(id, parsed.data);
    revalidatePath('/library');
    revalidatePath(`/library/${id}`);
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function setPublicationStatusAction(
  id: string,
  status: 'listed' | 'withdrawn'
): Promise<LibraryResult> {
  try {
    await setPublicationStatus(id, status);
    revalidatePath('/library');
    revalidatePath(`/library/${id}`);
    revalidatePath('/creator/homebrew');
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function deletePublicationAction(
  id: string
): Promise<LibraryResult> {
  try {
    await deletePublication(id);
    revalidatePath('/library');
    revalidatePath('/creator/homebrew');
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Take it. A homebrew listing arrives as a link — the author's corrections keep
 * reaching you. A picture is copied into `targetCampaignId`, which that kind
 * requires.
 */
export async function adoptAction(
  publicationId: string,
  targetCampaignId?: string
): Promise<LibraryResult> {
  try {
    await adopt(publicationId, targetCampaignId);
    revalidatePath('/library');
    revalidatePath(`/library/${publicationId}`);
    return { ok: true, id: publicationId };
  } catch (err) {
    return fail(err);
  }
}

/** Take it as your own copy — yours to edit, and it stops tracking theirs. */
export async function forkAction(
  publicationId: string
): Promise<LibraryResult> {
  try {
    const id = await fork(publicationId);
    revalidatePath('/library');
    revalidatePath(`/library/${publicationId}`);
    revalidatePath('/creator/homebrew');
    return { ok: true, id };
  } catch (err) {
    return fail(err);
  }
}

export async function unadoptAction(
  publicationId: string
): Promise<LibraryResult> {
  try {
    await unadopt(publicationId);
    revalidatePath('/library');
    revalidatePath(`/library/${publicationId}`);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function listAdoptionsAction(): Promise<AdoptionRow[]> {
  return listAdoptions();
}
