# 10 — The world's clock: a calendar, days, rests, and growing up

Covers from `improvements.txt`: _day and sleep cycles / a DM-editable
calendar_, _survival (food, water, sleep)_, _rests as a flow_, _level-up at the
table_, _Heroic Inspiration_, and `survival` / `rests` from 01.

Depends on 01 and 04 (effects that end "in 8 hours" need a clock to end on).

## Today

- `campaign_sessions` carry a real-world date (`formatCalendarDate`). Nothing
  carries a fictional one.
- `restParty(kind)` is DM-only and instant: long = full HP, slots, half hit
  dice back, −1 exhaustion; short = temp HP gone. Hit dice are spent by their
  owners through `spendHitDice`.
- `sessionAwards` / `awards.ts` hand out XP and milestones; the sheet is the
  balance. Nothing notices a threshold.
- `campaignClocks`, `campaignTimers`, `downtimePeriods` all measure the real
  world or abstract progress.

## Design

### A calendar the DM owns

Definition in settings (JSON, no migration), current time on the campaign row:

```ts
// lib/calendar.ts (pure)
export interface CalendarDef {
  name: string;
  months: { name: string; days: number }[]; // default 12 × 30
  weekdays: string[]; // default 7
  hoursPerDay: number; // default 24
  epochLabel: string; // "DR", "AC", ""
  moons?: { name: string; cycleDays: number; offset: number }[];
}
export interface WorldTime {
  year: number;
  month: number;
  day: number;
  minute: number;
} // month/day 1-based, minute 0..hoursPerDay*60-1
export function advance(def, t, minutes): WorldTime;
export function format(def, t, style: 'date' | 'datetime' | 'weekday'): string;
export function weekday(def, t): string;
export function daysBetween(def, a, b): number;
export const GREGORIAN_LIKE: CalendarDef; // the default
```

```sql
-- 0057_world_time.sql
ALTER TABLE campaigns ADD COLUMN world_time TEXT;          -- JSON WorldTime, NULL = the table has not started counting
ALTER TABLE campaign_sessions ADD COLUMN world_date TEXT;  -- JSON WorldTime the sitting opened on
ALTER TABLE canon_entries ADD COLUMN world_date TEXT;
ALTER TABLE player_journals ADD COLUMN world_date TEXT;
ALTER TABLE downtime_periods ADD COLUMN world_from TEXT;
ALTER TABLE downtime_periods ADD COLUMN world_to TEXT;
```

`advanceTime(campaignId, minutes, why)` in `src/server/world-time.ts` is the
only writer. It publishes a `time` event ("Dawn, 3rd of Mirtul") and runs the
**day tick** for every whole day boundary crossed (below). Callers: the DM's
clock control (+10 min / +1 hour / to dawn / to dusk / +1 day / set), rests,
ritual casting (07), travel downtime, and the Chronicle when a sitting opens
("the party wakes on…").

