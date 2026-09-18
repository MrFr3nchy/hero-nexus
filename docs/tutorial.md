# The first table — a guided tour

A spec for an in-app tutorial. It was written by setting up a campaign from nothing in
the running app — a table, two seated players, a two-floor board, a planned fight,
and the fight dealt out on the sand table — and writing down every place a first-timer
would stall. Nothing built for it was torn down; it is all still there to look at (see
_The showcase_ below).

The tutorial covers both chairs. A **DM** has to learn the campaign record, the
workshop, the encounter planner and the screen. A **player** has to learn far less —
join, seat a hero, find the screen, move their own token — and the tour should get out
of their way fast.

---

## The shape of it

**Video-gamey, and optional.** The tour is a guide standing beside the reader, not a
manual in front of them. Its rules:

1. **One thing is lit.** Every step dims the whole window behind a soft dark scrim and
   cuts a spotlight around exactly one control — the thing to click. Nothing else is
   clickable while the spotlight is up. The scrim is `--bg` at ~70% with the grain
   overlay still showing; the spotlight is a rounded cut-out with a 1px `--gold`
   edge and the dark-mode heading glow. It is a window-level moment like the dice
   tray, so it does not count against the page's one toy (design rule 4) — but it
   moves once, on arrival, and then holds still.
2. **The guide speaks in the margin voice.** The step's caption is a small card pinned
   to the spotlight (above, below, left or right — whichever fits) with a `Glyph`
   mark, a straight one-line title (load-bearing, so not the hand face) and one or two
   hand-lettered lines of _why_ (`Marginalia`, never load-bearing). Never a paragraph.
3. **The reader does the thing.** A step completes when the lit control is actually
   used — the campaign is created, the room is dragged, the token is moved — not when
   "Next" is pressed. "Next" exists only for read-only steps. There is always a
   **Skip this** and a **Stop the tour** on the card, and Esc stops it.
4. **It never blocks real work.** The tour only starts on an empty slate (a new
   account, a campaign with no players, a board with no rooms). If the reader has
   already done the thing, the chapter is marked done and skipped. Progress is saved
   per user so a stopped tour resumes where it left off.
5. **Chapters, not one long march.** Each chapter is a few minutes and ends on a real
   artifact — a campaign, a seated party, a board with a room on it, a fight on the
   table. Finishing a chapter gets a small flourish: the fleuron draws in under the
   chapter's name and a hand-lettered line ("the table is set"). No confetti, no
   emoji, nothing that pulses (rules 4, 8).
6. **It can be re-run.** Account page: _Show me around again_, per chapter. The `?`
   button the screen already has gains a _Take the tour_ entry.

**Mechanics (a sketch, not a design).** A `Tour` provider at the root; chapters are
arrays of steps `{ route, anchor, title, aside, glyph, completeWhen }`. Anchors are
`data-tour="…"` attributes on the real controls (the tour must never reach for a
control by its text). `completeWhen` is either a DOM event on the anchor or a
predicate over live state (the campaign list has one entry; the board has one room).
Progress in a small `user_tour_progress` table (`user_id, chapter, step, done_at`), not
`localStorage`, because a DM prepares on a laptop and runs the table on another
machine. Reduced motion: the spotlight appears instead of sliding; the fleuron does
not draw.

---

## The showcase

Everything below exists in the local database and is safe to open, prod and show
off. Signed in as `verify-gm@example.com` (the DM):

- **Campaign:** _The Drowned Reach_ — `/campaigns/5096dbc3-b7a0-41b3-a34b-de54858f2eb1`.
  Enforcing, flanking on, potions a bonus action, house rules and table notes written.
- **Party:** _Gon of the Reach_ (verify-player) and _Rurik Saltbeard_ (verify-outsider),
  invited by email, accepted, seated.
