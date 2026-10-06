import 'server-only';

import { randomUUID } from 'node:crypto';

import {
  buildImportedSheet,
  nameIndex,
  type DdbFacts,
  type ImportRef,
} from '@/@creator/character/lib/ddb-import';
import { makeEmptySheet } from '@/@creator/character/schema';
import { createCharacter } from './characters';
import { listAllSrdContent } from './content';
import { requireUserId } from './session-user';

/**
 * D&D Beyond import (7b): the player pastes the JSON, and the browser runs
 * `parseDdbCharacter` on it — an export can be megabytes, past a server
 * action's body limit, and the facts are a few kilobytes. The action
 * validates those facts before they reach here. Nothing here calls
 * D&D Beyond. Names are matched to SRD content by type and name (content
 * rule 1); anything that does not match comes in by name and is flagged.
 * Homebrew is never created from imported text.
 */

export interface DdbPreview {
  facts: DdbFacts;
  items: { name: string; quantity: number; match: ImportRef | null }[];
  spells: { name: string; level: number | null; match: ImportRef | null }[];
}

async function srdIndex(): Promise<{
  item: (name: string) => ImportRef | null;
  spell: (name: string) => ImportRef | null;
}> {
  const refs: ImportRef[] = [];
  for (const e of await listAllSrdContent()) {
    if (e.type !== 'item' && e.type !== 'spell') continue;
    refs.push({ source: 'srd', type: e.type, key: e.ref.key, name: e.name });
  }
  return {
    item: nameIndex(refs.filter(r => r.type === 'item')),
    spell: nameIndex(refs.filter(r => r.type === 'spell')),
  };
}

/** What would be created, before anything is: the player sees this first. */
export async function previewDdbImport(facts: DdbFacts): Promise<DdbPreview> {
  await requireUserId();
  const index = await srdIndex();
  return {
    facts,
    items: facts.items.map(i => ({
      name: i.name,
      quantity: i.quantity,
      match: index.item(i.name),
    })),
    spells: facts.spells.map(s => ({
      name: s.name,
      level: s.level,
      match: index.spell(s.name),
    })),
  };
}

/** Create the hero as a draft and hand back its id, for the builder. */
export async function importDdbCharacter(facts: DdbFacts): Promise<string> {
  const preview = await previewDdbImport(facts);
  const sheet = buildImportedSheet(
    preview.facts,
    preview.items.map(i => i.match),
    preview.spells.map(s => s.match),
    randomUUID,
    makeEmptySheet
  );
  return createCharacter(sheet, 'draft');
}
