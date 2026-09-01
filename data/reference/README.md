# Reference data

D&D reference data (classes, species, backgrounds, feats, conditions, alignments,
languages, skills, spells, magic items, weapons, armor) is **not vendored** in the
repo. It is synced from the [Open5e v2 API](https://api.open5e.com/v2/) into the
local SQLite table `reference_data` by:

```bash
npm run db:sync     # reference data only
npm run db:seed     # rpg_systems + db:sync
```

Once synced it lives in `data/hero-nexus.db` (gitignored) and the app reads it
locally — no per-request API calls at runtime. A full sync takes a few minutes
(some Open5e endpoints, e.g. `classes` and `spells`, are slow to render upstream).

Each sync **replaces** the table contents (`DELETE` then re-insert), so it's safe
to re-run at any time to pick up upstream changes.

## Filtering

Open5e aggregates the SRD plus OGL/CC third-party content (Kobold Press, EN
Publishing, etc.) from many source books. We keep only rows tagged
`document.key === "srd-2024"` (System Reference Document 5.2) to match this
app's ruleset — set `OPEN5E_DOCUMENT` to change that. Categories that don't
consistently tag a source document (e.g. `skills`) fall back to the full set.

Open5e is also mid-migration to namespaced keys, so many entries exist twice
under the same document (a short legacy key and a `srd-2024_`-prefixed key,
identical name) — the sync collapses those to one row per name.

`class` and `species` rows include both base entries and subclasses/subspecies
(`data.subclass_of` / `data.is_subspecies`); the character creator's dropdowns
filter to base entries only.

## Licensing

SRD 5.2 content is © Wizards of the Coast, CC-BY-4.0. See
https://api.open5e.com/v2/documents/ for the license of every source Open5e
aggregates. We do **not** use data scraped from 5e.tools.

## Config

- `OPEN5E_BASE_URL` — override the API base (default `https://api.open5e.com/v2`).
- `OPEN5E_DOCUMENT` — override the preferred source document (default `srd-2024`).
