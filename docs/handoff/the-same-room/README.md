# Handoff — the same room

Suggested branch: `feat/the-same-room`.

The app is a very good **record** of a table and a poor **room**. Everything a session
produces is already stored, filtered by role and rendered somewhere — but it is rendered
where you happen to be standing, on a tab you had to pick, below a fold you had to
scroll to. Nothing arrives. A DM starts an hourglass and the only people who see it are
the ones already looking at the panel it lives in.

This work makes the table **arrive**: one live connection per browser, an event
vocabulary the app has never had, an announcement layer in the shell rather than on a
page, a sitting you can be _in_, and a way for the DM to ask one player for a DC 15
Stealth check and get a real rolled answer back.

Every "today" below was read out of the code at `dbeee3a` and is kept in the present
tense as the record of what was found — so the "what is actually wrong" section still
describes the app this work started from, not the app it produced.

**Phases 1–5 are built.** [phases.md](phases.md) carries the item-by-item state, and
what each run proved is at the foot of this file. Phases 6 and 7 are open.

---

## The brief, restated

> Dice rolls and an hourglass live there but are a little hard to notice. It does not
> show up automatically. The DM puts the timer on and all players looking at the session
> see it as a notification; public rolls are seen by all players; the DM can push a DC
> skill check to a player, hiding the DC or showing it. It is great right now for
> tracking, but there needs to be an in-game status that is easier for players to see
> and for the DM to see exactly what the players are doing to their character.

Four asks, and they are not the same size:

| Ask                               | What it actually needs                                                         |
| --------------------------------- | ------------------------------------------------------------------------------ |
| Things show up without looking    | A transport that pushes, and a surface in the **shell** rather than on a page  |
| Public rolls / timers announce    | An **event** vocabulary. The app today has only state                          |
| The DM pushes a check at a player | A new durable row: a request, addressed, answerable, with a DC that may be hid |
| The DM sees what players do       | The party's play state on the same wire, which today does not poll at all      |

