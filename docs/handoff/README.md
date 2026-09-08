# Handoff — typed homebrew content

Branch: `feat/typed-homebrew-content`. Nothing is committed; the work sits in the
working tree.

This directory is the state of play for one piece of work: making homebrew content
typed, usable at a table, and attachable to characters. Phases 1–3 are built and
verified. Phases 4 and 5 are not started, and each has its own file here.

|                                                                    |                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [phase-4-builder-and-approval.md](phase-4-builder-and-approval.md) | Homebrew as a first-class pick in the wizard; approval that actually gates a save  |
| [phase-5-documentation.md](phase-5-documentation.md)               | The rules doc agents follow, and the guide players read                            |
| [verifying-without-a-browser.md](verifying-without-a-browser.md)   | How the first three phases were verified. Read this before claiming anything works |

---

## The idea, in one paragraph

There is one vocabulary for game content — `src/@shared/content/` — and both sources
speak it. SRD rows from `reference_data` and homebrew rows from the `homebrew` table
adapt into the same `ContentEntry`, so one renderer, one picker and one validator
serve both. The load-bearing rule is in `content/types.ts`: **a sheet references
content, it never copies its stats.** A copied stat block is a fork — the DM's
correction never reaches the character carrying it, and the same item on two sheets
drifts apart.

## What exists now

**Phase 1 — the content model.** `src/@shared/content/` (types, schemas, adapt,
registry, spell-slots). All seven types — class, subclass, species, background, feat,
spell, item — have real stat shapes, typed forms in the Forge
(`src/@creator/homebrew/components/forms/`), and one renderer
(`src/@shared/components/StatBlock.tsx`) used by the compendium, the Forge preview and
the DM's approval queue.

Identity types mirror the _parsed_ interfaces in `character/lib/srd/types.ts`, because
`srd/parse.ts` only exists to dig mechanics out of Open5e's prose and a form has no
prose to parse. Spell and item mirror the _raw_ Open5e field names, because those rows
were always consumed raw.

**Phase 2 — the campaign library.** `campaign_homebrew` (migration `0016`) plus
`src/server/campaign-content.ts`, shaped after `src/server/canon.ts`. This is the
consumer `homebrew_approvals` never had: approving a submission now puts it in play and
denying takes it out. Staff write, every member reads — unlike canon there is
deliberately no DM-only half, because a player who cannot see the homebrew at their own
table cannot build a character with it.

**Phase 3 — the sheet.** `spellcasting.spells` and `inventory` on
`character/schema.ts`, both holding refs. Armour class now comes from what is actually
worn (`derive.ts:armorClass`), attunement is a real per-item flag with the cap
enforced, and `diffSheets` records spell and inventory changes in the DM's log.

Pre-existing sheets migrate on read via `character/lib/migrate-sheet.ts` — additive and
lossless: the prose box is kept, and migration is triggered by `inventory` being
_absent_, so emptying it on purpose is respected.

## Bugs fixed on the way

Worth knowing about, because several were long-standing and none are obvious from the
code:

- **`srd-2024_shield` is both a piece of armour and a spell.** `reference_data` is
  keyed `(category, slug)`, so a slug is unique only within its category. Refs now
  carry `type`; before that an equipped Shield resolved to the Shield _spell_ and the
  character silently lost 2 AC.
- **The SRD files Shield as `category: "heavy"`, `ac_base: 2`** — a bonus, not a base.
  Taken literally an equipped shield set AC to 2. Corrected in `adapt.ts:armorCategory`.
- **Removing a homebrew entry from a sheet deleted the `homebrew` row**, cascading away
  the DM's approval decision and pulling the content out of every campaign library.
  `syncCharacterHomebrew` now unlinks and deletes only genuine orphans.
- **Homebrew added after joining a table never reached the DM.** Queueing ran only at
  link time. `updateCharacter` now re-queues for every linked campaign.
- **Homebrew renames and trait edits were invisible** in the DM's log.
- **`SheetComboBox` resolved on every keystroke**, so typing "Aetherborn" created a
  homebrew entry called "A" and renamed it nine times. Now resolves on selection or blur.
- **AC was a flat `10 + Dex`** that ignored armour entirely.
- **`equipment.attunedCount`** was a number a player typed with nothing behind it.

## Known and deliberately not fixed

**`notFound()` returns HTTP 200 instead of 404.** Isolated with throwaway probe routes:
it reproduces on a two-line page with no `force-dynamic`, so it is framework-level in
Next 15.5.25, not app code — `notFound()` is the correct API here. No data leaks (a
non-member sees no campaign name, description or join code; the not-found page renders,
only the status is wrong). Fixing it likely means a Next upgrade. Left alone rather
than hacked around.

**`allowPublicHomebrew` is a dead flag.** It exists in `CampaignSettings`, its default,
the zod schema and a switch in the manage form, and is read by nothing. It is waiting
on the Phase 2 marketplace (`PublicHomebrewMarketplace.tsx` is still a stub, and
`listPublicHomebrew` has no callers). Either wire it or delete it — do not leave a
third state.

**The multiclass rule is a heuristic.** `rules.ts` detects multiclassing with
`identity.class.includes('/')`.

## Not verified

Rendered output. There was no browser in the session this was built in, and every new
surface is a client component whose data never appears in fetched HTML. Everything
underneath — storage, validation, adaptation, derivation, permissions, logging — was
verified against the running app; see
[verifying-without-a-browser.md](verifying-without-a-browser.md).

Someone should click through: the Forge's typed forms and live preview, the campaign
Content tab, the inventory and spell sections, and the content picker.