- **Board:** _The Sunken Chapel of Saltmere_, 32 × 24 — two floors. Ground floor: the
  Nave (stone, a raised altar dais with a banquet table and two braziers, a flooded
  south end sunk 10 ft, collapsed-roof rubble), the Vestry (hearth, a locked
  strongbox), a sexton's cottage, a pond, oaks along the west, pines to the north, a
  dirt path to the chapel door, a shingle beach with boulders and the sea along the
  east. The Crypt at −10 ft, dark: the Ossuary (two torches, a locked reliquary with a
  _When it is used_ effect), the Drowned Bell (a flooded chamber with a lit brazier),
  a spiral stair linking the two floors. Shown to the party; fog revealed on the
  approach only.
- **Record:** thread _Why the bells of Saltmere still ring_ (told to the party, one
  objective), clock _The tide takes the crypt_ (2 of 6), canon entry _Sexton Ambrose
  Quill_ (DM-only notes and a party-facing line), sitting 1 _The bells of Saltmere_.
- **Fight:** _What waits in the crypt_ — 2 ghouls placed in the Ossuary, 4 skeletons
  placed in the Drowned Bell, note saved, dealt out. The table is sitting and at the
  sand table; the party stands at the chapel's south door on the ground floor, the
  foes wait below. It was left running on purpose — open _Behind the screen_ and it is
  all there.

---

## The tour, chapter by chapter

Each step: **where** it happens → what is **lit** → what the **guide says** (title, then
the hand-lettered aside) → what **completes** it. Notes in _italics_ are things found
on the walk that the tour has to route around, or that we should fix first (collected
again at the end).

### Chapter 0 — Welcome (both chairs, ~1 minute)

Starts on the first visit to `/dashboard` for a brand-new account.

1. **Dashboard** → the greeting → _The table is set._ "this is your table. every hero,
   every campaign and every ruling you make ends up here." → Next.
2. → the d20 in the header → _Roll one._ "the tray is the app's loudest thing. every
   die the app throws lands in it." → completes when the tray opens.
3. → the spine's _Campaigns_ row → _Two ways to sit down._ "run a table, or join one
   with a code. the tour splits here." → click. Then a two-button card: **I'm the DM**
   (Chapter 1) / **I'm a player** (Chapter 7).

### Chapter 1 — Start a campaign (DM, ~3 minutes)

1. **/campaigns** → _New campaign_ → _Your table starts with a name._ → click.
2. **/campaigns/create** → the name field → _Name it and go._ "everything under the
   name starts at the book. it can all change later from Manage." → completes on a
   non-empty name.
3. → the **At the table → The app** select → _Advise or enforce._ "this is the one
   switch that changes how the app behaves at the table. advising, it tells you the
   rule and does nothing. enforcing, it refuses — and you can always overrule it." →
   Next. _The most consequential setting on the form sits mid-page in a run of
   twenty selects; the tour is the only reason a first-timer will notice it._
4. → the **Homebrew** card → _Who forges, who rules._ "players can forge anything.
   nothing reaches your table until you say so." → Next.
5. → _Create campaign_ → completes on the redirect. Flourish: "the table is set."

_Snag: the campaign page opens on the Chronicle tab. A new DM with no players wants
the Party tab first. Chapter 2 opens by lighting that tab._

### Chapter 2 — Seat the party (DM, ~3 minutes; player side in Chapter 7)

1. **Campaign page** → the _Party_ tab → _Your first stop._ → click.
2. → the **Join code** card → _Hand this out._ "anyone with an account and this code
   seats themselves. copy it, paste it into your group chat, done." → completes on
   copy.
3. → the **Invite a player** email field → _Or invite by name._ "they need a Hero
   Nexus account first; the invite lands on their Campaigns page." → Next (typing is
   optional).
4. → the pending-invites list (once one exists) → _Waiting on them._ "an invite sits
   here until they accept or you revoke it." → Next.
5. → the members list, the _Make Co-DM_ control on a player row → _A second pair of
   hands._ "a co-DM sees what you see. give it to whoever runs the fights when you're
   tired." → Next.
