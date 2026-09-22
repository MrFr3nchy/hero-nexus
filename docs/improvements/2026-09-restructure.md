# The restructure — what changed, and why

Answering `Improvements.txt` and `feel.md`. Both said the same thing from two
angles: the app had grown two of everything and named them four ways, so a DM
had to decide _where_ to do a thing before doing it. This is what was done
about it.

---

## The shape

**The campaign page manages the campaign. The session screen runs a session.**

The screen had three states — a desk, a table, a sand table — and the desk was
a second campaign record: the notebook, the chronicle, the canon, downtime and
the encounter planner, all reachable in two places that could disagree. That
state is gone. The screen has two: **at the table** and **in a fight**. With
nobody sitting it says so and offers the two doors — start the session, or go
back to the campaign page. `chronicle`, `downtime` and `encounters` are no
longer screen panels at all.

**The campaign page is a rail, not ten tabs.** Ten flat tabs in a horizontal
scroller answered nothing about which of them a thing was on, half of them fell
off the right edge, and the page opened on the sessions log — the one thing a
DM with no players and no board does not want. It is five headings now, each
with a named list under it, and it opens on an **Overview** that says where the
table stands and what the next move is. Every section is linkable
(`/campaigns/[id]#boards`), and the search results link into the section they
found something in.

**One name per thing.** [docs/naming.md](../naming.md) is the vocabulary and is
binding. "The shelf" was four different things; sittings / chronicle / session
were one thing with three names; the grid a fight happens on had four. The
voice survives in the margin, which is where design rule 5 says it lives.

---

## Setting up

- **One capture box.** The search bar over the sections writes as well as
  reads: `+ quest The miller's daughter`, `+ npc Sexton Ambrose Quill, keeper
of the chapel`, `+ clock The tide takes the crypt, 6`. The grammar is in
  `lib/capture.ts`; the long forms all stay where they were.
- **One "Seat the party" card.** The join code, the invitation field, the
  pending invitations and the chairs with no hero in them, in one place.
- **One control for a board in play.** `isActive` and `visibility` could
  between them reach "the board the table is playing on, which the table
  cannot see". Putting a board in play now shows it; hiding it again is the
  odd case and is a quieter switch.
- **House rules on one card.** The enforced rules, the free text and the table
  notes, under one heading, with the way to change them on it.

## The workshop

- **Erase.** Its own tool, with a choice of what to rub out — things, walls,
  lights, floor, height, everything. Removing a hedge used to take the lawn it
  stood on, because "remove" meant `clearRegion`. The Select tool's _Remove_
  reads the same choice.
- **Pictures.** The `image` prop kind has been in the document model since the
  sand table's phase 6 and nothing could place one. There is a tool now:
  upload or pick one of the campaign's pictures, set how tall it stands and
  which way it faces, tap a tile.
- **Height.** The step snapped to 1 and then jumped to 6, with no way back to
  5 and no way to reach 0 at all. The arrows move on the 5-ft grid, the field
  takes any number including 0, there are quick sizes, and _Set to_ with 0 is
  reachable in one press as _Flatten back to the ground_.
- **The wheel turns what is in hand** — a stamp, or a picture with a fixed
  facing. `R` still works.
- **Weather**, per floor: rain, a downpour, snow, a blizzard, mist. The two
  that lightly obscure say so in words beside the picture, because a drawing
  that only decorates is ornament with nothing behind it (rule 6).
- **More ground**: snow, ice, mud, sand, bare rock, cliff face. Snow, mud, sand
  and rock are difficult; cliff face is impassable.
- **Difficult ground is drawn.** Water and rubble have always cost double and
  nothing on the board said so. A hatch of short diagonals says it, greyscale
  and all.
- **Fog** is **fog of war**, everywhere.

## The fight

- **A fight is laid out before it starts.** `initiative_encounters.phase` is
  `setup` until somebody presses **Roll for initiative**: the order exists,
  monsters go on the board, the DM shows what the party should see, and
  nothing is anybody's turn. Only staff are moved to the board while that is
  true — a player whose screen rearranged itself the moment the DM started
  placing scenery has been told something they were not told.
- **Roll for initiative** is one press and the loudest control on the panel:
  it seats the party if nobody did, rolls for anybody at 0, goes to the top,
  and tells the table.
