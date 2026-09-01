/**
 * Sync D&D reference data from the Open5e v2 API into the local
 * `reference_data` table so the app can read it offline and fast (no
 * per-request API calls).
 *
 * Open5e: https://api.open5e.com/v2/ (v1 is being phased out). Aggregates the
 * SRD 5.2 (© Wizards of the Coast, CC-BY-4.0) plus third-party OGL/CC content
 * from other publishers (Kobold Press, EN Publishing, etc). Each row carries
 * its source in `document.key`; we keep only `srd-2024` (SRD 5.2) rows to
 * match this app's ruleset, falling back to the full set for categories that
 * don't tag a document (rare). Run via `npm run db:sync` (also called by
 * `npm run db:seed`).
 */
import Database from 'better-sqlite3';
import { join } from 'node:path';

const DB_PATH =
  process.env.HERO_NEXUS_DB_PATH ??
  join(process.cwd(), 'data', 'hero-nexus.db');

const BASE_URL = (
  process.env.OPEN5E_BASE_URL ?? 'https://api.open5e.com/v2'
).replace(/\/$/, '');

/** Only keep content from this source document (SRD 5.2 / "2024 rules"). */
const PREFERRED_DOCUMENT = process.env.OPEN5E_DOCUMENT ?? 'srd-2024';

const PAGE_LIMIT = 25;
const FETCH_TIMEOUT_MS = 120_000;
const MAX_RETRIES = 4;

/** reference_data category -> Open5e v2 endpoint */
const ENDPOINTS: Record<string, string> = {
  class: 'classes',
  species: 'species',
  background: 'backgrounds',
  feat: 'feats',
  condition: 'conditions',
  alignment: 'alignments',
  language: 'languages',
  skill: 'skills',
  spell: 'spells',
  'magic-item': 'magicitems',
  weapon: 'weapons',
  armor: 'armor',
};

interface Open5eDocument {
  key?: string;
}
interface Open5eRow {
  key?: string;
  name?: string;
  document?: Open5eDocument;
  short_name?: string;
  morality?: string;
  societal_attitude?: string;
  [k: string]: unknown;
}
interface Open5ePage {
  count: number;
  next: string | null;
  results: Open5eRow[];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Alignment rows have no `name` field — build one from their parts. */
function deriveName(row: Open5eRow): string {
  if (row.name) return row.name;
  if (row.morality && row.societal_attitude) {
    if (row.morality === 'neutral' && row.societal_attitude === 'neutral') {
      return 'True Neutral';
    }
    return `${capitalize(row.societal_attitude)} ${capitalize(row.morality)}`;
  }
  return row.short_name ?? row.key ?? 'Unknown';
}

async function fetchWithRetry(url: string): Promise<Open5ePage> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Open5ePage;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        const backoffMs = attempt * 2000;
        console.warn(
          `[sync]   ${url} attempt ${attempt} failed (${
            err instanceof Error ? err.message : err
          }), retrying in ${backoffMs}ms…`
        );
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function fetchAll(endpoint: string): Promise<Open5eRow[]> {
  const rows: Open5eRow[] = [];
  let url: string | null = `${BASE_URL}/${endpoint}/?limit=${PAGE_LIMIT}`;
  while (url) {
    const page = await fetchWithRetry(url);
    rows.push(...page.results);
    url = page.next;
  }
  return rows;
}

/**
 * Open5e is mid-migration to namespaced keys: many entries exist twice under
 * the same document — once under a short legacy key (`barbarian`) and once
 * under a `srd-2024_`-prefixed key (`srd-2024_barbarian`) — with identical
 * names. Collapse those to one row per name, preferring the shorter key.
 */
function dedupeByName(rows: Open5eRow[]): Open5eRow[] {
  const byName = new Map<string, Open5eRow>();
  for (const row of rows) {
    const name = deriveName(row).toLowerCase();
    const existing = byName.get(name);
    const key = row.key ?? '';
    if (!existing || key.length < (existing.key ?? '').length) {
      byName.set(name, row);
    }
  }
  return [...byName.values()];
}

export async function syncReference(): Promise<void> {
  const db = new Database(DB_PATH);
  try {
    const upsert = db.prepare(
      `INSERT INTO "reference_data" ("category", "slug", "name", "data")
       VALUES (@category, @slug, @name, @data)
       ON CONFLICT ("category", "slug")
       DO UPDATE SET "name" = excluded."name", "data" = excluded."data"`
    );

    db.exec('DELETE FROM "reference_data"');

    let grandTotal = 0;
    for (const [category, endpoint] of Object.entries(ENDPOINTS)) {
      try {
        const all = await fetchAll(endpoint);
        const preferred = all.filter(
          r => r.document?.key === PREFERRED_DOCUMENT
        );
        // Some categories (e.g. skills) don't consistently tag a document —
        // fall back to the unfiltered set rather than storing nothing.
        const rows = dedupeByName(preferred.length > 0 ? preferred : all);

        const writeAll = db.transaction((items: Open5eRow[]) => {
          for (const r of items) {
            const slug = r.key ?? r.name;
            if (!slug) continue;
            upsert.run({
              category,
              slug,
              name: deriveName(r),
              data: JSON.stringify(r),
            });
          }
        });
        writeAll(rows);
        grandTotal += rows.length;
        console.log(
          `[sync] ${category}: ${rows.length}${
            preferred.length === 0 && all.length > 0 ? ' (unfiltered)' : ''
          }`
        );
      } catch (err) {
        console.warn(
          `[sync] ${category} (${endpoint}) failed, keeping existing rows:`,
          err instanceof Error ? err.message : err
        );
      }
    }
    console.log(`[sync] ${grandTotal} rows upserted from Open5e`);
  } finally {
    db.close();
  }
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('sync-reference.ts') ||
    process.argv[1].endsWith('sync-reference.js'))
) {
  syncReference().catch(err => {
    console.error('[sync] failed:', err);
    process.exit(1);
  });
}
