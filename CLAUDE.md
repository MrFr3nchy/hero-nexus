# Hero Nexus

A self-hosted D&D 2024 campaign tool: players build characters and forge homebrew, DMs
run tables and rule on what is allowed at theirs. Next.js 15 App Router, React 19,
HeroUI + Tailwind v4, Auth.js credentials, and a SQLite file that ships with the repo —
no external services, no outbound calls at runtime.

This file is the index. The documents it points at are binding, not advisory: where one
disagrees with the code, the code is wrong.

## Read before you write

| Document                                           | Governs                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| [docs/design-language.md](docs/design-language.md) | How any page looks and is laid out. Eight rules, each checkable. |
| [docs/content-model.md](docs/content-model.md)     | How game content is shaped, stored, referenced, and put in play. |
| [src/db/README.md](src/db/README.md)               | Schema and migrations.                                           |
| [docs/handoff/](docs/handoff/README.md)            | The state of the typed-homebrew work and how it was verified.    |

**`src/db/schema.ts` and `src/db/migrations/*.sql` are hand-written and edited together,
in the same change.** There is no drizzle-kit generate step here, and reaching for one
produces SQL nothing applies and a schema nothing matches. This is the rule that gets
broken most.

## What must pass

```bash
npm run check   # eslint + prettier
npm run build   # the only typecheck — `npm run check` does not run tsc
```

`.check-parse.ts` at the repo root carries **six pre-existing prettier errors**. They
are not yours; leave them exactly as they are, and read a run of `npm run check` as
clean when it reports those six and nothing else.

## Verifying

`docs/handoff/verifying-without-a-browser.md` is how server behaviour gets proven
without rendering: real accounts, real cookie jars, real server-action POSTs against a
production build. It is worth following. A typecheck cannot tell you that an equipped
shield resolved to the shield _spell_ and quietly cost the character 2 AC — that check
did.