6. Ends when the first player is seated (predicate on the member list). The guide
   waits quietly — a small pinned note "waiting for your first player…" — and the
   chapter completes itself when the roster changes. Flourish: "the chairs are filling."

_Snag: a hero already seated at another table cannot be seated here — the app says
"take the original to this one instead". Players do not know what an original is.
Chapter 7 explains it before they hit it._

### Chapter 3 — The record (DM, ~4 minutes)

Short, because the record is self-explaining once the reader knows the tabs exist.

1. → the tab strip → _Ten shelves._ "party, threads, sittings, notes, journal, canon,
   downtime, boards, content, homebrew. the search bar above them reads all of it." →
   Next.
2. **Quests** → the _Pin up a thread_ title field → _Pin one up._ "a thread starts as
   yours alone; tell the party when they've heard of it." → completes on **Pin it**.
   _Snag: Enter does not submit this field, nor the clock's, nor the objective's — the
   reader must press the button. Either make Enter submit or have the guide light
   the button as the second half of the step._
3. → the new thread's _Tell the party_ → _Now they know._ → click.
4. → the **Clocks** card → _What happens anyway._ "wind one for the thing that
   advances while the party dawdles. tick it when they do." → completes on **Wind
   it**.
5. **Canon** → _New entry_ → _Who's who._ "DM notes stay yours; 'what the party knows'
   is the line they see. file it on a shelf later." → completes on _Add to the
   archive_.
6. **Chronicle** → _Open the next sitting_ → _Number the evening._ "leave the date
   blank and the table votes on it." → completes on **Open session**.

### Chapter 4 — Lay out a board (DM, ~8 minutes; the long one)

This is the chapter the app most needs. It is a real build, on the reader's own
board, and every tool gets one spotlight. The guide should let the reader make a mess.

1. **Boards tab** → the _Lay it out_ form → _A board is a grid with a name._ "32 × 24
   is a big room. start with grass; you'll paint the rest." → completes on **Lay it
   out**.
2. → the board's _Open the workshop_ → _To the bench._ → click.
3. **Workshop** → the tool rail → _Ten tools, top to bottom._ "select, rooms, walls,
   floor, height — then the garden, the furniture, the things the party can touch, the
   lights, and what they can see." → Next.
4. → **Rooms** → the board → _Drag a box._ "floor, walls and a door in one go. tap a
   quick size to stamp one; tap it again to drag your own." → completes on the first
   room. Then → the _Call it_ prompt at the bottom → _Name it._ "rooms with names show
   up on the screen's footer and in the fight planner." → completes on Enter. _Snag:
   the naming prompt appears at the bottom of the stage, far from where the drag
   ended; lit, it is fine — unlit, it is missed._
5. → **Floor** → the material swatches → _Eight floors._ "brush paints, box fills a
   rectangle, fill takes the whole room. water and lava slow the party down; rubble is
   difficult terrain." → completes on a paint.
6. → **Height** → _Up and down._ "raise a dais, sink a pit. the number on the tile is
   feet from this floor." → completes on a raise or lower.
7. → **Scatter** → _Grow a garden._ "drag through the grass. oaks block movement;
   bushes don't. 'stay off floors and walls' keeps trees out of your rooms." →
   completes on a scatter.
8. → **Stamps** → the catalogue → _Furniture, stairs, whole buildings._ "pick one; it
   follows the cursor. R turns it, F flips it." → completes when a stamp lands.
   _Snag: the first tap after picking a stamp only shows the ghost; the second tap
   places it (reproduced twice, banquet table and spiral stair). Fix before the tour
   ships, or the step's completion will confuse people._
9. → **Add a floor** (right rail) → _Stack the house._ "above or below, how far,
   how dark, and what to start it with — the shell of this floor, a full copy, or
   nothing." → completes on the dialog's **Add the floor**.
