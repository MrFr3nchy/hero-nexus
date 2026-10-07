'use server';

import type { BookHit, RecordKind } from './lib/lookup';
import type { ContentEntry, ContentRef } from '@/@shared/content';
import {
  bookIndex,
  openBook,
  openRecord,
  type RecordLookup,
} from '@/server/lookup';

/** The books this reader may look up, one line each. Empty on any failure. */
export async function getBookIndexAction(
  campaignId: string
): Promise<BookHit[]> {
  try {
    return await bookIndex(campaignId);
  } catch {
    return [];
  }
}

/** One book entry, only if the index would have listed it. */
export async function openBookAction(
  campaignId: string,
  ref: ContentRef
): Promise<ContentEntry | null> {
  try {
    return await openBook(campaignId, ref);
  } catch {
    return null;
  }
}

/** One record Search found, as its tab would show it to this reader. */
export async function openRecordLookupAction(
  campaignId: string,
  record: RecordKind,
  id: string
): Promise<RecordLookup | null> {
  try {
    return await openRecord(campaignId, record, id);
  } catch {
    return null;
  }
}
