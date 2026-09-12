# 03 — Every roll through the tray, and dice you can hold

Covers from `improvements.txt`: _make sure all rolls show the dice animation_,
_physical dice_, and the `physicalDice` toggle from 01.

Small, self-contained, and every later spec that adds a roll inherits it.

## Today

- `rollForCampaign` (`src/server/session.ts`) rolls on the server, writes one
  `campaign_rolls` row, publishes a `roll` event, and returns the `NotationRoll`
  so the caller can draw the server's faces with `useDiceTray().showNotationRoll`.
- Callers that draw: AttacksPanel, StatBlockPanel, RollPanel, PlayCard (death
  saves), BattleBoard (lock picks). Callers that roll on the server and draw
  nothing: `answerCheck` (ChecksPanel), `rollInitiative` (InitiativeTracker),
  `spendHitDice` (PlayCard), creature HP on deal-in.
- `rollNotation(input)` parses and rolls in one step; `tallyRoll(spec, dice)` on
  the ability-score side already separates rolling from summing.
- The client never sends a modifier or a total, anywhere. Keep that.

## Design

### The rule, written down

> If the server rolled a die and the viewer caused it, the tray draws the
> server's faces. Never a second client roll. Never no animation.

Add the line to `src/@shared/components/dice/DiceTray.tsx`'s header and to
`docs/design-language.md` as a checkable rule.

### Wire the missing four

Each server function already has (or trivially can return) the `NotationRoll`:

| Surface                | Server function           | Change                                                                                             |
| ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| The Asking's answer    | `answerCheck`             | return `{ target, roll }`; ChecksPanel draws it with title `ask`                                   |
| Roll Initiative        | `rollInitiative`          | return the viewer's own roll when they are seated, all rolls for staff; tray shows a stacked group |
| Spend a hit die        | `spendHitDice`            | already returns state; add `roll`                                                                  |
| Creature HP on deal-in | `addCreaturesToEncounter` | return the rolls; staff-only tray, one group per creature                                          |

`showNotationRoll` takes `{ title, hint }`; add a `secret` flag so a
behind-the-screen roll draws the hollow die (below) for staff.

### Physical dice

**Server contract.** Split `rollNotation` into `parseNotation` (exists) +
`tallyNotation(parsed, faces: number[]): NotationRoll` and have `rollNotation`
call it with fresh faces. `rollForCampaign` and every function that rolls off a
sheet (`answerCheck`, `rollDeathSave`, `spendHitDice`, `pickLock`, the attack
functions in 06) accept an optional `faces?: number[]`:

- Length must equal the sum of `term.count` across terms, each face in
  `1..term.sides`, else `BAD_FACES`.
- Advantage/disadvantage: the notation is already `2d20kh1`, so two faces are
  expected. Damage: one face per die. The client asks for exactly that many.
- Modifier and total are still computed on the server from the sheet. The
  browser sends faces — a claim about the die — and nothing else.
- Refused when the table's `physicalDice` is `off`; allowed for staff always.

**Storage.** Migration `0048_physical_rolls.sql`: `ALTER TABLE campaign_rolls ADD
COLUMN physical INTEGER NOT NULL DEFAULT 0`. `RollRow`, the `roll` event and the
`RollEvent.describe` line carry it: "rolled 17 (real dice)".

**UI.** Every roll button gets a long-press / secondary "I rolled it" that opens
a small face-entry strip: one numeric input per die, sized to the notation
(`notationSides` already gives the sides list), submit on the last digit. The
tray draws the faces as a **hollow** die (`DieTone: 'physical'`) so the table
can tell at a glance. When `physicalDice === 'unmarked'` the tone is plain and
the column still records it.

### Behind-the-screen tone

Secret staff rolls draw with the existing `secret` hint; give them a distinct
die tone too, so a DM's screen reads hidden / real / server without reading text.

## Verification

- Pure: `tallyNotation` reproduces `rollNotation` totals for given faces;
  rejects wrong counts, out-of-range faces, `kh1` with one face.
- Running app: POST `answerCheck` with `faces: [20]` as a player on a table with
  `physicalDice: 'off'` → refused; with `'marked'` → row has `physical = 1`,
  modifier equals `skillBonus(sheet)`, total = 20 + modifier; the DM's SSE
  `roll` event says so.
- Browser: each of the four surfaces animates; the hollow die in both palettes.

## Out of scope

Who may apply the result of a roll — that is 06 and 07.
