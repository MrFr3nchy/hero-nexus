# The long campaign — phases

Build order. Each phase leaves the app usable and is worth shipping alone. `[x]` =
landed on `feat/campaign-longevity`.

**Built so far: phases 1, 2, 3, 7 and 8 in full; phase 4's conditions half; and phase 6
except its last item.** Phase 5 is untouched, phase 4's feats-as-references half is
still open, phase 8 owes only death and retirement, and phase 9 is not started.

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

- [x] Route `/characters/[id]/play`, archetype **Single object** — the sheet is the
      page. Sibling to the read view, not a mode flag on it (README, decision one).
- [x] `PlayCard` gains a standalone mount. **No extraction was needed** — it was
      already exported and already took `campaignId: string | null`, so mounting it
      outside a campaign was an import. The task as written overestimated the work.
- [x] Wire it through `applyPlayPatch(characterId, null, patch)`. The server already
      authorises the owner with no campaign (`play.ts:authorize`) — this phase adds no
      permission code, and if it seems to need some, something is wrong.
- [x] Gear and prepared spells on the play surface. **Not** by mounting
      `InventorySection` / `SpellListSection` as this task first said: those are
      react-hook-form editors with a save button, and play mode writes straight
      through. `LoadoutSection` is toggles only — equip, attune, prepare — over its own
      `getPlayLoadout` / `applyLoadoutPatch` pair. Rows are still created and deleted
      only in the builder, so there is no second inventory editor to drift.
- [x] Live updates degrade to absent when `campaignId` is null. `useCampaignLive` is not
      called; nothing polls. There is nobody to broadcast to.
- [x] Entry points, because the surface is worthless unreachable: a "Run this hero"
      action on `/characters/[id]`, on the `HeroCard` hover row in `CharactersList`, and
      from the campaign party list for the player's own character.

**Leaves the app usable as:** a player can run their character for a whole session
without opening the builder, with or without a table.

## Phase 2 — Weapons, proficiency, and attacks

The brief's last item. Schema first, because the UI cannot be built on prose.

- [x] **Typed weapon proficiency.** `proficiencies.weapons` stays as the prose a player
      wrote — deleting it throws away real data, the same reasoning that kept
      `equipment.items` — and gains a structured sibling: simple / martial category
      flags plus a list of specific weapon keys. The prose box stops being load-bearing.
- [x] The same on `coreTraits.weapons` in `content/schemas.ts`, so a class grants
      proficiency in a form something can read. Every leaf `.catch()`ed (content-model
      rule 4).
- [x] **No SQL migration was needed** — a sheet is a JSON blob in `characters.sheet`,
      not columns, so `src/db/schema.ts` is untouched. Existing sheets are brought
      forward in `migrate-sheet.ts` instead, which reads the prose line into the struct
      when the field is absent. Additive, lossless, idempotent, and it respects a grant
      that was deliberately cleared. Checked against the stored characters.
- [x] **`weaponAttacks(sheet, resolved)` in `derive.ts`.** One entry per equipped weapon:
      ability (Str, or Dex when finesse or ranged — the better of the two for finesse),
      attack bonus with the proficiency bonus applied _only_ when proficient, damage
      dice plus the ability modifier, and the damage type. An unresolved ref is absent,
      never zero — the rule the rest of the file already follows.
- [x] **Weapon mastery** as a typed field on `weaponStats`, not free text inside
      `properties`. The eight 2024 masteries as an enum; `properties` keeps carrying
      Heavy, Two-Handed and the rest.
- [x] An **Attacks** block on the sheet view and the play surface, rendered from
      `weaponAttacks`, each line rolling through `useDiceTray().rollNotation` — the
      dice tray is the app's one roll surface and does not count against a page's toy
      (design rule 4).
- [x] A non-proficient equipped weapon still renders, without the bonus. Showing it and
      being honest beats hiding it.

## Phase 3 — Levelling as a verb

Levelling works; nothing invites it.

- [x] "Level up" as a real action on the play surface and the roster card, landing in
      `AdvancementStep` scoped to the single new level rather than the whole ladder.
- [x] It must work for a `mode: 'manual'` sheet, which today gets a number box and no
      class table. Offer the guided ladder; do not force it.
- [x] XP → level: `identity.xp` exists and nothing reads it. Either surface the
      threshold and prompt at it, or say in the UI that the table runs on milestones.
      A number that means nothing is worse than no number.
