# Phase 4 — homebrew in the builder, and approval that bites

Not started. Two halves that depend on each other: making homebrew pickable in the
wizard, and making approval mean something at save time.

Everything this phase needs already exists. `src/server/campaign-content.ts` ends with
`listCampaignContentIds` and `listContentIdsForCampaigns`, written for exactly the
rules check below and currently uncalled.

---

## 4a. The wizard offers homebrew

Today the guided wizard picks from the SRD only. A player who wants their own class
types the name into an "of your own" card, which spawns a bare
`sheet.homebrew.entries[]` record with no mechanics — and a forged class with real
features is not offered at all.

**The single injection point is `loadBuildCatalog`**
(`src/@creator/character/lib/srd/catalog.ts:32`). It is the one place the wizard's
options come from. Give it an options argument:

```ts
loadBuildCatalog(opts?: { userId?: string; campaignId?: string }): Promise<BuildCatalog>
```

and merge three sources, the same three `listPickableContent`
(`src/server/content.ts`) already merges for the sheet pickers: SRD, the player's own
homebrew, and the campaign library. Reuse that function rather than writing a fourth
merge — it already de-duplicates on `refKey` and takes the campaign into account.

Homebrew data for class/species/background/feat is _already in the parsed shape_
(`ClassDef`, `SpeciesDef`, …), which is the whole reason the schemas were written that
way. So the merge is a concat, not a conversion.

**Every summary needs to say where it came from.** Add to `ClassSummary`, `SpeciesDef`,
`BackgroundDef` and `FeatDef` in `character/lib/srd/types.ts`:

```ts
source: 'srd' | 'homebrew';
/** Set when source is 'homebrew'. The `homebrew.id`. */
homebrewId?: string;
```

The wizard steps (`character/components/wizard/steps/`) then render homebrew picks
inline with a "Homebrew" pill rather than in a separate card. Keep the free-text "of
your own" path: an idea not yet forged is a legitimate state, and taking it away would
make the wizard worse for the case it was built for.

**`loadClassDef`** (same file) must resolve a homebrew class key too, or picking a
homebrew class will yield no features.

### Watch for

- `catalog.ts` is `server-only` and `loadBuildCatalog` is called from the page
  (`src/app/creator/character/page.tsx`). Thread the campaign through from the
  `?campaign=` param the page already reads.
- A homebrew class chosen at a table that later removes it from play must not break the
  sheet. `CharacterSheetView` and the picker already render an unresolved ref as
  "unavailable"; the wizard needs the same courtesy rather than a crash.

---

## 4b. Approval gates the save

`checkSheetAgainstRules` (`src/@creator/campaign/lib/rules.ts:77-142`) checks the
boolean `allowHomebrew` and nothing else. It never reads approval status, so a _denied_
homebrew item keeps working — the decision the DM made has no effect on the character.

Add a `homebrew-unapproved` code beside the existing seven (`ability-method`,
`max-level`, `multiclass`, `banned-species`, `banned-class`, `backstory`,
`homebrew-off`).

The complication: `rules.ts` is deliberately pure and shared by the builder and the
server (see its header), so it cannot query the database. Pass the answer in:

```ts
checkSheetAgainstRules(sheet, rules, {
  allowHomebrew,
  /** Homebrew ids in play at this table. Omit to skip the check. */
  contentInPlay?: Set<string>,
})
```

The server side fills it from `listContentIdsForCampaigns` in
`assertSheetLegalForLinkedCampaigns` (`src/server/characters.ts`); the client fills it
from the campaign the player is building against, or omits it.

**Only check refs, not `homebrew.entries`.** A `sheet.homebrew.entries` record is a
sketch a player is still writing — blocking a save on it would make the builder unusable.
What must be gated is content the sheet _points at_: `inventory[].ref` and
`spellcasting.spells[].ref` with `source === 'homebrew'`, plus (after 4a) a homebrew
class/species/background/feat.

**Gate on the table's setting, not unconditionally.** Only when
`requireHomebrewApproval` is true. A table that does not require review has nothing to
enforce.

### Also in this phase

- **`HomebrewCreator`'s campaign filter is half-done.** It now filters the "Submit to…"
  dropdown to campaigns with `allowHomebrew`. It does not check whether the player is
  submitting something already in play there.
- **`requestApproval`** (`src/server/approvals.ts`) does not check `allowHomebrew` — a
  player can queue a submission at a table with homebrew switched off, where it will sit
  forever. `submitCharacterHomebrewForApproval` does check. Make them agree.

---

## Verifying

Follow [verifying-without-a-browser.md](verifying-without-a-browser.md). The chain worth
proving end to end, all through real server actions with real sessions:

1. A GM forges a class and puts it on a table.
2. A **player at that table** sees it in the wizard's class step, with a homebrew pill.
3. The player builds a character with it and saves — allowed.
4. The GM takes it out of play.
5. The player's next save is **refused** with the `homebrew-unapproved` sentence.
6. A player at a _different_ table never sees it at all.

Step 5 is the one that has never worked, and the reason this phase exists.
