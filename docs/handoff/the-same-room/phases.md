# The same room — phases

Build order. Each phase leaves the app usable, and each is worth landing alone.

**Phases 1–5 are built** on `feat/the-same-room`. Phases 6 and 7 are open. What each
run proved is at the foot of [README.md](README.md); `[x]` below means landed and
verified, not merely written.

The model is in [README.md](README.md). Read it first: phases 1, 2 and 4 are only correct
in the light of decisions recorded there, particularly why the state channel carries no
payload (decision 3) and why events carry an audience instead (decision 4).

**Every phase that touches the database edits `src/db/schema.ts` and a new
`src/db/migrations/NNNN_*.sql` in the same change.** There is no drizzle-kit generate
step here. The next free number is `0037`.

---

## Phase 1 — The wire `[built]`

No visible feature. Every live surface that exists gets faster, cheaper and instant, and
the thing everything after this stands on gets proven before anything is built on it.

- [x] `src/server/live-hub.ts` — a process-local broadcast hub pinned to `globalThis`,
      the same pattern and for the same stated reason as `rate-limit.ts` and
      `db/index.ts`. Holds, per campaign: subscribers, a monotonic version counter, a
      monotonic event sequence, and a ring buffer of the last ~200 events.
- [x] `bumpVersion(campaignId)` and `publish(campaignId, event)`. Both called from
      `src/server/*.ts` **after the write commits**, never from the action wrapper — a
      bump that lives in the wrapper is one every future writer forgets.
- [x] `GET /api/campaigns/[id]/live` — `runtime = 'nodejs'`, a `ReadableStream` of
      `text/event-stream`. Authorised through `requireCampaignRole(id, ['gm','co-gm',
  'player'])` before a single byte is written; a non-member gets a 404, not a stream
      that sends nothing.
- [x] Headers: `Cache-Control: no-store, no-transform`, `Connection: keep-alive`,
      `X-Accel-Buffering: no`. A comment heartbeat every ~25s. Cleanup on
      `request.signal` abort — a subscriber that is not removed on disconnect is a leak
      that survives until the next deploy.
- [x] `useCampaignLive` swapped internally: open the stream, re-read on a version nudge.
      **Its return shape does not change** — `{ state, error, refresh }` — which is the
      promise `src/db/README.md` already made to its consumers.
- [x] **The poll stays as a floor.** 30s while the stream is open, 3s when it is closed,
      keeping the `document.hidden` handling. It is not a legacy path to delete later: it
      is what stops one forgotten `bumpVersion` from freezing a table mid-fight.
- [x] Rate-limit stream opens per user, and cap concurrent connections per user. Six
      players with four tabs each is a real number on a one-vCPU droplet.
- [x] Update `src/db/README.md` § Real-time — it currently describes the polling this
      phase replaces and points at the swap as future work.
- [x] Verified with two `curl -N` streams and a real cookie jar before phase 2 starts.

## Phase 2 — Events, and the layer that shows them `[built]`

The app learns to say _this just happened_.

- [x] `src/@shared/table/events.ts` — a pure, typed event vocabulary. One discriminated
      union, no React, no server: `roll`, `turn`, `encounter`, `timer`, `handout`,
      `reveal`, `check`, `sitting`, `vitals`. The same shape and the same reason as
      `campaign/lib/screen.ts` and `CONTENT_REGISTRY`: adding one is one entry, not a
      hunt through three switches.
- [x] `Audience = 'everyone' | 'staff' | { users: string[] }`, decided **on the server at
      publish time**, applied in one function in the hub. Model decision 4.
- [x] Sequence numbers echoed as SSE `id:`. On reconnect, replay from the ring buffer
      filtered by audience; if `Last-Event-ID` is older than the buffer, send one
      `resync` and let the client re-read state instead of pretending.
- [x] `TableProvider` in `src/app/providers.tsx`, beside `DiceTrayProvider`, owning the
      one `EventSource`. `useTable()` for consumers. Model decision 6.
