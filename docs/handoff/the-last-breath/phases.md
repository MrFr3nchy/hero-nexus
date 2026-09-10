# The last breath — phases

Build order. Each phase leaves the app usable. `[x]` = landed on `feat/the-last-breath`.

**All three phases are built.**

The model is in [README.md](README.md). Read it first — phases 1 and 3 are only correct
in the light of decisions recorded there, particularly why `stable` is stored when
nothing else about dying is.

**Every phase that touches the database edits `src/db/schema.ts` and a new
`src/db/migrations/*.sql` in the same change.** There is no drizzle-kit generate step.

---

## Phase 1 — Death saves that know the rules

- [x] `combat.stable` on the sheet, defaulted false. The one stored bit of dying — see
      model decision 1 for why the other states are derived and this one cannot be.
- [x] `rollDeathSave(characterId, campaignId, { mode, secret })` in `play.ts`. Rolls on
      the server, applies every rule in the README, writes the sheet and the roll log in
      one call. `mode` is straight / advantage / disadvantage, because Beacon of Hope
      exists and a bare d20 cannot express it.
- [x] Natural 20 restores 1 hit point and clears both tracks. Natural 1 is two failures.
      Third success sets `stable` and clears both tracks. Third failure is death.
- [x] `secret` is refused for anybody who is not staff — the same rule
      `session.ts:628` already applies to ordinary rolls, and it should be the same
      check rather than a second one that can drift.
- [x] Damage at 0 hit points adds a failure through `applyPlayPatch`, two on a
      critical. `PlayPatch` gains a `critical` flag; without it the caller cannot say
      which kind of hit it was and the sheet quietly under-counts.
- [x] Instant death: damage whose excess over remaining hit points meets or beats the
      hit point maximum sets three failures directly. One way to read a corpse.
- [x] Healing above 0 clears both tracks and `stable`. This is already half true —
      `applyPlayPatch` clears the tracks when hit points go positive — and needs to
      clear `stable` too.
- [x] The pips stay clickable. A DM correcting a miscount by hand is not a bug, and a
      table that rolled on real dice needs somewhere to put the result.
- [x] A death-save control on the play surface and on `PlayCard`, appearing only at 0
      hit points, with the staff-only "roll it in secret" beside it.
- [x] Rolled saves land in the dice tray for whoever rolled, and in the shared log for
      the table — unless secret, in which case the tray is the roller's alone. The tray
      **draws what the server rolled** rather than rolling again: two rolls for one save
      is how a log and a screen start disagreeing.

## Phase 2 — A seat the DM controls

- [x] `setMemberCharacter` refuses a player who already has a character seated. Leaving
      a table is not something a player does quietly; model decision 3.
- [x] `unlinkMemberCharacter(campaignId, targetUserId)` — staff only. Clears the seat
      and **keeps the instance**, which is the record of who played and how it ended.
- [x] Both verbs in the members panel, worded so they are not mistaken for each other:
      dismissing a person and retiring a character are different sentences.
- [x] A dead character's instance is unlinked, never deleted. The chronicle points at
      it, and so does whatever eulogy the table writes.
- [x] The player-facing message when a swap is refused says who to ask, not just "no".

## Phase 3 — The hourglass

- [x] `campaign_timers` + migration: `campaignId`, `label`, `endsAt`, `visibility`
      (`'dm' | 'shared'`), `createdBy`, `createdAt`, and a nullable `stoppedAt` so a
      timer can be ended early without losing that it ran.
- [x] Server actions to start, stop and clear. Staff only to start; anyone at the table
      reads the shared ones.
- [x] Timers ride `LiveState`, which already carries the encounter, the roll log and the
      handouts. A second poller for one number would be a second poller.
- [x] The countdown itself renders client-side from `endsAt`. The server sends an
      instant, never a remaining-seconds number that is stale before it arrives.
- [x] An hourglass, drawn — `HourglassScene` already exists in `ui/scenes.tsx` and this
      is what it was drawn for. Sand falling, still under `prefers-reduced-motion`
      (design rule 7).
- [x] A screen panel, so it can sit on the table screen beside initiative.
- [x] Raising one from a death pre-fills sixty seconds and a label about the window
      closing. Pre-filled, not fixed: it is a general timer that happens to know why it
      was opened.
- [x] Expiry is a state, not an event. Nothing fires; the hourglass says it has run out
      and stays until the DM clears it. A timer that vanishes at zero is a timer nobody
      saw finish.

---

## Deliberately not in this plan

- **Automatic death saves at the start of a turn.** The initiative tracker knows whose
  turn it is and could roll unprompted. It should not: a table stops and looks at the
  player when this roll happens, and taking that away to save a click is taking away the
  moment the feature exists to serve.
- **Revivify as a spell that does something.** Casting is not modelled anywhere in this
  app and death is not the place to start. Healing a dead character above 0 brings them
  back, which is the mechanical truth and needs no spell engine.
- **A death log or memorial page.** The unlinked instance is already the record. A
  surface that collects them is a nice idea and a different piece of work.
