# Handoff — the last breath

Branch: `feat/campaign-longevity` (continuing from
[the-long-campaign](../the-long-campaign/README.md), which instanced heroes and is what
makes a death belong to one table rather than to a hero everywhere).

Three things, and they are one thing: **what happens when a character runs out of hit
points**, who is allowed to watch it happen, and how a table keeps time while it does.

Every "today" below was read out of the code at `65ba4d5` and is kept in the present
tense as the record of what was found. **All three phases are now built** —
[phases.md](phases.md) carries the box-by-box state, and what each run proved is at the
foot of this file.

---

## What exists

More than it looks, and none of it does the job.

| Piece                                             | State                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `combat.deathSaveSuccesses` / `deathSaveFailures` | On the sheet, 0–3, clamped                                                             |
| The pips in `PlayCard`                            | Three green, three red, **clicked by hand**                                            |
| `campaign_rolls.visibility: 'table' \| 'dm'`      | Built, filtered at `session.ts:169`, and a player cannot set `'dm'` (`session.ts:628`) |
| `campaign_clocks`                                 | Segmented progress clocks, `'dm' \| 'shared'` — a precedent, not a countdown           |
| `HourglassScene`                                  | Drawn already, in `ui/scenes.tsx`                                                      |
| `removeMember`                                    | Staff-only, deletes the whole membership row                                           |

So the table can already keep a secret roll, and the sheet can already hold three
failures. What is missing is that **nothing rolls a death save and nothing knows the
rules**, a DM cannot take a character off a table without removing its player, and a
countdown is not a thing this app has.

---

## The rules being implemented

2024 death saving throws. Two of these are corroborated by SRD rows that ship in this
repo, which is worth saying because the rest is being written from the rulebook and the
next reader deserves to know which is which:

- **10 or higher succeeds, 9 or lower fails**, with no modifiers added.
  `srd-2024_periapt-of-wound-closure` turns "a roll of 9 or lower into a 10, turning a
  failed save into a successful one", which fixes the threshold exactly.
- **Advantage applies.** `srd-2024_beacon-of-hope` grants "Advantage on Wisdom saving
  throws and Death Saving Throws", so the roll cannot be a bare d20 with no way to say
  so.
- A **natural 20 restores 1 hit point** — the character is conscious immediately.
- A **natural 1 counts as two failures.**
- **Three successes stabilises**; the tracks then reset and no more saves are rolled.
- **Three failures kills.**
- **Damage taken at 0 hit points is a failure**, or two from a critical hit.
- **Damage whose excess over the character's remaining hit points meets or beats their
  hit point maximum kills outright**, with no saves at all.
- Any healing at all ends the dying: conscious, at the healed amount.
- Death is not permanent. Revivify exists, and the model must let a character come back
  without being rebuilt.

The SRD subset in `reference_data` carries classes, spells, items and monsters — not the
general combat chapter — so there is no local row stating the massive-damage rule. It is
implemented from the rulebook and flagged here rather than presented as sourced.

---

## The model decisions

### 1. Dying is derived; stable is stored

`dead` is `deathSaveFailures >= 3`. `dying` is 0 hit points and not dead and not stable.
None of that needs a column, and a derived state cannot drift from the tracks a DM is
looking at.

**Stable is the exception and has to be stored**, because stabilising resets the tracks:
a stabilised character is at 0 hit points with zero successes and zero failures, which
is character-for-character identical to one who just went down. `combat.stable` is the
only thing that can tell those two apart.

Instant death writes `deathSaveFailures = 3` rather than inventing a second way to be
dead. One rule for reading a corpse.

### 2. A death save is rolled on the server, or it is not a record

The dice are rolled in `play.ts` and written to `campaign_rolls`, exactly as
`spendHitDice` already does. The comment there says it: _a total the browser produced is
a claim about a roll, not a record of one._ That matters more here than anywhere else in
the app, because this is the roll players are most tempted to fudge and the one a table
most needs to trust.