- [ ] Verify both paths write the same `character_history` rows (content-model rule 7).

## Phase 4 — A sheet that stays true between sessions

- [x] **Persistent conditions on the sheet.** The fourteen keys from
      `campaign/lib/conditions.ts`, stored on the sheet beside `exhaustion` — not a new
      table, because they belong to the character rather than to a fight.
- [x] The encounter tracker reads them as its starting state and writes back on
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

- [x] **`/characters/[id]` stops being one vertical column of eight `framed` cards.**
      Two columns at desktop width with the combat block and abilities held at the top;
      at most one `framed` card on screen (design rule 6). This is the fix for "requires
      a lot of scrolling".
- [x] **The roster says where a hero sits.** `CharacterRow` gains the campaign from
      `campaign_members.characterId`; the `HeroCard` carries it as a `Ribbon` (rule 6 —
      ornament encodes state). `/characters/[id]` names the table in its header, where
      it already computes `tableContext` and spends it on nothing visible.
- [x] **A player's own view of a table.** The DM has `/campaigns/[id]/screen`; a player
      gets the same route with the panels `SCREEN_PANELS[k].players` already allows,
      plus one new panel: their own character, which is the Phase 1 surface embedded.
      No new permission model — `screen.ts` already filters by that flag.
- [x] Design-language debt from the README: `Glyph` gained `x` and `pencil`,
      `CharactersList` dropped `@iconify/react`, and `SpellListSection` stopped
      rendering a `question` glyph rotated 45 degrees as its remove control.

## Phase 7 — Portraits

Deliberately last: it is the most visible item on the brief and the least load-bearing,
and it needs a table decision that is easier to make once the sheet has settled.

- [x] **`character_portraits`** (the name it landed under), its own table — not a column on `characters`, and not
      `campaign_images`. A character outlives, precedes and may never have a campaign,
      so a portrait cannot inherit "are you at this table" as its access rule. Files on
      disk under `UPLOADS_DIR`, the row carrying path, mime, bytes and alt, exactly as
      `campaign_images` does; base64 in SQLite drags the image through every query and
      every backup, and that reasoning is already written down in `schema.ts`.
- [x] Serve route judging access by the character: the owner always, table staff and
      fellow members when it is linked.
- [x] Upload in the **builder's Story & gear tab**, not the wizard's Details step as
      this task first said: a portrait is stored against a character id, and the wizard
      runs before the first save, so there is nothing to hang it on. Mime and byte cap
      are validated server-side. **Not re-encoded** — that wants an image library this
      repo does not carry, so the type is trusted after an allow-list check and the
      bytes are served with the stored mime rather than a sniffed one.
- [x] **A link, not only an upload** — the brief asks for both. Hero Nexus makes no
      outbound calls at runtime (`CLAUDE.md`), so a remote URL must render in the
      browser as a plain `<img src>` and never be fetched by the server. That is a real
      difference in behaviour and needs saying in the UI, not hiding.
- [x] `HeroCard portrait` fed at last; `alt` required, because it is read aloud.
- [ ] Publishing a hero to the Library carries the portrait through
      `publication_assets`, which already exists for exactly this. **Not done** — the
      portrait is not yet part of what `publishCharacter` freezes.

## Phase 8 — Instanced heroes

The change finding 7 asks for and the third model decision settles. Do it before phase 9:
"which hero is ready to level" is a question about an instance, and asking it of a
blueprint that plays nowhere has no answer.

- [x] `characters.campaign_id` and `characters.forked_from`, both nullable, plus the
      migration — same commit, per `src/db/README.md`. `forked_from` carries no foreign
      key, matching `homebrew.forked_from`: the blueprint may be deleted and the
      instance must survive it.
- [x] `forkCharacterForCampaign(characterId, campaignId)` — deep-copies the sheet, mints
      the row, and points the membership at the copy. `setMemberCharacter` calls it
      instead of pointing at the blueprint directly. This is the whole behavioural
      change; everything below is consequence.
- [x] The copy is a **copy**, including `provenance` and the inventory, and excluding
      `character_history` — the instance starts its own log, because the DM's record is
      of what happened at _this_ table. Say so in the function, because the temptation
      to carry history over is strong and wrong.
