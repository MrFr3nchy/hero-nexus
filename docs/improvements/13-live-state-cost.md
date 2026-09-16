# 13 — What a live read costs

Item 5 of `13-ui-redesign-and-organization.md`: measure the live layer before anyone
optimises it. These are the numbers. **The recommendation is to leave it alone.**

## What was measured

`useCampaignLive` re-reads the whole `LiveState` on every stream nudge, because the
frame carries a version and nothing else and `getLiveState` is the one place that
decides what a player may see. The question was whether that full read is the source
of board lag during a fight.

`getLiveState` now logs one line per read when `HERO_NEXUS_MEASURE_LIVE=1` is set:
wall time inside the function and the serialised size of what it returns. Nothing
else changed in the live layer.

The table: a campaign with an open sitting and an active encounter, **8 combatants**
(4 party, 4 foes), **6 effects** on 6 of them, **40 whispers** in the log (each with a
target row), and an active **24×24 battle map with 8 tokens**. Six accounts at the
table — the DM and five players — each holding an SSE stream open, as six browsers
would. The DM drags one token (`moveTokenAction`) five times; after each drag every
one of the six reads `getLiveStateAction` at once, which is exactly what six copies of
the hook do when the frame lands.

Production build, `next start`, SQLite in WAL mode, one laptop for both server and
clients. Taken 2026-09-16 on the `feat/improvements-13-ui-redesign` branch.

## Numbers

Per read, inside `getLiveState`, six concurrent (n = 29):

|        | ms  |
| ------ | --- |
| min    | 35  |
| median | 40  |
| p95    | 51  |
| max    | 53  |

Per read as the client sees it, HTTP and the action's own encoding included (n = 30):
median **66 ms**, p95 **79 ms**, max **91 ms**.

Wall time for all six reads together, per drag: **95, 82, 78, 74, 71 ms** (the first
is cold). The drag itself: 41 ms cold, then 8–19 ms.

Bytes on the wire per read: **27.2 KB** for the DM, **13.5 KB** for a player. So one
token drag at a six-seat table costs **6 reads, ~95 KB, and under 100 ms** before every
browser is current. The stream itself sent one frame per drag (plus two on open) to
each listener.

Where the DM's extra weight comes from: `whispers=40` for the DM against `whispers=8`
for a player (a player is only sent the ones addressed to them), and the DM sees the
tokens. Serialised in the function the DM's state is 29.3 KB and a player's 13.8 KB;
the action encoding is within a few percent of that.

## Recommendation

**Leave it alone.** A p95 of 51 ms server-side and 79 ms end-to-end is comfortably
inside a frame budget of ten times that, and a six-seat table's worst case is one
tenth of a second between a drag and the last browser catching up. SQLite is not the
bottleneck at this size and there is no evidence the full read is either. Whatever
board lag a table feels is not this.

Two observations for later, neither of which is a change to make now:

1. The whisper log is the one section that grows without bound and is sent whole on
   every read. At 40 whispers it is roughly half the DM's payload. If it ever matters,
   the fix is a limit on the log the way `ROLL_LOG_LIMIT` already bounds the rolls —
   still one authority, still role-filtered, one number.
2. If a bigger table (twelve seats, a hundred-token map) ever pushes these numbers
   past a frame, the cheapest safe change is the one 13 already describes: keep one
   `getLiveState`, let the frame name a scope (`'board' | 'party' | 'all'`) so the
   server can skip assembling sections nobody asked for. Not delta frames, which would
   add a second place deciding what a player may see.

## Taking the numbers again

```bash
sqlite3 data/hero-nexus.db ".backup /tmp/verify.db"
HERO_NEXUS_DB_PATH=/tmp/verify.db npx tsx src/db/migrate.ts
# seed a heavy campaign into the copy (the item-5 pass used a throwaway tsx
# script that inserted the rows above directly), then:
npm run build
HERO_NEXUS_DB_PATH=/tmp/verify.db HERO_NEXUS_MEASURE_LIVE=1 npx next start -p 3113
```

Open a stream per seat with `curl -sN -H 'cookie: authjs.session-token=…' \
http://localhost:3113/api/campaigns/<id>/live`, drag a token, and read the `[live]`
lines off the server's stderr. Cookies for throwaway seats are minted with `encode()`
from `next-auth/jwt` (salt `authjs.session-token`, the repo's `AUTH_SECRET`); the
action ids come from `createServerReference)("<id>",…,"moveTokenAction")` in
`.next/static/chunks`.
