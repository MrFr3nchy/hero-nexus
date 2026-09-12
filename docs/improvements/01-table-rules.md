# 01 — Table rules: the Advise / Enforce switch and the DM's toggles

**Status: built** (`feat/improvements-01-table-rules`). What landed, and the two
places it departs from the plan: `standingIssue` in `lib/battlemap.ts` tells the
model's refusals (bounds, void, occupied) from the rules' (lava, a pillar), and
only the second kind goes through the fence; the death-save gate `NOT_DYING` is
left as a model refusal — there is no track to roll on — rather than a rule.

Covers from `improvements.txt`: _the rule of cool_, _toggle for DMs to "force
rules"_, the whole of _More settings for the DM_, _Rules at hand_, _per-fight
overrides_, _homebrew rules as content_.

**Build this first.** Every other spec in this folder adds an automation, and
every automation asks "is this table advising or enforcing, and which optional
rules are on?" Those answers come from here.

## Why

The app has a consistent stance today, stated in file headers rather than in
settings: `moveToken` does not fence distance, `AttacksPanel` "refuses nothing",
the Asking can be declined. That stance is right for a lot of tables and wrong
for others, and the moment we add Hit/Miss, condition effects and action
tracking, a table needs to say which it wants — once, and changeable mid-fight.

## Today

- `CampaignRules` (`src/@creator/campaign/lib/rules.ts`) governs character
  _building_: ability method, level cap, multiclass, bans, backstory. Pure, checked
  by builder and server alike, described by `describeRules`.
- `CampaignSettings.customRules` (`src/server/campaigns.ts`) is a free-text box
  nothing reads.
- Settings live in `campaigns.settings` as JSON — adding a block needs no
  migration.

## Design

### Data

Add a second structured block beside `rules`, same pattern, same file:

```ts
// src/@creator/campaign/lib/table-rules.ts  (pure; no React, no db)
export interface TableRules {
  /** advise: the app says what the rules say and does nothing. enforce: it refuses. */
  mode: 'advise' | 'enforce';
  potionAction: 'bonus' | 'action' | 'free';          // 2024 default: bonus
  encumbrance: 'off' | 'basic' | 'variant';           // basic = STR×15 cap only
  survival: { food: boolean; water: boolean; sleep: boolean };
  flanking: boolean;                                   // 2014 DMG optional
  diagonals: '5-5-5' | '5-10-5';                       // 2024 default 5-5-5
  crits: 'double-dice' | 'max-plus-roll';
  healingPotions: 'rolled' | 'max';
  rests: 'standard' | 'gritty' | 'heroic';
  lingeringInjuries: boolean;
  physicalDice: 'off' | 'marked' | 'unmarked';         // see 03
  playersApplyDamage: 'never' | 'propose' | 'apply';   // see 06
  foeHpShown: 'word' | 'number';                       // Bloodied vs 23/45
  movementFence: boolean;                              // see 05; only bites when mode = enforce
  showHitMiss: 'staff' | 'everyone';
}
export const DEFAULT_TABLE_RULES: TableRules = { mode: 'advise', ... };
export function mergeTableRules(raw: unknown): TableRules;   // like mergeRules
export function describeTableRules(t: TableRules): string[]; // like describeRules
```

`CampaignSettings` gains `table: TableRules`; `DEFAULT_CAMPAIGN_SETTINGS` and
the settings normaliser fold it in. **Per-fight overrides** are a partial of the
same shape on the encounter:

- Migration `0046_encounter_rule_overrides.sql`: `ALTER TABLE initiative_encounters ADD COLUMN rule_overrides TEXT NOT NULL DEFAULT '{}'`.
- `schema.ts`: `ruleOverrides: text('rule_overrides', { mode: 'json' })`.
- `effectiveRules(campaignId, encounterId?)` in `src/server/table-rules.ts`
  returns `{ ...campaign.table, ...encounter.ruleOverrides }`. Every server
  function that consults a rule calls this once and passes the result down —
  no lib module ever reads the database (the `RuleContext` pattern in `rules.ts`).

### The override, per instance

When `mode === 'enforce'` and a server function refuses, it throws a bare code
the way the codebase does (`CANNOT_STAND_THERE`, `OUT_OF_REACH`). The action
wrapper maps the code to a message **and** to `overridable: true` for staff. The
control shows "Do it anyway" to staff; pressing it re-calls the same action with
`{ ruling: true }`, which skips the fence and appends `· DM's ruling` to whatever
log line the write produces (roll label, `character_history` line, event
payload). Players never see the button; the server ignores `ruling` from
non-staff.

Announce a mode flip: a new `TableEvent` kind `'rules'` (`events.ts`) carrying
`{ mode, changed: string[] }`, audience everyone, described in `describe` as
"The DM is enforcing the rules" / "The DM has loosened the rules".

### LiveState

Add `rules: TableRules` (the effective set for the running fight, or the
campaign's when none) so the shelf panels read one object rather than each
fetching settings. Role-neutral — nothing in it is secret.

### UI

- **Manage page** (`CampaignManageForm.tsx`): a "At the table" section under the
  existing rules block, one control per field, grouped Combat / Rests / Survival
  / Dice / What players see. Each control's helper line is the 2024 rule it
  defaults to and the edition or book the alternative comes from.
- **Table ribbon** (`TableRibbon.tsx`): a staff-only Advise/Enforce pill,
  one tap, no confirm — it announces itself.
- **Initiative box header**: a "this fight" popover for staff with the handful
  of overrides worth flipping mid-fight (flanking, movement fence, mode).
- **Rules at hand** — a new `SCREEN_PANELS` entry `rules` (`players: true`).
  Three sections: _This table_ (`describeRules` + `describeTableRules`), _House
  rules_ (below), _The book_ — a searchable static reference in
  `src/@creator/campaign/lib/rules-reference.ts`: actions in combat, cover,
  jumping, falling, light and vision, mounted, underwater, suffocating,
  conditions (reuse `CONDITIONS`). SRD text only; cite the section name.

### House rules as content

The cleanest fit is a ninth content type `rule` in `CONTENT_REGISTRY`:
`{ title, summary, body, replaces?: string }`, rendered by `StatBlock`, forged
in the Forge, approved into a campaign library like anything else, published
through the Library. That gives "a good house rule travels" for free and keeps
one renderer (content-model rule 5). It does touch `docs/content-model.md`
("the eight types"), `schemas.ts`, `registry.ts`, the forms and the compendium
routes — call it out in the PR and update the doc in the same change. The
cheaper alternative, a `campaign_house_rules` table, is a second content path
and is not recommended.

## Verification

- Pure: `mergeTableRules` over `{}`, a partial, garbage; `describeTableRules`
  for every non-default.
- Running app: flip mode as staff via the action id, assert the `rules` event
  reaches a player's SSE stream and the DM's; assert a player POSTing
  `{ ruling: true }` to a fenced action is still refused.
- Both palettes for the manage section and the panel.

## Out of scope

The rules themselves — each lives in its own spec and only _reads_ this.