Effects measured in hours (04's out-of-fight conditions) get an optional
`ends_at_world` on the sheet's `combat.conditions` entries — change that array
from keys to `{ key, until?: WorldTime }` with a `.catch()` that accepts the old
bare string — and the day tick clears the expired.

### The day tick and survival

Under `survival` from 01, each whole day crossed asks the party, through a
**Provisions** card in the party panel and Your hero:

- **Food** — 1 lb / day. A hero's `use`-able rations (09) are consumed
  automatically if present and marked "eat automatically"; otherwise a missed
  day increments `daysWithoutFood`; past `max(1, CON mod + 1)` days each further
  day adds one exhaustion (2024 PHB "Malnutrition").
- **Water** — 1 gallon (2 in heat, a DM flag on the day). Half → DC 15 CON save
  or exhaustion; none → exhaustion, both automatic through the Asking / the
  sheet.
- **Sleep** — a long rest needs 8 hours; a day with none adds exhaustion after
  24 hours awake (`hoursSinceRest` on the sheet, reset by a long rest).

Everything is a `character_history` line and a `vitals` event, and nothing
here runs when `survival` is off — the schema fields still exist so a DM can
turn it on mid-campaign.

### Rests as a flow

Replace the two instant buttons with **Call a rest** (staff): kind, then a
per-hero checklist the table sees.

- **Short** (1 h; `heroic`: 5 min; `gritty`: 8 h): each player is asked, in
  their Your hero panel, how many hit dice to spend — `spendHitDice` as today,
  through the tray — and confirms. Staff see who has answered. Confirm all →
  temp HP cleared, time advanced, features that recharge on a short rest (a
  `recharge: 'short' | 'long'` flag on class features is the builder's problem;
  the sheet's `features[].uses` reset here when the flag exists).
- **Long** (8 h; `heroic`: 1 h; `gritty`: 7 days): each player confirms; a
  caster who prepares is offered the prepared-spells picker (`applyLoadoutPatch`
  already toggles `prepared`); then `restParty('long')` as today plus 04's
  clearing of round-measured effects, `hoursSinceRest = 0`, Heroic Inspiration
  for species that grant it at dawn, the day tick, and the `time` event.
- Interruption: staff can **break** a rest in progress (a random encounter);
  nothing is granted, the time advanced so far stays.

State for an in-progress rest is a row so a refresh does not lose who has
answered:

```sql
-- 0058_rests.sql
CREATE TABLE campaign_rests (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('short','long')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','broken')),
  answers TEXT NOT NULL DEFAULT '{}',        -- JSON { [characterId]: { hitDice: n, confirmed: bool } }
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT
);
```

`LiveState.rest: RestRow | null`.

### Level-up at the table

The SRD's Character Advancement table (XP thresholds) goes in
`character/lib/advancement.ts` as `levelForXp(xp)`. After `grantAward`
(`awards.ts`) writes XP to a sheet, compare `levelForXp` with `identity.level`;
when it rises, publish a `levelup` event to the owner and staff ("Ilse has
enough to reach level 5") and set `sheet.progress.levelUpPending = true`. Your
hero shows a gold line with a link straight to the builder's Advancement step
(`AdvancementStep.tsx`) for that level; the DM's party panel shows who is owed
one. Milestone awards do the same via `identity.level` directly. Clearing the
flag is the builder's save.

### Heroic Inspiration

`combat.heroicInspiration: boolean` on the sheet (`.catch(false)`). Grant: staff
from the party panel or the initiative card, one tap, `vitals` event
"The DM gives Ilse Heroic Inspiration". Spend: a **reroll** affordance on the
tray after any d20 roll the viewer made while they hold it — calls
`rerollWithInspiration(rollId)`, which re-rolls the d20 on the server, writes a
second `campaign_rolls` row labelled "(Heroic Inspiration)", clears the flag, and
the tray draws the new face. 2024: a human regains it after a long rest — a
`grantsInspirationOnRest` flag on species data, set for the SRD human by key.
Only one at a time; granting to a holder is refused with "already inspired —
pass it on?" which hands it to another player (2024 lets you give it away).

### UI

- **The ribbon** carries the world date and time for everyone; staff get the
  advance menu. The Chronicle shows both dates per sitting; canon and journal
  editors get an optional "when" that defaults to now.
- **Manage page**: the calendar editor — month names and lengths, weekday
  names, hours, epoch, moons; presets for Gregorian-like, Harptos-like
  (10-day weeks, 30-day months, five festival days as zero-length months), and
  "custom".
- **Provisions** card; **Rest** sheet; the **level-up** line; the inspiration
  glyph on PlayCard and the tray.

## Verification

- Pure: `advance` across month, year and a zero-length festival month;
  `daysBetween`; `levelForXp` at every threshold; the malnutrition counter for
  CON mod −1 and +3.
- Running app: `advanceTime` by 3 days with `survival.food` on and no rations →
  three history lines and exhaustion +2 on a CON 10 hero (first day free, then
  one per day); call a short rest, answer as one player with 2 hit dice, confirm
  as staff → the sheet's `hitDiceSpent` moved by exactly 2 and `world_time`
  advanced 60 minutes.
- Browser: the ribbon date, the rest sheet on a phone, both palettes.

## Out of scope

Weather, travel pace and navigation rolls (a natural extension of the day
tick), magic-item dawn recharges (hook exists: the day tick).