10. → **Stamps → Spiral stair** → _Join the floors._ "a stair placed on one floor
    links to the same tile on the floor above or below. the footer on the screen
    lists every way off a floor." → completes when the UP/DOWN label appears.
11. → **Things** → _Something to act on._ "a door, a chest, a lever. give it a state
    and a lock DC; the party rolls against it at the table." → completes on placing
    one. Then → the selected thing's _When it is used…_ → _Make it do something._
    "presets for a spike pit, a portcullis lever, a collapsing floor — or say a line,
    deal damage, change the floor. aim it by grabbing tiles with Select." → Next.
    _Snag: placing a thing switches the tool to Select (so its properties show).
    Reasonable, but the second tap then starts a selection box. The guide should say
    'pick Things again for another'._
12. → **Light** → _Torches and braziers._ "a dark floor with no light is a fight in
    the dark. the hearth stamp brings its own." → completes on a light.
13. → **Fog** → _What they can see._ "fog is per floor. reveal the approach, hide the
    rest; 'party sees it: when a hero is on it' in the rail does the rest at the
    table." → completes on a reveal.
14. → **Stand it up** → _Look at it._ "cutaway, stacked, pulled apart. drag to walk
    around it; this is what the party's screen shows." → completes on the 3D view.
15. → **Show the party** → _Let them see it._ → click. → **Put it on the table** →
    _And it's the board for the next fight._ → click. Flourish: "the house is built."

### Chapter 5 — Plan a fight (DM, ~3 minutes)

1. **Chronicle tab**, scrolled to _Plan a fight_ → the name field → _Build it before
   the night._ "a fight built here deals out in one press, hit points and initiative
   rolled." → completes on **Start it**.
2. → _Add a monster_ → _From the bestiary._ "type a name; CR and hit points show
   beside it. how many, then Add." → completes on the first line.
3. → the line's **Place** → _Stand them where they wait._ "pick the board and the
   floor, tap a tile per body. unplaced ones deal in from the edge." → completes on
   all placed. _The mini-map popover is small; the tour should enlarge nothing but
   should say 'the crypt is the second floor in the list'._
4. → the note field → _A line for yourself._ → then **Save the note** → completes on
   save. _Snag: the note has its own Save button under the textarea and it is easy to
   type a note and walk away without pressing it._
5. → **Call for initiative** on the plan → _Deal it._ "this creates the fight, puts
   its board on the table and stands every body at its spot." → completes on the
   banner. _Snag: the banner reads "They are up on the Session tab" — there is no
   Session tab any more; it should say "on the screen"._

### Chapter 6 — Behind the screen (DM, ~5 minutes)

1. **Campaign page** → _Behind the screen_ → _The other page._ "everything you run a
   session from. the campaign page is the record; this is the table." → click.
2. **Screen** → the mode bar's three states → _Desk, table, sand table._ "the desk is
   between sittings. take your seats and it becomes the table. a fight makes it the
   sand table. the boxes rearrange themselves for each." → Next.
3. → **Take your seats** → _Call the evening._ "from now on every player's sitting
   bar says the table is sitting, wherever they are in the app." → click.
4. → the **Initiative** box, _Add the party_ → _Bring them in._ → click. → the board's
   **Deal them in** → _Stand them up._ "the party lands at the board's edge. drag
   them to the door." → completes when a party token moves.
   _Gotcha the tour must state plainly: the mode bar's own **Call for initiative**
   starts an empty fight. A planned fight is dealt from the plan (Chapter 5) — do
   that first, then add the party here._
5. → a party token → drag beyond 30 ft → the red banner → _The fence._ "enforcing,
   the app refuses a move past their speed. 'do it anyway' is always yours." →
   completes on the banner. _Dragging empty ground orbits the camera; a first-timer
   trying to move a token will spin the room instead. Say so._
6. → a foe on the crypt floor → the **Stat block** box → _Tap a foe._ "its block,
   actions and all, only you." → completes on selection.
