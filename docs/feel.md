# The DM's hands — where setting up and running a table still drag

A reflection, not a spec. It was written after building a campaign from nothing —
players, a two-floor board, a planned fight, a session run on the screen — and after
reading most of the code that does it. The pieces are good. What drags is the seams
between them: where the DM has to decide _where_ to do a thing before doing it, where
one idea has to be typed into three boxes, and where two presses should be one.

Four sections: the shape of the problem, then setting up, between fights, and in a
fight. A ranked list at the end, sized.

---

## The shape of it

**Two homes for one table.** The campaign page (`/campaigns/[id]`) is the record: ten
tabs — Party, Quests, Chronicle, Notes, Journal, Canon, Downtime, Boards, Content,
Homebrew. The screen (`/campaigns/[id]/screen`) is the table: boxes arranged for the
desk, the table, or the sand table. Most boxes on the screen _are_ the tabs —
Threads is Quests, Sittings is Chronicle, Notebook is Notes, Canon is Canon, The haul
is the purse and the loot. The DM learns two layouts of the same things and is never
sure which one to open. The code says the screen is "the one place a fight starts
from now", and the campaign page says a plan's fight "is on the screen" — the app
itself has to keep telling the DM which of its two doors to use.

**Everything is a card with its own form.** Pin up a thread. Wind a clock. Open a
sitting. New entry. Lay it out. Plan a fight. Each is a `SectionCard` with an input, a
button, and its own way of saving. Ten of them in a row is what "clunky" feels like:
not that any one is hard, but that the DM's idea — _the miller's daughter is missing,
the sexton knows why, the crypt floods on the sixth night_ — has to be cut into a
thread, a canon entry and a clock and typed into three cards on two tabs.

**Prep and play are split where DMs don't split them.** The Chronicle tab holds the
sittings, the awards _and_ the fight planner, because a fight is "prep for a
sitting". But the planner places bodies on a board, which is the workshop's business,
and the fight is dealt on the screen. A DM planning tonight touches three surfaces
for one fight.

**Naming.** Sittings / Chronicle / Session. Threads / Quests. Boards / the sand table
/ battle map / the board. The table (a state) / The table (a box) / Take your seats.
The voice is lovely and the synonyms are the cost of it: a menu reads well and a
newcomer cannot find "the fight thing" because it is called four things.

---

## Setting up

### 1. Open on what's next, not on the Chronicle

A new campaign opens on the Chronicle tab: "The chronicle is blank." The DM with no
players wants the Party tab; the DM with players and no board wants Boards. The
campaign page should open on a **desk** — not another tab, the thing above the tabs —
that says where the table stands and what the next move is:

> _3 at the table · no board on the table · 1 fight planned for tonight ·
> next sitting Thursday_ — **Put a board on the table →**

One line of `Ledger`, one primary action, the tabs below. The pulse the page already
fetches (`getCampaignPulse`) has most of it. This is the single change that would
make the record feel like it knows the DM.

### 2. One capture box

The search bar over the tabs already reads the whole record. Let it write, too:

> `+ thread The miller's daughter` · `+ npc Sexton Ambrose Quill, keeper of the
chapel` · `+ clock The tide takes the crypt, 6` · `+ sitting The bells of
Saltmere, thu`

One box on the desk, one on the screen's Notebook, same grammar. Every "Pin up",
"Wind it", "New entry" card stays for the long form, but the DM who is _thinking_
gets to type the thought and keep going. Half of what makes setup feel slow is
finding the right card; a capture box removes the finding.

### 3. Seating is three cards for one act

