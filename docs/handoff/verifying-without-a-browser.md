# Verifying without a browser

Phases 1–3 were built in a session with no browser automation. Everything below the
rendered pixels was still verified against the running app — real HTTP, real sessions,
real server actions — rather than trusted to `tsc`. This is how, and it is worth
keeping: it catches things a typecheck cannot.

It found, among others, that an equipped Shield resolved to the Shield _spell_ and cost
the character 2 AC. The types were correct. The behaviour was not.

---

## What this does and does not reach

**Reaches:** server modules, server actions, permissions and role gates, the database,
migrations, schema validation, adapters, derived values, the history log.

**Does not reach:** anything rendered. Every panel added in this work is a client
component, and this app's client components do not appear in fetched HTML — their data
arrives later over a server-action POST. Confirmed by comparing against `/login`, which
also renders zero `<button>` tags server-side. **A page returning 200 with no expected
strings in the body proves nothing.** Do not read that as a failure, and do not read it
as a pass.

---

## Setup

### 1. Verified accounts

Sign-in requires a confirmed email, so create the accounts directly. Three of them —
most access bugs only show up when a _non-member_ asks.

```ts
// .verify-user.ts at the repo root; delete when done.
import { hash } from '@node-rs/argon2';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const PASSWORD = 'verify-pass-1234';
const PEOPLE = [
  { email: 'verify-gm@example.com', name: 'Verify GM' },
  { email: 'verify-player@example.com', name: 'Verify Player' },
  { email: 'verify-outsider@example.com', name: 'Verify Outsider' },
];

async function main() {
  const db = new Database('data/hero-nexus.db');
  const pw = await hash(PASSWORD);
  for (const p of PEOPLE) {
    const existing = db
      .prepare('select id from user where email=?')
      .get(p.email) as { id?: string } | undefined;
    if (existing?.id) {
      db.prepare(
        'update user set password_hash=?, emailVerified=? where id=?'
      ).run(pw, Date.now(), existing.id);
    } else {
      db.prepare(
        'insert into user (id, name, email, emailVerified, password_hash) values (?,?,?,?,?)'
      ).run(randomUUID(), p.name, p.email, Date.now(), pw);
    }
    console.log(p.email);
  }
}
main();
```

`npx tsx .verify-user.ts`. Note the table is `user`, singular.

### 2. Sign in to a cookie jar

```bash
#!/bin/bash
# login.sh <email> <jar-path>
set -e
EMAIL="$1"; JAR="$2"; BASE="${3:-http://localhost:3000}"
rm -f "$JAR"
CSRF=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
curl -s -o /dev/null -c "$JAR" -b "$JAR" -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=verify-pass-1234" \
  --data-urlencode "redirect=false" \
  --data-urlencode "callbackUrl=$BASE/dashboard" \
  "$BASE/api/auth/callback/credentials"
grep -q 'session-token' "$JAR" && echo "signed in: $EMAIL" || { echo "LOGIN FAILED"; exit 1; }
```

### 3. Call a server action

Server actions are reachable over HTTP with a `Next-Action` header carrying the action
id. The ids are compiled into the client bundle next to the exported name, so they can
be looked up:

```bash
#!/bin/bash
# act.sh <jar> <action-name> <json-args-array> [path]
JAR="$1"; NAME="$2"; ARGS="$3"; PATH_="${4:-/dashboard}"; BASE="http://localhost:3000"
ID=$(grep -rho "\"[0-9a-f]\{40,\}\",[a-z]\.callServer,void 0,[a-z]\.findSourceMapURL,\"$NAME\"" \
      .next/static/chunks/ | head -1 | sed -E 's/^"([0-9a-f]+)".*/\1/')
[ -z "$ID" ] && { echo "NO ACTION ID for $NAME" >&2; exit 1; }
curl -s -b "$JAR" -X POST "$BASE$PATH_" \
  -H "Next-Action: $ID" -H "Content-Type: application/json" --data "$ARGS"
```

Arguments are a **JSON array of the action's parameters, in order**. Check the
signature — `saveCharacterAction(sheet, id?)` takes the sheet _first_; passing the id
first returns a generic "Failed to save character."

---

## The rules that make this work

**Use the production server, not dev.** Dev and production compile _different_ action
ids, so ids scraped from `.next/static` will not resolve against `next dev`.

**Never run `npm run dev` into a `.next` built by `npm run build`.** Turbopack clobbers
the manifests and `npm run start` then dies with
`routesManifest.dataRoutes is not iterable`. The fix is `rm -rf .next && npm run build`.

**One server at a time.** A stale `next-server` holding port 3000 will silently serve an
old build, and results will be from code you are not testing. `pkill -f next-server`,
confirm the port is free, then start.

**Build server data with `tsx`, not by hand.** Writing a valid `CharacterSheet` by hand
is hopeless; import `makeEmptySheet()` and mutate it.

---

## What a real check looks like

Assert on behaviour, and always include the negative case. A permission check that only
proves the GM _can_ do something has proven nothing about whether the player _cannot_.

```bash
# The player must be refused, AND nothing must reach the database.
./act.sh player.jar addCampaignContentAction "[\"$CID\",\"$HB\",\"\"]" "/campaigns/$CID"
#   -> {"ok":false,"error":"Only the DM and co-DMs manage the content library."}
npx tsx -e "…select from campaign_homebrew…"   # -> only the GM's row
```

The checks worth re-running after any change to this feature:

- Every SRD row adapts, and none collapses to an empty stat block. (Regression guard for
  the `.catch()` rule — an all-defaults Wizard looks like real data.)
- Both `srd-2024_shield` rows resolve distinctly, one item and one spell.
- AC: plate 18; breastplate caps Dex at +2; plate + shield 20; unequipped and unresolved
  armour ignored.
- Approve → the item is in the library → the _player_ sees it. Deny → it is gone, and
  the approval row still says why.
- A non-member reading a campaign leaks no name, description or join code.
- A sheet edit produces the expected `character_history` rows, in the DM's wording.

---

## Cleaning up

Delete `.verify-user.ts` and any seed scripts from the repo root, drop the probe
characters and campaigns, and stop the server. Do not leave the verification accounts in
a database anyone else will use.
