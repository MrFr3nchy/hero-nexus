# Phase 5 — the rules doc, and the guide

Not started. Three artefacts, each for a different reader.

The model to copy is `docs/design-language.md`. Read it first. It works because every
rule is phrased so a reviewer can point at a diff and say it is violated, and because
it opens by claiming authority: _"If a page and this doc disagree, the page is wrong.
Agents working on this repo follow it without being reminded."_ A content-model doc
that merely describes the schemas will be ignored.

---

## 1. `CLAUDE.md` (repo root, new)

There is no `CLAUDE.md` today, so `docs/design-language.md` — which explicitly expects
agents to follow it — is only found by accident. This file is the index that gets loaded
automatically.

Keep it short. It is a table of contents, not a manual:

- **What the project is**, in two sentences.
- **`docs/design-language.md`** — how any page must look and be laid out.
- **`docs/content-model.md`** — how game content is shaped, stored and referenced.
- **`src/db/README.md`** — the rule that `schema.ts` and `migrations/*.sql` are
  hand-written and edited together, in the same change. This one gets broken by anybody
  reaching for `drizzle-kit generate`.
- **The commands that must pass**: `npm run check` and `npm run build`. Note that
  `.check-parse.ts` at the repo root has six pre-existing prettier errors that are not
  yours and should stay untouched.

---

## 2. `docs/content-model.md` (new)

The canonical contract for `src/@shared/content/`. Same voice as the design language:
authoritative, and every rule falsifiable against a diff.

The rules that actually matter, each with its _why_ — the why is what stops someone
"simplifying" them back out:

1. **A sheet references content; it never copies stats.** A copy is a fork: the DM's
   correction never reaches the character carrying it, and the same item on two sheets
   drifts apart.
2. **A `ContentRef` is `(source, type, key)` — all three.** `reference_data` is keyed
   `(category, slug)`, so a slug is unique only within a category. The SRD ships
   `srd-2024_shield` as both armour and a spell; a ref without `type` resolved one to
   the other and silently changed a character's armour class.
3. **Homebrew `data` is the _parsed_ shape for class/subclass/species/background/feat,
   and the _raw_ Open5e shape for spell/item.** `srd/parse.ts` exists only to dig
   mechanics out of prose, and a form has no prose to parse; spell and item rows were
   always consumed raw, so renaming their fields would fork the shape the app already
   displays.
4. **Every leaf in a content schema carries `.catch()`.** Object-level failure silently
   returned an all-defaults Wizard — hit die 8, caster type NONE, no features — which
   looks like real data and is not. Degrade one field at a time.
5. **One renderer.** Anything showing content shows it through
   `@/@shared/components/StatBlock`. A second local mini-renderer is how two surfaces
   start disagreeing about what a spell is.
6. **A campaign's library is the answer to "may this be used here?"** Not
   `homebrew_approvals`, which records a _decision_; the library records the
   _consequence_, and a DM's own content has no decision behind it.
7. **Every change to a character is server-diffed into `character_history`.** Never
   accepted from the client — `character_audit_log` is a client-supplied mirror and a
   player can edit it away.
8. **Adding a content type is one entry in `CONTENT_REGISTRY`**, one schema, and one
   form. If it needs a switch statement anywhere else, the registry is being bypassed.

Include the seven field contracts as a table. Point at
`docs/handoff/verifying-without-a-browser.md` for how to check the work.

---

## 3. `/creator/homebrew/guide` (new route)

The player-facing half. What each field means, per type, in the rulebook's voice rather
than the schema's.

Design notes, because the design language governs this page too:

- **Rule 1, the object is the hero.** Lead with a real `StatBlock`, not a paragraph
  about stat blocks. A worked example — one spell, fully filled — teaches more than a
  field list.
- **Rule 2, counts are prose.** No stat tiles.
- Route it under the Forge and link it from `HomebrewCreator`'s header, where somebody
  staring at an empty form will actually look.
- It needs no auth beyond the existing `ProtectedRoute`, and no new server module —
  everything on it is static copy plus a fixture entry.

Cover, in this order: the seven types and what each is for; what a DM approving your
submission sees; how content gets onto a table (submit and be approved, or the DM adds
their own); and how to attach it to a character.

---

## 4. Update the existing pointers

- `README.md` — a line under **Email in development** pointing at both new docs.
- `src/db/README.md` — mention `0016_campaign_content.sql` in the same breath as the
  hand-written-migrations rule.
- `docs/design-language.md` — if the guide page or the Content tab establishes a
  pattern worth reusing, it belongs in the rules there, not only here.