- [x] The announcement stack: `Glyph` marks, no emoji (rule 8), straight voice with an
      optional removable scrawl (rule 5), gold as the table's voice, `--danger` only for
      danger, still under `prefers-reduced-motion`, `aria-live="polite"`.
- [x] First announcements, from writes that already exist: a public roll landed, a turn
      advanced, an encounter started or ended, a timer started, a handout shared, a line
      revealed. A behind-the-screen roll publishes to `staff` and to nobody else.
- [x] **Amend `docs/design-language.md` in this change** — rule 4's exception grows from
      "the dice tray" to "the dice tray and the table's announcements", with the same
      justification the tray has: it is not on a page. Add the announcement stack to the
      primitives table. Unwritten, it reads as a violation, and the reviewer would be
      right.
- [x] A `feed` screen panel — the same events as a standing list, for a DM who wants the
      session's traffic in a box rather than as moments that pass.
- [x] **Not in the original plan:** events carry `by`, the id of whoever caused them, so
      the corner stays quiet about what the reader just did. Added in phase 5, once a
      real session made the duplication obvious.
- [x] **Not in the original plan:** the announcement stack evicts the oldest slip that is
      _not_ asking the reader for something. Found by driving the app: eight rolls in
      three seconds pushed the DM's question off the screen.
- [x] Dismissal is per-viewer and local. An announcement is not a row (README decision 5).

## Phase 3 — A sitting you can be in `[built]`

- [x] `campaign_sessions` gains a live state and `startedAt`, plus migration. Opening a
      table sets it; closing stamps `playedOn` and flips to `played`.
- [x] `openSitting` / `closeSitting`, staff only. Both publish a `sitting` event to
      everyone — this is the one announcement that is allowed to be loud, because it is
      the invitation.
- [x] Presence from held connections, broadcast as state. **No table** — model decision 7. Who is here, and their role.
- [x] A shell bar while a sitting is open: "the table is sitting" and one press into the
      room, visible from anywhere in the app. This is the answer to the brief's opening
      complaint and it should be built early enough to be lived with.
- [x] An honest empty state when nobody is looking yet — `CandleScene` is drawn for
      exactly this (rule 7).
- [x] Closing a table asks the DM once, through the themed `ConfirmDialog`, never
      `confirm()`.

## Phase 4 — The ask `[built]`

The largest phase. Read model decision 8 before writing any of it.

- [x] `campaign_checks` + `campaign_check_targets` + migration. Targets keyed on
      **user id**, matching `campaign_reveal_targets` and for the reason recorded there.
- [x] Columns: `kind` (`check | save | attack | free`), `skill` (a `SkillKey`) or
      `ability` (an `AbilityKey`) or free text, `dc` nullable, `dcVisibility`
      (`hidden | shown`), `status` (`open | answered | cancelled`), `askedBy`,
      `sessionId`, `createdAt`. Per target: `status`, `rollId`, `answeredAt`.
- [x] `requestCheck(campaignId, input)` — staff only. Publishes a `check` event to its
      targets and to staff, never to the whole table unless the whole table was asked.
- [x] `answerCheck(checkId)` — rolled **on the server**, modifier from
      `skillBonus(sheet, skill)` / `savingThrow(sheet, ability)`. The client sends no
      bonus and no total. The roll is an ordinary `campaign_rolls` row, linked; there is
      one log.
- [x] Advantage and disadvantage on the answer, through the `withAdvantage` helper that
      already exists.
- [x] Pass or fail derived server-side. With a hidden DC the target's payload carries
      **neither the DC nor the verdict** — not hidden in the client, absent from the
      wire. The DM sees both.
- [ ] **Not built:** the answer landing in the roller's own dice tray. It lands in the
      shared log and announces to the table, which is the load-bearing half; the tray
      would draw the faces the server rolled, as `RollPanel` does. Small, and left open
      deliberately rather than forgotten.
- [x] A group check is one request with many targets. The DM's panel is one row per
      person: asked / rolled / passed.
- [x] A target may **dismiss** a request, and the DM sees that they did — pending the
      owner's answer to open question 3. Default to dismissible; a request that cannot be
      declined is a demand.