The secret half falls out of that for free. `visibility: 'dm'` already exists, players
are already forbidden from setting it, and the log already filters. A hidden death save
is a normal roll with a flag — not a second code path.

**Amended by the-three-tables' second pass.** The record was right and the picture was
not: the control rolled a second d20 in the browser for the tray, so the log could say
7 while the player watched a 19 land. `rollDeathSave` now hands the faces back beside
the state and the tray draws those. In the same pass, `applyHp` on the tracker — which
wrote the initiative row and not the sheet, so a character the DM took to 0 never
began dying — now goes through `applyPlayPatch` for a seated character. Both in
`docs/handoff/the-three-tables/phases.md`.

### 3. A seat is the DM's to give and to take

Once a character is seated, the player cannot unseat or swap them. That is the
difference between a character sheet and a character _in a campaign_: leaving the table
is not a thing you do quietly between sessions.

The DM gets two separate verbs, because they mean different things:

- **Dismiss the player** — `removeMember`, which exists. The person leaves.
- **Unlink the character** — new. The person stays and brings someone else. This is what
  happens when a hero dies, and it is the common case, so it must not be reachable only
  by removing somebody first.

An unlinked instance is **kept**, not deleted. It is the record of a character who
played and died there, and the chronicle points at it.

### 4. A countdown is a piece of table furniture, not a death feature

The brief arrived attached to death — a minute to revivify — and the temptation is to
build "the revivify timer". That would be the wrong shape. A DM wants a clock for the
ritual, the collapsing bridge, the guard's patrol, and the held breath before a save.

So: a general countdown that **defaults** to one minute and a death-flavoured label when
raised from a death, and is otherwise a blank timer with whatever label the DM types.
`campaign_clocks` is the precedent for the visibility model and is deliberately _not_
extended: a progress clock fills when the fiction says so, and a countdown fills because
time passed. Sharing a table would mean one of them lying about what its segments mean.

---

## What has been verified

The rules were checked apart from the app, and the behaviour against a production build
with real sessions.

- **All 25 rules, against `dying.ts` directly.** The threshold either side of 10;
  natural 20 clearing both tracks and giving a hit point; natural 1 as two failures, and
  as a kill from one failure; three of a kind either way; successes that are not
  consecutive; advantage and disadvantage picking the right face; a hit at 0 as one
  failure and a crit as two; a hit un-stabilising; damage while conscious costing
  nothing; massive damage at exactly the maximum killing and one short of it not; and
  all four readings of the state.
- **A full dying sequence through real server actions.** Down to 0, then success,
  failure, failure, natural 20 — back up at 1 hit point with both tracks cleared — and
  the next roll refused because they were no longer dying.
- **Rolling while conscious is refused**, and the sheet is untouched.
- **Massive damage kills outright**: 28 maximum, at 0, taking 28 wrote three failures.
- **Healing a dead character brings them back** with both tracks and `stable` cleared,
  which is what stands in for revivify while no spell engine exists.
- **A secret save is genuinely secret.** A co-GM's roll stored `dm`; the player's live
  state carried six rolls where the DM's carried seven. A player asking to hide their
  own is refused, and told who to ask.
- **The seat holds.** A player's unseat and swap were both refused with the seat
  untouched; the co-GM's retire emptied the chair and left the instance row standing;
  the player could then seat somebody new, and re-seating returned the copy that had
  already played there rather than minting another.
- **The hourglass runs.** A shared minute counted 0:48 → 0:39 → 0:32 with the sand
  visibly draining, and at zero turned to "Time" in danger and stayed there. A secret
  ten-minute timer beside it never appeared in the player's view at all.

## Still to verify

- **A death save rolled from the player's own play surface, with no table.**
  `rollDeathSave` takes a nullable campaign and skips the log when there is none, so it
  should work — but "should" is what this file exists to replace.
- **Two viewers watching one hourglass.** The countdown is computed from an instant so
  clock skew is the only thing that can separate them, and that has not been measured
  against a second machine.