- **Foes are dealt shared and hidden by the fog**, not by a flag. Two
  mechanisms were hiding one thing, so six foes were six presses of _Show
  them_. `dm`-only is still there for the assassin on the balcony, and there
  is a **Show every foe** / **Hide every foe** for the rest.
- **The board's six buttons are four kinds**: the view, _The fight_, _Fog of
  war_, and _Board_ (workshop, visibility, swap).
- **The order folds.** Only the combatant whose turn it is — plus the reader's
  own hero, plus whatever they opened — is drawn as a card. A six-body fight
  fits on one screen again.
- **Everything about the selected body is on the board's bottom bar**,
  including hit points and **Take** / **Heal** with a number. The two buttons
  are named rather than `−` and `+`, because the sign is the easy thing to get
  backwards while the room waits.
- **Panels go all around the board**, not in one column: left, right and a rail
  underneath.
- **After the fight**, a card: what it was worth, split across the party, with
  a field for what they found. The arithmetic used to live a section away and
  the bookkeeping happened next week or not at all.

## At the table

- **Rolls is one box.** The asking and the dice were two panels in two columns.
  The ask is at the top and the log is under it.
- **The DM can ask for advantage.** `campaign_checks.mode` is what was asked
  for; `campaign_check_targets.rolled_mode` is what it was actually rolled
  with, so the panel can say when a player overruled the flag — and they can,
  because they know about the grease and the DM does not.
- **The dice tray is a tray, not a modal.** It sits in the corner and the page
  underneath stays live.
- **Attacks have a target picker.** Shift-tapping a second token still aims and
  is still the fast path, but it was the only one, said once in the hand face —
  so a DM pressed Attack, hit nothing, and could not tell whether they had hit
  or missed because there had been nobody to hit. The verdict is now a line at
  the top of the stat block, not under whichever action was pressed.
- **Sound effects.** `campaign_audio.kind` splits the loop under the room from
  a soundboard: a door, a horn, a scream, played once over the music. Pressing
  one publishes a `sound` event; every browser with sound on plays it. Music
  tied to a board was already there and still is.
- **Notifications stop repeating.** An id caught a replayed frame; it did not
  catch one act that reached the server twice, which is two slips saying
  exactly the same thing. The corner now treats an identical reading inside
  2.5 seconds as one moment. The legendary-action nudge is one slip per turn
  rather than one per creature.
- **The panels stop flickering.** The floor re-read every thirty seconds
  whether or not anything had moved, and handed every panel a new object —
  which is what "the sidebar keeps refreshing and it is not obvious what is
  happening" was. The state is compared before it is set.
- **Players have no Homebrew section.** The approval queue was on their page
  wearing somebody else's count.

## Running the box

`/admin`, for whoever the `ADMIN_EMAILS` environment variable names: accounts,
campaigns, characters, sessions, fights, homebrew, library, boards, sound,
signups over a fortnight, and how much of the disk the uploads have taken.
Plus the handles an operator actually needs — verify an address by hand (a
self-hosted install often has no outbound mail at all), hand somebody else the
keys, shut an account off.

**Never a password**, and never anybody's campaign: nothing on that page reads
a canon entry, a notebook, a whisper or a sheet. Running the machine and
playing at a table are different jobs.

---

## One thing not built: Spotify

`Improvements.txt` asks for Spotify integration alongside the soundboard. It is
not here, and it is the only item on the list that is not.

The reason is in [CLAUDE.md](../../CLAUDE.md), first paragraph: _"no external
services, no outbound calls at runtime."_ Spotify is an OAuth flow to a third
party, a token to store and refresh, and a Web Playback SDK that only plays for
listeners who each hold their own Premium account. It breaks the promise the
app is built on, and it would break it for every install, including the ones
that run with no internet at all.

The soundboard is built in full: uploads, a grid of one-press effects played to
the whole table, a loop under the room, and a track tied to a board that starts
when the board goes in play. If Spotify is still wanted, the honest shape is a
**clearly-labelled opt-in** that the operator turns on for their own box — an
environment flag, a settings page that says plainly what it reaches out to, and
a soundboard that keeps working when it is off. That is a decision about what
Hero Nexus is, not a feature to slip in, so it is left to be made rather than
made here.