Combat, maps and puzzles are named in the brief and are addressed under
[What is deliberately not in this plan](#what-is-deliberately-not-in-this-plan) — two of
the three fall out of the four rows above without being built as features.

---

## What exists

More than it looks. The parts are good; none of them arrive on their own.

| Piece                                       | State                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `useCampaignLive` (`src/@shared/hooks/`)    | Polls `getLiveStateAction` every **3s** while mounted and the tab is visible. 59 lines             |
| `getLiveState` (`src/server/session.ts`)    | One role-filtered read: encounter, entries, handouts, **40 rolls**, timers, the viewer's character |
| `/campaigns/[id]/screen` + `DmScreen`       | An arrangeable column grid of 14 panels, **already player-facing**, layout stored per viewer       |
| `campaign_rolls`                            | Server-rolled, every face stored, `visibility: 'table' \| 'dm'`, filtered in `getLiveState`        |
| `campaign_timers`                           | The hourglass. `endsAt` is an instant; the browser ticks; `'dm' \| 'shared'`                       |
| `campaign_reveals` + `_targets`             | A line handed over, to `'party'` or to `'selected'` **user ids**. The closest thing to a push      |
| `campaign_handouts`                         | Images and notes, `'dm' \| 'shared'` — **no targeting**                                            |
| `PlayState` / `PlayCard` / `PartyPlayPanel` | Every number that moves mid-fight, editable at the table                                           |
| `rollDeathSave`, `spendHitDice`             | Rolled on the server and written to the shared log                                                 |
| `skillBonus` / `savingThrow` (`derive.ts`)  | The exact modifiers a pushed check needs, already derived from the sheet                           |
| `SKILL_KEYS` / `ABILITY_KEYS`               | The full vocabulary a check would name, already typed                                              |
| `DiceTrayProvider`                          | A root-mounted modal moment reached from anywhere with `useDiceTray()`                             |
| `rate-limit.ts`, `db/index.ts`              | The established `globalThis` pattern for process-local state on a single-process deployment        |
| `campaign_sessions`                         | `planned \| played \| cancelled` — a calendar, with **no "now"**                                   |

So the table already keeps secrets correctly, rolls honestly, and has a panel grid
players can arrange. What is missing is that **nothing travels**.

---

## What is actually wrong

Six findings, each of which the plan below answers.

**1. The live view only exists where its hook is mounted.** `useCampaignLive` is used in
exactly two places: `SessionPanel` and `DmScreen`. A player reading the Canon tab, their
own `/characters/[id]/play` surface, or the dashboard is outside the session entirely.
That is the "different tabs / have to scroll down" complaint, precisely.

**2. There is state, and there are no events.** `LiveState` is a snapshot of what is
true. There is no way for the app to say _this just happened_, so nothing can announce
itself. The hourglass is the clearest case: `TimerPanel`'s own comment records the
decision — _"Expiry is a state, not an event. Nothing fires."_ That is right for expiry
and wrong as the app's only option, because **starting** a timer is a moment and
currently produces nothing.

**3. Polling is at its ceiling.** `getLiveState` runs six or seven queries. Six viewers
at 3s is roughly **14 reads a second** for a table where usually nothing has changed —
on one droplet, against a synchronous SQLite driver, while the same process serves every
other page. Adding the party's play state, clocks, quests and maps to that shape
multiplies a cost that is already mostly waste.

**4. The DM cannot see what the players are doing.** `PartyPlayPanel` loads once in a
`useEffect` and reloads only on its own actions. A player spending a hit die or dropping
to 0 reaches the DM's screen when the DM happens to remount the panel. The brief's "see
exactly what the players are doing to their character" is false today, and it is one of
the cheapest things here to fix.

**5. There is no verb for "I am asking you for something."** `campaign_reveals` pushes a
line _to_ people and is the right precedent for addressing, but a reveal is a statement.
Nothing in the schema asks a question or holds an answer.

**6. There is no "now".** A sitting is `planned`, then `played`. The app cannot tell a
notification worth interrupting somebody for from one that is not, cannot say "the table
is sitting, come in", and makes the DM stamp `playedOn` by hand afterwards.

---

## The model decisions

### 1. Server-Sent Events, not WebSockets

`src/db/README.md` already promises this shape, and it is the right one for this
deployment rather than merely the easier one:

- **The traffic is one-directional.** Everything a browser sends is already a server
  action that writes to SQLite and returns a typed `Result`. A duplex socket buys
  nothing, and would create a second way to mutate the database that does not go through
  the role gates in `requireCampaignRole`.
- **A custom server is a real tax.** WebSockets under the App Router mean replacing
  `next start` with a `server.js`, which changes `deploy/hero-nexus.service`, the build,
  and the turbopack dev loop — for a feature whose payload is "something changed".
- **SSE is a shape this repo already writes.** A `Response` wrapping a `ReadableStream`
  from a route handler is exactly the four file-serving routes under
  `src/app/api/campaigns/[id]/`.
- **Reconnect is free.** `EventSource` retries on its own and re-sends `Last-Event-ID`.
  A hand-rolled socket needs its own backoff, and the one that gets written under
  deadline is the one that hammers a dropped server.
- **One process means the hub can live in memory.** `rate-limit.ts` states the licence
  in its header comment — single Node process, single droplet, no shared state to
  coordinate — and `db/index.ts` uses the same `globalThis` pin. A broadcast hub is the
  third instance of that pattern, not a new idea.

**Revisit this only** if the deployment grows a second instance (the hub becomes wrong at
the same moment `rate-limit.ts` does, which is a useful coupling — they fail together and
are fixed together), or if the app ever wants client→server streaming at interactive
rates. There is exactly one such feature on the horizon and it is dragging tokens on a
battle grid, which is not in this plan.

Two operational notes that must be checked and not assumed:

- **Caddy must not buffer the stream.** `deploy/Caddyfile` uses `reverse_proxy` with
  `encode zstd gzip`. Send `X-Accel-Buffering: no` and `Cache-Control: no-store,
no-transform` on the stream response, and prove it end-to-end through a proxy rather
  than only against `next start` on localhost.
- **A heartbeat is not optional.** A comment line every ~25s keeps intermediaries from
  reaping an idle connection and gives the client something to notice the absence of.

### 2. Two different things travel, and conflating them is the mistake to avoid

- **State** is what is true now: the order, hit points, the timers, the party's vitals.
  It is idempotent, re-readable, and **safe to miss** — a client that missed three
  updates and then reads is correct.
- **An event** is a moment: a roll landed, a turn advanced, the DM asked you for a
  check. Missing one is acceptable, because the state it produced is still readable.
  **Seeing one twice is not**, because an announcement is a claim that something just
  happened.

The app today has only the first. Every "notification" in the brief is the second. They
need different plumbing, different guarantees, and different names, and the fastest way
to make this work incoherent is to let one channel try to be both.

### 3. The state channel carries a nudge, never a payload

The stream sends `{"v": 41}` — a per-campaign version counter — and the client re-reads
through `getLiveStateAction`, which it already calls.

This is not laziness. `getLiveState` is **role-filtered**: it strips foe hit points for
players, drops `visibility: 'dm'` rolls, hides staff-only timers and handouts. A
broadcast payload would have to be filtered per subscriber, which means the hub learns
about roles and secrets, which means there are two places secrecy is decided and one of
them is new. **Keeping the state channel contentless makes that leak impossible by
construction.** `getLiveState` stays the only filter.

It also keeps the promise in `src/db/README.md` literally: `useCampaignLive` still
returns `{ state, error, refresh }`, and only its trigger changes.

### 4. Events are addressed, and their payload is thin

Events do carry content, because an announcement's whole substance is what to say. So
each event is published with an **audience** decided on the server — `everyone`,
`staff`, or a list of user ids — and the hub writes it only to subscribers in that
audience. One function, one rule, tested apart from everything else.

The rule that keeps that safe:

> **An event's payload must be safe for its audience, and where there is any doubt an
> event carries only a kind and an id and the client re-reads through the role-filtered
> path.**

So a public roll announces "Kessa · Stealth · 18" — already public in the log. A roll
behind the screen publishes to `staff` and nothing else. A check addressed to one player
announces to that player and to staff. Nothing whose visibility is interesting is ever
composed into a broadcast string.

### 5. Something becomes a row when a player who was offline still needs to find it

`the-long-campaign` phase 9 deliberately refused a `notices` table, and gave the
condition for building one: _"when there is a fact that cannot be derived — a DM's
one-off message, or 'a handout is waiting'."_ This work is that condition arriving. The
line it drew is the one to keep:

| Thing                         | Row or event                                                             |
| ----------------------------- | ------------------------------------------------------------------------ |
| "Kessa rolled an 18"          | **Event.** Derivable from `campaign_rolls`; may be missed                |
| "A timer is running"          | **State.** `campaign_timers` already holds it                            |
| "The DM asks you for a check" | **Row.** Addressed at a person, outlives the connection, wants an answer |
| "Somebody is looking"         | **Neither.** Presence is true only while a socket is open — see 7        |

A notification store that only ever holds derivable facts is a cache with a staleness bug
in its future. This keeps one out.

### 6. The announcement surface lives in the shell, not on a page

Design language rule 4 allows one interactive moment per page, and names the dice tray as
the exception — _"only because it is not on a page: it is a modal moment over the whole
window, raised by an action the reader took and gone a couple of seconds later."_

The announcement layer is the same kind of thing and is justified the same way. A
`TableProvider` mounts beside `DiceTrayProvider` in `src/app/providers.tsx`, holds the
one `EventSource`, and exposes `useTable()`. Because it is in the shell it reaches the
player on their play surface, on the compendium, on the dashboard — which is the actual
complaint the brief opens with.

**This amends `docs/design-language.md`, and the amendment ships in the same change.**
The docs are binding; a second root-level moment that is not written down reads to the
next reviewer as a rule-4 violation, and they would be right to say so.

Constraints that come with it, none negotiable:

- `Glyph` only. **No emoji** (rule 8), and any new mark is drawn for 16px.
- An announcement is load-bearing, so it is **not** set in the hand face (rule 5). A
  scrawled second line is allowed and must be removable without losing anything.
- Gold is the table's own voice. `--danger` is for something actually dangerous — "your
  turn" is gold.
- Under `prefers-reduced-motion` announcements appear without motion, and the panels
  behind them never pulse. A box that flashes on every event is precisely the thing rule
  4 exists to stop.
- `aria-live="polite"`, except a request addressed to you, which is `assertive`. Focus is
  never stolen.

### 7. One connection per browser; presence is derived from it

`DmScreen` already makes this argument internally — _"Mounting three panels that each
poll would be three requests every three seconds for one answer."_ The provider owns the
stream; every panel subscribes in memory.

That connection is also the honest source for **who is actually looking**. Presence is
computed from the held connections on `globalThis` and broadcast as state. It is
deliberately **not** a table: a presence row in SQLite outlives the truth it asserts and
needs a reaper, and a reaper that misses leaves the party staring at a player who closed
their laptop an hour ago.

### 8. A check is a request, and a request is a row

The largest new piece. `campaign_checks` plus its targets and answers:

- **Targets are user ids**, not member rows — the same choice `campaign_reveal_targets`
  and `campaign_session_attendance` made, for the reason recorded there: the GM has no
  member row, and a player who later leaves the table was still asked.
- The ask names a `SkillKey` or an `AbilityKey` from the existing vocabulary, or is free
  text. `dc` is nullable and carries its own visibility.
- **The modifier is computed on the server** from `skillBonus(sheet, skill)` /
  `savingThrow(sheet, ability)`. The client never sends a bonus — the same rule
  `session.ts` states for every other roll: _a number the client produced is a claim
  about a roll, not a record of one._
- The answer is an ordinary `campaign_rolls` row, linked. There is one roll log.
- **Pass or fail is derived server-side** from the total against the DC, and a hidden DC
  means the player sees their total while the DM sees the verdict. That is the entire
  point of hiding a DC, and getting it wrong by sending the DC down and hiding it in CSS
  would be worse than not building it.
- A group check is **one request with many targets**, so the DM's panel is a column of
  asked / rolled / passed rather than five separate asks to chase.

### 9. A sitting you can be in

`campaign_sessions` gains a live state and a `startedAt`. The DM opens the table; that is
the moment that pushes everyone "the table is sitting" with one press into the room, and
it is what turns this from a dashboard into a place. Closing it stamps `playedOn` and
flips to `played` — a chore the DM does by hand in the Chronicle today, so the feature
pays for part of itself.

Deriving "we are live" from an active encounter was considered and rejected: a session is
mostly not a fight, and a table that has been talking to the innkeeper for forty minutes
is very much sitting.

### 10. The screen becomes the room; no third surface is built

`/campaigns/[id]/screen` is already an arrangeable, role-filtered, per-viewer panel grid
that players can open today. Building a second "play view" beside it would be the same
mistake the campaign page avoided — `DmScreen`'s own comment says it: _"this screen is an
arrangement of the app, not a second implementation of it."_

So the work on it is additive: new panels (the feed, the checks, presence, a live map),
and one press to reach it from anywhere while a sitting is open. One naming decision goes
with it — a player reads "Open the screen" as the DM's furniture, and the page has been
theirs all along.

---

## What is deliberately not in this plan

Listed so each is a decision rather than an oversight.

- **A battle grid — tokens, fog, a lattice.** `MapPanel` records the current position in
  its own header: _"Deliberately not a battle grid: no tokens, no fog, no lattice."_ The
  brief asks for maps, and the answer here is to make the **existing** map live —
  spotlight a map onto every screen at once, reveal pins one at a time — which delivers
  "the DM shows us the map" for a fraction of the cost, and which the fractional pin
  coordinates were already designed for. Tokens moving at interactive rates is the one
  requirement in this whole area that would justify a duplex socket, and it drags in a
  coordinate system, snapping, initiative-linked tokens and line of sight. **That is its
  own handoff and its own product decision**, and it is the point where this project
  starts being a virtual tabletop rather than the tool a table uses. It should be chosen
  out loud, not arrived at.
- **Puzzles as a feature.** A puzzle is a handout, a check and a timer. Once those three
  arrive live and can be addressed at particular players, a table runs a puzzle without
  the app ever knowing the word. The one real gap is targeting, and it is small: reveals
  can address selected people, **handouts cannot** — `campaign_handouts.visibility` is
  `'dm' | 'shared'` with no target table. That is a phase item, not a feature.
- **Chat.** A table on a voice call does not need it; a table that is not needs voice
  rather than text. Worth revisiting only if this app is meant to be where remote play
  happens with nothing else open — a question for the owner, not a default.
- **Sound, beyond one opt-in tone.** Off by default, one short tone, a per-user setting,
  generated in WebAudio or shipped from `public/` — the app makes no outbound calls. A
  DM's laptop chiming mid-session is worse than a missed roll.
- **Email and mobile push.** `mail.ts` is transactional on purpose; the-long-campaign
  phase 9 already ruled on this and nothing here changes it.

---

## How this gets verified

`docs/handoff/verifying-without-a-browser.md` is the method, and it reaches further here
than usual: **a stream is testable headlessly in a way a rendered panel is not.**

The centrepiece is a leak test. With two real cookie jars against a production build:

- Open `curl -N` on `/api/campaigns/<id>/live` as the player and as the DM at once.
- Roll behind the screen. **The DM's stream carries it; the player's must not.**
- Start a secret timer, push a check at one of two players, and reveal a line to a
  selected user. Each time, assert the byte string is absent from every stream that
  should not have it — not merely absent from the rendered panel.
- Kill the player's stream mid-session, act, reconnect with `Last-Event-ID`, and assert
  the replay contains what was missed and still excludes what was never theirs.
- Kill the stream and leave it dead: assert the poll floor takes over and the panel is
  still correct 30 seconds later.

Plus the ordinary ones: two streams both receive one broadcast; a non-member's stream
open is refused; a check rolled by its target uses the modifier off their sheet and not
one the client supplied; a hidden DC never appears in the target's payload; and a version
bump follows every mutating call in `session.ts` and `play.ts` — that last one is the
regression this design is most exposed to, which is why the poll floor in decision 3
stays rather than being cleaned up later.

---

## Open questions for the owner

Answer these before phase 4; the earlier phases do not depend on them.

1. **Is the battle grid wanted?** Not now — later, and as its own piece of work. If the
   answer is yes, it changes the transport decision and should be known before the wire
   is treated as settled.
2. **Is this app where remote play happens?** If yes, chat and a "look at this" spotlight
   matter far more than they do for a table sitting in one room with laptops.
3. **When a player is asked for a check, may they refuse or ignore it?** A request that
   cannot be declined is a demand, and a table where the DM can compel a player's screen
   is a different social object than one where they can ask. The recommendation is that
   a request can be dismissed and the DM sees that it was — but it is the owner's table.
4. **Should a DM be able to roll _as_ a player's character in the open?** Staff can
   already roll with a `characterId` they do not own. Whether that should announce as the
   character or as the DM is a table-culture question with a one-line answer in code.

---

## What has been verified

Against a production build, with real accounts, real cookie jars and real server-action
POSTs, following `docs/handoff/verifying-without-a-browser.md` — and then, for the half
that method explicitly cannot reach, by driving the real app in a browser.

### The wire

- **Two streams, one write.** A single roll nudged both the DM's and the player's
  streams. Six creatures dealt into a fight in one loop produced **one** state frame, not
  six — the coalescing in the hub doing its job.
- **A non-member is refused**: 404 on the stream, before a byte is written.
- **The connection cap holds**: the seventh stream for one user at one table was refused
  with 429 while the DM's was unaffected.
- **Heartbeats** arrived at 25s.

### The leak test

This is the one that mattered, and it is the reason the state channel carries no payload.

- A roll behind the screen and a secret timer **reached the DM's stream and never
  appeared in the player's bytes at all** — not filtered in the component, absent from
  the wire. The DM's stream carried four events where the player's carried two, and both
  still received the state nudges, because "something changed" is not a secret.
- A reveal addressed to one player reached that player and the DM, and **not** the second
  player at the same table.
- A **withheld DC** reached the DM as `15` and the player as `null`, in the announcement
  and in the whole live payload. After the roll the DM saw `pass`; the player saw their
  27 and no verdict.

### Reconnect

- Dropping a player's stream, acting three times, and reconnecting with `Last-Event-ID`
  replayed the two public events they missed and **skipped the secret one between them** —
  the audience filter applies to replay too.
- Reconnecting after a **server restart** got a single `resync` rather than a partial
  story.

### The sitting

- Opening announced to both streams and wrote one live row; opening twice returned the
  same sitting and still left one row.
- **All three members were told from `/dashboard`**, nowhere near the campaign, with
  `isStaff` correct per person. A stranger was told nothing and refused the stream.
- Presence listed two people and dropped to one the moment a connection closed.
- Rising stamped `played_on`, wrote the register, and announced. A player was refused
  both verbs.

### The ask

- Kessa's Stealth check rolled `1d20+7` — Dexterity 18 plus proficiency at level 5, read
  off the sheet. The browser sent no bonus and no total.
- A shown DC 13 did reach the player; an untargeted member got no announcement at all.
- Advantage rolled `2d20` and marked the die that did not count.
- A player and a stranger were both refused the ask; a stranger was refused an answer;
  answering twice was refused; one dismissal plus one roll settled the check.

### The party

- A player took 38 damage on their own sheet and the DM's party read went `38/38` to
  `0/38` **with nothing pressed on the DM's side** — the thing that was not true before.
- Two death saves produced exactly two announcements, `down` then `dead`, rather than one
  per roll. Healing from dead announced `up`. Damage while conscious announced nothing.

### In a browser, light and dark

The half `verifying-without-a-browser.md` says it cannot reach, and it earned its keep:

- The sitting bar reached a player **on the spell list**, and three announcements arrived
  there — a page with nothing to do with the campaign.
- The hourglass counted down live on the campaign page.
- Rolling an ask from the panel settled it, logged `16 (+7)`, and announced "Kessa rolls"
  rather than a verdict, because that DC was withheld.
- **Two bugs it found that no headless run would have.** The tone accent was
  `border-l-gold` on a card also carrying `border-line`, which sets all four sides and
  won on stylesheet order — every slip rendered identically grey. And trimming the stack
  from the front meant eight rolls in three seconds evicted the DM's question, the one
  slip that wanted an answer. Both fixed; see `f684643`.

## Still to verify

- **Two viewers on two machines**, rather than two cookie jars on one. Clock skew is the
  only thing that can separate them and it has not been measured.
- **Caddy in front of the stream.** The headers are set and Caddy does not buffer
  streamed responses, but that is read from documentation rather than from a proxy this
  work put a stream through.
- **A table of six for a whole session.** Everything above is minutes, not hours; the
  connection budget, the ring buffer and the floor poll have not been watched under a
  real evening.
