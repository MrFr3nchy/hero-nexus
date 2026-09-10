# The long campaign — phases

Build order. Each phase leaves the app usable and is worth shipping alone. `[ ]` = not
started; nothing here is built yet.

The model these tasks implement is in [README.md](README.md). Read it first — the two
decisions recorded there (the sheet gets a third surface rather than a third copy; a
free hero and a linked hero share it) are what make several of these tasks correct
rather than arbitrary.

**Every phase that touches the database edits `src/db/schema.ts` and a new
`src/db/migrations/*.sql` in the same commit.** There is no drizzle-kit generate step
here. This is the rule `CLAUDE.md` says gets broken most.

---

## Phase 1 — The player's play surface

The phase that makes the other six reachable. Builds almost no new mechanics; mounts
the ones that exist.

- [ ] Route `/characters/[id]/play`, archetype **Single object** — the sheet is the
      page. Sibling to the read view, not a mode flag on it (README, decision one).
- [ ] `PlayCard` gains a standalone mount: today it is composed inside
      `PartyPlayPanel`. Extract the card, leave the panel as one caller. No second copy
      of the slot pips.
- [ ] Wire it through `applyPlayPatch(characterId, null, patch)`. The server already
      authorises the owner with no campaign (`play.ts:authorize`) — this phase adds no
      permission code, and if it seems to need some, something is wrong.
- [ ] Mount `InventorySection` and `SpellListSection` on the play surface, bound to the
      same `control`. They are already `control`-driven; this is composition.
- [ ] Live updates degrade to absent when `campaignId` is null. `useCampaignLive` is not
      called; nothing polls. There is nobody to broadcast to.
- [ ] Entry points, because the surface is worthless unreachable: a "Run this hero"
      action on `/characters/[id]`, on the `HeroCard` hover row in `CharactersList`, and
      from the campaign party list for the player's own character.

**Leaves the app usable as:** a player can run their character for a whole session
without opening the builder, with or without a table.

## Phase 2 — Weapons, proficiency, and attacks

The brief's last item. Schema first, because the UI cannot be built on prose.

- [ ] **Typed weapon proficiency.** `proficiencies.weapons` stays as the prose a player
      wrote — deleting it throws away real data, the same reasoning that kept
      `equipment.items` — and gains a structured sibling: simple / martial category
      flags plus a list of specific weapon keys. The prose box stops being load-bearing.
- [ ] The same on `coreTraits.weapons` in `content/schemas.ts`, so a class grants
      proficiency in a form something can read. Every leaf `.catch()`ed (content-model
      rule 4).
- [ ] Migration + `schema.ts` in one commit; a sheet written before this parses with
      empty structured proficiency and keeps its prose.
- [ ] **`weaponAttacks(sheet, resolved)` in `derive.ts`.** One entry per equipped weapon:
      ability (Str, or Dex when finesse or ranged — the better of the two for finesse),
      attack bonus with the proficiency bonus applied _only_ when proficient, damage
      dice plus the ability modifier, and the damage type. An unresolved ref is absent,
      never zero — the rule the rest of the file already follows.
- [ ] **Weapon mastery** as a typed field on `weaponStats`, not free text inside
      `properties`. The eight 2024 masteries as an enum; `properties` keeps carrying
      Heavy, Two-Handed and the rest.
- [ ] An **Attacks** block on the sheet view and the play surface, rendered from
      `weaponAttacks`, each line rolling through `useDiceTray().rollNotation` — the
      dice tray is the app's one roll surface and does not count against a page's toy
      (design rule 4).
- [ ] A non-proficient equipped weapon still renders, without the bonus. Showing it and
      being honest beats hiding it.

## Phase 3 — Levelling as a verb

Levelling works; nothing invites it.

- [ ] "Level up" as a real action on the play surface and the roster card, landing in
      `AdvancementStep` scoped to the single new level rather than the whole ladder.
- [ ] It must work for a `mode: 'manual'` sheet, which today gets a number box and no
      class table. Offer the guided ladder; do not force it.
- [ ] XP → level: `identity.xp` exists and nothing reads it. Either surface the
      threshold and prompt at it, or say in the UI that the table runs on milestones.
      A number that means nothing is worse than no number.
- [ ] Verify both paths write the same `character_history` rows (content-model rule 7).

