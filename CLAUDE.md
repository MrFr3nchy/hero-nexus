# Hero Nexus

A self-hosted D&D 2024 campaign tool: players build characters and forge homebrew, DMs
run tables and rule on what is allowed at theirs. Next.js 15 App Router, React 19,
HeroUI + Tailwind v4, Auth.js credentials, and a SQLite file that ships with the repo.
No external service is needed to run it. Three outbound calls exist, each one opt-in or
one-off, and no fourth is added without a line here:

- **The SRD seed** (`npm run db:seed`) fetches from api.open5e.com once, at setup.
- **Mail** (`src/server/mail.ts`) POSTs to Resend when `RESEND_API_KEY` is set;
  without it mail is printed to the log.
- **Discord** (`src/server/discord.ts`) POSTs to a channel webhook a DM pasted into
  their campaign, fire-and-forget after the write, five-second timeout. Only Discord's
  own hosts and webhook path are accepted (`validateWebhookUrl`), which is the SSRF
  guard.

This file is the index. The documents it points at are binding, not advisory: where one
disagrees with the code, the code is wrong.

## Read before you write

| Document                                           | Governs                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| [docs/design-language.md](docs/design-language.md) | How any page looks and is laid out. Ten rules, each checkable.   |
| [docs/naming.md](docs/naming.md)                   | What everything is called. One thing, one name, everywhere.      |
| [docs/content-model.md](docs/content-model.md)     | How game content is shaped, stored, referenced, and put in play. |
| [docs/sharing-model.md](docs/sharing-model.md)     | What happens when something leaves the account that made it.     |
| [src/db/README.md](src/db/README.md)               | Schema and migrations.                                           |

**`src/db/schema.ts` and `src/db/migrations/*.sql` are hand-written and edited together,
in the same change.** There is no drizzle-kit generate step here, and reaching for one
produces SQL nothing applies and a schema nothing matches. This is the rule that gets
broken most.

## What must pass

```bash
npm run check   # eslint + prettier
npm test        # Vitest: pure rules modules, and server modules on a temp database
npm run build   # the real typecheck — `npm run check` does not run tsc
```

A run of `npm run check` is clean when it reports nothing. `npx tsc --noEmit -p .`
is the fast typecheck CI runs (`.github/workflows/ci.yml`); `npm run build` is still
the gate. Tests sit beside their module as `*.test.ts`; a server-module test follows
`src/server/canon.test.ts` (a migrated temp file from `test/db.ts`, `@/auth` mocked).

## Verifying

Server behaviour is proven against the running app, not trusted to `tsc`: real
accounts, real cookie jars, real server-action POSTs (the action ids are compiled into
the client chunks beside their exported names), and the serialised payload asserted
on. Pure rules modules are asserted directly, apart from the app. Anything rendered is
looked at in a browser, in both palettes. A typecheck cannot tell you that an equipped
shield resolved to the shield _spell_ and quietly cost the character 2 AC — that check
did.