7. → the initiative card's _Next turn_ → _Around the table._ "N and P do this from
   the keyboard. ? lists the rest." → completes on a turn.
8. → the **Dice** box, _Behind the screen_ toggle → _Roll in secret._ → Next.
9. → **Customize** → _Your own screen._ "add or remove boxes, move them, keep the
   arrangement per state. 'arrange as' has presets: combat forward, roleplay
   forward, around a real map." → Next. Flourish: "the screen is yours."

### Chapter 7 — Take your seat (player, ~3 minutes)

1. **/campaigns** → the pending invite / _Join_ → _Two doors._ "accept an invite here,
   or Join with the code your DM gave you." → completes on membership.
2. **Campaign page**, Party tab → _Make character_ / the seat control → _Bring a
   hero._ "an original hero can sit at one table. sitting them here makes a table
   copy — what happens at this table stays on the copy; the original stays on your
   heroes page for the next one." → completes on a seat. _This is the single most
   confusing rule for players and nothing in the UI explains it before the refusal._
3. → the **sitting bar** (once the DM has taken seats) → _Take your seat._ "this
   strip follows you round the app while the table is sitting. one press puts you in
   the room." → click.
4. **Screen (player)** → **Your hero** box → _Your sheet, at the table._ "gear,
   prepared spells, conditions, without leaving." → Next.
5. → your own token → _Move yourself._ "tap a lit tile within your speed. the DM sees
   it land." → completes on a move.
6. → **The asking** → _When the DM asks._ "a check the DM puts to you shows here and
   in the corner; roll it, or type what your real dice said." → Next.
7. → **Whispers** → _Under the table._ → Next. Flourish: "you're in."

---

## Snags found on the walk

Things a first-timer hits that the tour either routes around or that should be fixed
before it ships. Ordered by how much they would hurt inside the tour.

1. **Stamps need two taps.** The first tap after choosing a stamp only shows the
   ghost; the second places it. Reproduced with the banquet table and the spiral
   stair. A tour step that says "tap to place" will complete on the second tap and
   look broken.
2. **Two "Call for initiative" buttons do different things.** The plan's deals the
   plan; the mode bar's starts an empty fight. Both are named identically. Rename the
   mode bar's to _Start a fight_ (or make it offer the planned fights).
3. **Enter does not submit** the thread, objective, clock or sitting fields on the
   campaign page; the button must be pressed.
4. **"They are up on the Session tab"** after dealing a plan — stale wording, the
   Session tab is gone.
5. **The fight note's Save button** is separate and below the note; a note typed and
   not saved is lost on navigation.
6. **Placing a thing switches to Select**, so the second tap draws a selection box.
   Intentional, but unannounced.
7. **The party deals in at (0,0)** when unplaced — the far corner, behind the trees.
   Deal them at the board's nearest door, or at the tile the DM last tapped.
8. **Originals vs table copies** are never explained to a player until the seat is
   refused.
9. **The room-name prompt** sits at the bottom of the stage, away from the drag.
10. **Dragging empty ground orbits the camera** on the sand table; there is no hint
    that a token drag and a camera drag are different.
11. **The creation form's most important switch** (advise / enforce) is mid-form and
    looks like every other select.

## Open questions

- Should the DM tour build on a throwaway "tutorial" campaign the app makes and
  deletes, or on the reader's real first campaign? The walk above assumes the real
  one — the artifact at the end is the point — but Chapter 4 makes a mess of a board,
  and a DM may not want their first real board to be the practice one. A middle path:
  Chapter 4 offers _practice on a scratch board_ that is taken down at the end.
- Does the player tour need the DM to be sitting? Steps 3–7 do. The tour can wait
  with the same quiet "waiting for the table…" note Chapter 2 uses, or the app can
  offer a solo _walk the board_ where the player's own token is the only one.
- Chapter 4 is eight minutes. It could be two chapters (_a room_ and _the rest of the
  house_) with the first ending on _Show the party_.