## Phase 4 — A sheet that stays true between sessions

- [ ] **Persistent conditions on the sheet.** The fourteen keys from
      `campaign/lib/conditions.ts`, stored on the sheet beside `exhaustion` — not a new
      table, because they belong to the character rather than to a fight.
- [ ] The encounter tracker reads them as its starting state and writes back on
      encounter end, so `initiative_entries.conditionKeys` stops being the only home.
      One vocabulary, two surfaces — the shape `content/` already uses.
- [ ] **Feats as references.** A `feats: ContentRef[]` on the sheet, filled from
      `asi.featKey`/`featSource` and the background's feat. `details.feats` stays as
      prose and stops being the record. This closes the content-model rule 1 gap.
- [ ] Feats resolve through `resolveContentRefs` and render through `StatBlock`, so a
      homebrew feat approved at a table shows its real benefits (rule 5, one renderer).

## Phase 5 — Weight, money, and the long tail

Lowest value; do it last or not at all. Listed so it is a decision rather than an
oversight.

- [ ] Carried weight summed from resolved items; carrying capacity from Strength;
      encumbrance shown as a state, not a blocker. Hand-typed rows have no weight and
      must not read as zero.
- [ ] Currency changes recorded rather than overwritten, so "where did the 400gp go" has
      an answer. `campaign/lib/treasury.ts` and `LedgerPanel` already do this for the
      party — read them before inventing a second shape.

## Phase 6 — The surfaces the brief named

Design work, best done once the data above exists.

- [ ] **`/characters/[id]` stops being one vertical column of eight `framed` cards.**
      Two columns at desktop width with the combat block and abilities held at the top;
      at most one `framed` card on screen (design rule 6). This is the fix for "requires
      a lot of scrolling".
- [ ] **The roster says where a hero sits.** `CharacterRow` gains the campaign from
      `campaign_members.characterId`; the `HeroCard` carries it as a `Ribbon` (rule 6 —
      ornament encodes state). `/characters/[id]` names the table in its header, where
      it already computes `tableContext` and spends it on nothing visible.
- [ ] **A player's own view of a table.** The DM has `/campaigns/[id]/screen`; a player
      gets the same route with the panels `SCREEN_PANELS[k].players` already allows,
      plus one new panel: their own character, which is the Phase 1 surface embedded.
      No new permission model — `screen.ts` already filters by that flag.
- [ ] Design-language debt from the README: `Glyph` gains a real `x`/`remove`;
      `CharactersList` drops `@iconify/react`.

## Phase 7 — Portraits

Deliberately last: it is the most visible item on the brief and the least load-bearing,
and it needs a table decision that is easier to make once the sheet has settled.

- [ ] **`character_assets`**, its own table — not a column on `characters`, and not
      `campaign_images`. A character outlives, precedes and may never have a campaign,
      so a portrait cannot inherit "are you at this table" as its access rule. Files on
      disk under `UPLOADS_DIR`, the row carrying path, mime, bytes and alt, exactly as
      `campaign_images` does; base64 in SQLite drags the image through every query and
      every backup, and that reasoning is already written down in `schema.ts`.
- [ ] Serve route judging access by the character: the owner always, table staff and
      fellow members when it is linked.
- [ ] Upload in the wizard's Details step and on the play surface. Validate mime and
      byte cap server-side; re-encode rather than trusting the extension.
- [ ] **A link, not only an upload** — the brief asks for both. Hero Nexus makes no
      outbound calls at runtime (`CLAUDE.md`), so a remote URL must render in the
      browser as a plain `<img src>` and never be fetched by the server. That is a real
      difference in behaviour and needs saying in the UI, not hiding.
- [ ] `HeroCard portrait` fed at last; `alt` required, because it is read aloud.
- [ ] Publishing a hero to the Library carries the portrait through
      `publication_assets`, which already exists for exactly this.

---

## Deliberately not in this plan

- **Multiclassing.** `rules.ts` detects it with `identity.class.includes('/')`. Doing it
  properly means per-class levels, per-class slot contribution and a spell list per
  class — larger than every phase above combined, and it should be its own handoff.
- **`allowPublicHomebrew`.** Still the dead flag the typed-homebrew handoff flagged.
  Not this work's to resolve, but it is still a third state and still wants either
  wiring or deleting.