Invite by email, hand out the join code, seat a hero — three cards on the Party tab,
and the seat control is a select in each member's row. Fold them: one **Seat the
party** card with the code big and copyable, the invite field under it, and the
pending invites and empty chairs listed together ("Verify Player — invited, not yet
sitting"). The DM should be able to see at a glance who is coming, who has sat, and
who has no hero.

### 4. The board's three switches

A board has `visibility` (shown to the party or not), `isActive` (on the table) and
a binding to a fight. The workshop shows them as _Show the party / Take it back_ and
_Put it on the table / Take it off_, and the Boards tab shows them again. A board on
the table that the party cannot see is a state nobody wants, and a hidden board on
the table is what a first-timer gets by pressing one button and not the other. One
control — **On the table** — should imply shown; "shown but not on the table" is the
odd case and can stay a second, quieter switch.

### 5. The fight planner is filed under the wrong tab

It sits at the bottom of Chronicle, under the awards. A DM looking for it looks on
Boards (it's about a board) or on the screen (it's about a fight). It should live on
Boards — _Boards and fights_ — beside the boards it deals onto, and the desk's
"what's next" should link straight to a plan with bodies unplaced.

Placing bodies through a per-line mini-map popover works, but it is a 200px
thumbnail of a 32-tile board. The workshop already draws the board at full size: a
**Foes** tool there (pick a plan, tap tiles) would put placement where the DM can see
the room, and the planner would just show "6 of 6 placed" with a link to the
workshop.

### 6. Three homes for house rules

A table's rules live in the free-text _House rules_ (settings), the enforced table
rules registry (_At the table_), and the _House rules_ content type in the
compendium. The campaign page's "This table plays by" card reads two of the three.
The rules registry is the real one; the free text should be its footnote (on the same
card, under the switches), and the compendium's house rules should show up in the
same card when adopted, so the DM sees one list.

### 7. Forms that save differently

The creation form saves on the button. Manage saves on the button. The fight note
now saves on blur. Availability saves on click. The notebook saves… on a debounce.
The workshop saves on a debounce with a status word. Pick one rule for prose fields
— _autosave with a status word_ — and one for forms — _the button_ — and say which
in the design language, so the DM never wonders whether typing counted.

---

## Between fights (the desk and the table)

### 8. The desk → table transition loses your place

"Take your seats" rearranges every box: the desk layout goes, the table layout comes.
The DM who had the Notebook open with tonight's prep highlighted now has the Notebook
in a different column, scrolled to the top. The three states should share a **pinned
column** — the Notebook at least, probably the Threads — that does not move when the
state changes. The arrangement can change around it.

### 9. "Tell them" is four different verbs

A thread is _Told to the party_. A canon entry is _Revealed_. A notebook line is
_Handed over_. A handout is _Pushed_. A hidden foe is _Shown_. They are one act — the
DM lets the table see a thing — and one word would do (**Tell them**, with the
"what they know" panel as the record of everything told). One word means one
keyboard shortcut, one glyph, one place in the feed.

### 10. The asking and the dice are far apart

"The asking" (ask for a check) and "Dice" (roll one) are separate boxes in separate
columns at the table. A DM asking for a Perception check wants to see the answers
land next to where they roll for the sexton's Deception. One box — **Rolls** — with
the ask at the top and the log below, rolls from the party and the DM interleaved,
would read as a table rather than two ledgers.

### 11. The Party box is a wall of stat cards

Two heroes fill the box; six would scroll for a screen. Between fights a DM wants a
_roster_: name, HP as a bar, conditions, passive Perception, and a "sheet" link —
one row each. The full card can open on tap. The same row is what the initiative
box's combatant card is trying to be in a fight; they should be one component with
two densities.

### 12. Reveal from the canon, not to the canon

The Canon tab is the world; the screen's "What they know" is what the party has been
told. Entries are DM-only until revealed, and reveal is on the entry. That is right,
but the DM at the table is looking at the Notebook, not the Canon, when the party
meets the sexton. The Notebook's "hand over a line" should be able to hand over _an
entry_ — type `@Sexton` in a note, and handing that line over reveals him.

---

## In a fight (the sand table)

### 13. Two presses that should be one

**Add the party** (initiative box) then **Deal them in** (board). A fight with no
party in it is not a fight; dealing in should add the party if it is absent. The
same for a planned fight: _Start a fight → What waits in the crypt_ should deal the
party in with the foes, on the approach, and put the DM straight into round one.

### 14. Six foes, six "Show them"

Dealt foes are `dm`-only tokens, and a token is shown to the party by selecting it
and pressing _Show them_ — once per foe. With the fog already doing the hiding (a
player sees only tokens on revealed tiles), most foes could be dealt `shared` and
let the fog hide them until the party's sight reaches them; `dm`-only should be the
exception the planner marks per line ("hidden — the assassin on the balcony"). At
minimum: a **Show all** on the initiative box.

### 15. The order is a scroll of cards

Each combatant in the initiative box is a ~120px card — HP bar, action economy,
conditions, shape, group — and a six-body fight needs the shelf scrolled to see who
is next. `TurnStrip` already exists for the player's banner. The DM's box should be
the same: a compact order (initiative · name · HP · a condition or two) with only the
**current** combatant expanded to the full card. Next turn collapses one and expands
the next, and the whole round fits on one screen.

### 16. Two places to act on the same body

Selecting a token gives a bottom bar (move, afflict, advantage, sight, picture,
floor, hide, remove); the same combatant's card in the shelf has HP, conditions,
shape and the action economy. HP is in the shelf, movement in the bar, conditions in
both. The bottom bar should be the whole of it: select a token and everything about
it is there, the shelf just highlights the row. A DM's eye should not have to cross
the screen for one goblin.

### 17. Damage needs a number field somewhere obvious

The shortcuts (`D`, digits, Enter) are the fast path and they are good. Without
them, dealing damage is: find the card, find the `−`, click, type in a 40px field,
press `+`? `−`? — the affordance is small and the sign is easy to get backwards. A
single **Take / Heal** pair with a number on the selected combatant (the bottom bar
again) and the stat block's attack buttons doing the roll _and_ the damage would
cover most turns without the keyboard.

### 18. The round rolls the clock, the timers do not know

"Something in N rounds" sits in the initiative box with its own Start; the world
clock has its own control in the mode bar; a clock (Quests) ticks by hand. A fight
should advance all three: next turn ticks round-timers, a round moves the world
clock six seconds, and ending the fight offers to tick the quest clocks that were
"what happens anyway". One clock the DM winds, not three.

### 19. After the fight

_End the fight_ keeps the order as a record and stops. The plan already knows the
XP total and the party size; the Chronicle's _Hand it out_ card is a tab away. Ending
a fight should end on a small card: **600 XP, 300 each — hand it out?** with the loot
line under it ("the ghouls carried nothing; the reliquary is still locked") so the
haul gets written down while it is fresh.

### 20. The board's three buttons that are really modes

_Open the workshop_, _Swap board_, _Back to the board / Stand it up_, _Look around_,
_Deal them in_, _Take it back_ sit in a row over the board. Two are navigation, one is
a view, one reveals fog, two change the fight. Group them: view (flat / stood up),
fog (look around), the fight (deal them in), and the shelf (swap, workshop) behind
one _Board_ menu. The row would stop reading as six equal choices.

---

## Ranked

Sized S (an afternoon), M (a day or two), L (a week).

| #   | Change                                                    | Size | Why first                                        |
| --- | --------------------------------------------------------- | ---- | ------------------------------------------------ |
| 1   | The desk line + one primary action on the campaign page   | M    | The page starts knowing the DM instead of asking |
| 13  | Deal them in adds the party; a planned fight is one press | S    | The most-pressed sequence in the app, halved     |
| 14  | Foes dealt shared behind the fog; Show all                | S    | Six presses per fight, gone                      |
| 15  | Compact order with the current combatant expanded         | M    | The shelf stops scrolling mid-round              |
| 2   | The capture box (`+ thread …`)                            | M    | Setup stops being a hunt for the right card      |
| 4   | One "On the table" switch for a board                     | S    | Removes a state nobody wants                     |
| 5   | Planner under Boards; a Foes tool in the workshop         | M    | Placement where the room is visible              |
| 8   | A pinned column across the three states                   | M    | The DM keeps their place                         |
| 9   | One "Tell them"                                           | M    | One verb, one glyph, one shortcut                |
| 16  | The bottom bar is the whole of a selected combatant       | M    | One place per goblin                             |
| 19  | After-the-fight card with XP and the haul                 | S    | Bookkeeping while it is fresh                    |
| 3   | One "Seat the party" card                                 | S    | Who is coming, who sat, who has no hero          |
| 11  | Roster rows with two densities                            | M    | Same component at the table and in the order     |
| 10  | Rolls: the asking and the dice as one box                 | S    | Answers land where the DM rolls                  |
| 18  | One clock: round timers, world clock, quest clocks        | L    | The fight advances time by itself                |
| 6   | House rules on one card                                   | S    | The DM sees one list                             |
| 12  | `@entry` in a note hands the entry over                   | M    | Reveal from where the DM is looking              |
| 7   | One save rule for prose, one for forms                    | S    | The DM stops wondering whether typing counted    |
| 17  | Take / Heal with a number on the selected body            | S    | Most turns without the keyboard                  |
| 20  | Group the board's six buttons                             | S    | Six equal choices become three kinds             |

The first five are the ones that would change how the app _feels_ to run; the rest
are the seams they leave visible.