- [x] **`/characters` shows both, together, and says which is which.** Not blueprints
      only — that was the first sketch of this task and it is wrong. A player who forks
      Gon to a table and then opens their roster to a level 1 Gon has watched their
      character reset, and no amount of correctness in the data model answers that.
      Blueprints and their instances are shown as one group per hero: the blueprint
      labelled as the copy that never plays, each instance labelled with its table and
      carrying its real level and hit points. The relationship is the thing being
      rendered, not a filter on it.
- [x] `characterTable` collapses to a column read. `sheet-notes.ts:viewerFor` loses its
      `findFirst` guess with it — those two are the callers finding 7 named.
- [x] Blueprint deletion leaves instances alone (`forked_from` carries no foreign key);
      a campaign folding leaves its instances alone (`campaign_id` is `ON DELETE SET
    NULL`). Neither cascades into the other.
- [ ] **Death and retirement — the one piece of this phase still owed.** An instance gains a status beyond `draft`/`ready` — a
      dead hero is not deleted, they are dead: still readable, still in the chronicle,
      no longer patchable by the play surface. Decide whether that is a third `status`
      value or its own column before writing either.
- [x] Publishing to the Library takes the **blueprint**, not an instance. A pregen with
      one table's loot and hit points on it is not a pregen.
- [x] The fork is explicit and says what it costs at the moment it happens — "changes to
      the original will not reach this table" — not in a settings page nobody opens.
- [x] Migrating what exists: every current `campaign_members.character_id` points at a
      played character, so those rows become instances in place (`campaign_id` filled,
      `forked_from` null — they were never forked from anything). Do **not** invent a
      blueprint for them; a null `forked_from` is the honest record of a hero that
      predates the split.

### Found while building phase 8

Each of these was a bug the instancing surfaced rather than caused, except the first,
which instancing introduced and then fixed.

- [x] Swapping a hero out left the old instance reading "Locandras" as though it were
      still in the chair. An instance keeps its campaign after being benched — it really
      is the hero who played those levels there — so `seated` became a fact separate
      from `table`, and a benched card says "played at", past tense, with a neutral
      ribbon rather than gold.
- [x] Re-picking a blueprint minted a _second_ instance every time, stranding the
      levels and loot of the first on a row the membership no longer pointed at.
      `forkCharacterForCampaign` now returns the existing copy for that table. Coming
      back to a table means coming back to the character who played there.
- [x] Opening an instance in the builder offered a campaign picker that could only ever
      be refused. It says which copy it is and links to the original instead.
- [x] The members panel listed heroes already committed to another table, and listed
      blueprints and their copies together as two identical names.
- [x] Roster cards carry hit points now, read out of the sheet by SQLite rather than by
      shipping every sheet to the server. Two copies of one hero at the same level look
      identical without them, and the numbers are what make the divergence visible
      rather than merely asserted in the caption.

## Phase 9 — The level-up signal

Two things, and the second is smaller than it sounds.

- [ ] **Stop `awardExperience` applying a milestone level** (finding 8). It records the
      grant; the player takes the level through the ladder that already exists. The XP
      branch keeps writing `identity.xp`, because experience is a number a character
      _has_ — a level is a decision they make.
- [ ] "Ready to level" is **derived, not stored**. Two sources, both queries:
      `xpStanding(xp, level).canLevel` for an XP table, and an unconsumed milestone
      grant for a milestone one. `getCampaignPulse` is the established pattern.
- [ ] Surface it where the player already looks: the roster card, the campaign page, and
      the play surface — each linking to `?intent=level-up`, which already exists.
- [ ] **No `notices` table yet.** Everything above is derivable, and a notification
      store that only ever holds derivable facts is a cache with a staleness bug in its
      future. Build one when there is a fact that cannot be derived — a DM's one-off
      message, or "a handout is waiting" — and not before.
- [ ] Email stays out of it. `mail.ts` is transactional (verification, password reset);
      "you can level up" is not that, and wiring it in means delivery settings,
      unsubscribes and a sending reputation to protect. In-app first.

---

## Deliberately not in this plan

- **Multiclassing.** `rules.ts` detects it with `identity.class.includes('/')`. Doing it
  properly means per-class levels, per-class slot contribution and a spell list per
  class — larger than every phase above combined, and it should be its own handoff.
- **`allowPublicHomebrew`.** Still the dead flag the typed-homebrew handoff flagged.
  Not this work's to resolve, but it is still a third state and still wants either
  wiring or deleting.