- [x] A `checks` screen panel, `players: true` — a player needs to see what they were
      asked as much as the DM needs to see who has answered.
- [x] Rate-limit `requestCheck`. Twenty asks in ten seconds is a misfire, not a session.
- [x] Empty state with a scene: a DM who has asked nothing, and a player who has been
      asked nothing, read differently and should say different things.

## Phase 5 — The party, live `[built]`

The brief's "see exactly what the players are doing to their character", which is the
cheapest ask in the whole document.

- [x] `PartyPlayPanel` and `PlayCard` read the stream instead of loading once. Today they
      load in a `useEffect` and reload only on their own actions, so a player spending a
      hit die reaches the DM's screen when the DM remounts the panel.
- [x] `applyPlayPatch`, `spendHitDice`, `rollDeathSave`, `setPlayConditions` and
      `restParty` bump the version and publish a `vitals` event. Hit points crossing 0
      and a death save landing are the two the table should be told about; the rest are
      state and stay quiet.
- [x] `/characters/[id]/play` joins the room when the character is seated at a table —
      the player running their sheet is at the table, and today is the one person the
      session cannot reach.
- [x] Party vitals ride the existing `LiveState` rather than a second read. One answer,
      one request — the argument `DmScreen` already makes about pollers.
- [x] A player's own hit points changing does **not** raise an announcement on their own
      screen. They pressed the button; being told is noise.

## Phase 6 — The room `[open]`

- [ ] Handouts gain targeting: `visibility` grows a `selected` state and a targets table,
      mirroring `campaign_reveals` exactly rather than inventing a second shape. This is
      what a puzzle clue actually needs, and it is the one real gap behind the brief's
      "puzzles".
- [ ] A map can be **spotlighted** — pushed onto every screen at once, and dismissed the
      same way. Pins are already fractions of the image, which is what makes one
      spotlight land in the same place on a phone and a monitor.
- [ ] Reveal a pin to the party one at a time, from the same control that reveals a line
      of the notebook. Same verb, same timeline.
- [ ] A `presence` panel and a `map` panel on the screen; `SCREEN_PANELS` gains both
      entries and `defaultLayout` is revisited so a player's first screen shows the room.
- [ ] Naming pass: "Open the screen" reads as the DM's furniture to a player, and the
      page has been theirs since it was built. One word change on `CampaignDetail`, and
      the per-route line in `docs/design-language.md` follows it.
- [ ] The campaign page's Session tab and the screen stop diverging — whatever the screen
      gains, the tab reaches by the same components.

## Phase 7 — The quiet parts `[open]`

Small, and the difference between a feature people keep on and one they turn off.

- [ ] One opt-in tone, **off by default**, per-user. Generated in WebAudio or shipped
      from `public/` — no outbound call, ever.
- [ ] Per-table settings on `CampaignSettings` for what announces: rolls, timers, checks,
      vitals. A DM who finds it noisy should turn it down rather than leave the room.
- [ ] Reduced-motion and `aria-live` audited across every announcement, in light and
      dark, per the review checklist in `docs/design-language.md`.
- [ ] Connection caps, stream rate limits and a hub size ceiling, all revisited under a
      real six-player session rather than guessed.
- [ ] `docs/handoff/the-same-room/README.md` § "What has been verified" written from the
      run, in the past tense, the way the other handoffs record theirs.

---

## Ordering notes

- **Phase 1 alone is worth landing.** It removes the 3s poll from every live surface and
  costs no new UI. If this work stalls, that is the piece that should still exist.
- **Phase 4 depends on 1 and 2 and nothing else.** It does not need the sitting.
- **Phase 5 is the cheapest visible win** and could be pulled ahead of 3 or 4 if the DM's
  blindness to the party is the complaint that stings most.
- **Phase 6 assumes the owner has answered open question 1.** If the battle grid is
  wanted, the map half of phase 6 is a down payment on it and should be shaped
  accordingly rather than built to be thrown away.
