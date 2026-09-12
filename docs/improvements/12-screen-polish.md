# 12 — The screen itself: control heights, being reached, sound

Covers from `improvements.txt`: _dropdown, number input and text input on one
line are not the same height_, _"it's your turn" reaching a player on another
tab_, _ambient sound_. (Phone landscape is in 02; keyboard shortcuts in 11.)

No dependencies. Any of the three can be picked up alone.

## Today

- HeroUI controls are used with mixed `size` props: `Input size="sm"` beside a
  `Select` at its default, a `NumberInput` at another. Nine rows in
  `ChecksPanel`, ten in `HandoutsPanel`, thirty in `BattleBoard`'s rail, plus
  `RollPanel`, `NotebookPanel`, `CampaignManageForm`, `EncounterPlanner`.
- `docs/design-language.md` has eight rules and none about control sizing;
  its note about `space-y-*` between HeroUI controls is the nearest thing.
- `TableProvider.tsx` already has a per-viewer `sound` preference and a
  `chime()` on announced events (`preferences.ts`, off by default), and a
  corner slip per event kind. It does nothing to the tab title and does not
  use the Notification API.
- Images are the only uploaded media (`campaign-images.ts`, `uploads.ts`,
  role-checked route).

## Design

### Control heights

1. **Write the rule.** Add rule nine to `docs/design-language.md`: _Controls on
   one row share one `size`. Panels use `sm`; forms use `md`; nothing mixes
   inside a row._ Checkable by grepping a file for two different `size=` values
   inside one flex row.
2. **A primitive.** `src/@shared/components/ui/ControlRow.tsx`:

   ```tsx
   <ControlRow size="sm" align="end">   // sets `size` on every HeroUI child via context, wraps in `flex flex-wrap items-end gap-2`
   ```

   HeroUI controls read `size` from props only, so `ControlRow` clones its
   direct children with the size when they do not set one. Not magic — a
   child that sets its own `size` is a lint failure (below).

3. **Lint it.** An ESLint rule in the repo's local plugin (there is a
   `.eslintrc`/flat config already; add `hero-nexus/one-size-per-row`) that
   flags two different literal `size=` values among the JSX children of one
   element whose `className` contains `flex` and no `flex-col`. Cheap and
   catches the regression class.
4. **Audit.** The files above, in one pass, screenshotting each row before and
   after in both palettes. `Select`'s label placement (`labelPlacement="outside"`
   vs inside) is the usual culprit for the extra height; standardise on
   `outside-left` for rows and `outside` for stacked forms.

### Being reached

All client-side, all in `TableProvider` / `preferences.ts`, all per viewer:

- **Tab title**: while the document is hidden and something addressed to the
  viewer arrives (a `turn` with `characterId === viewerCharacterId`, a `check`
  targeting them, a `whisper` to them, a `consent` ask from 07), prefix the
  title with `(1) ` and a glyph — `⚔ (1) Hero Nexus` — reset on `visibilitychange`.
- **Browser notification**: a new preference `notify: 'off' | 'addressed' |
'all'` (default `off`, the same reasoning `sound` gives). When on and
  permission is granted, `new Notification(describe(event))` for the same
  addressed kinds; clicking focuses the tab. Permission is requested from the
  preferences popover on a user gesture, never on load. No push service — the
  tab has to be open, and that is the point: this is for the player on another
  tab, not another device.
- **Distinct chimes**: `chime(kind)` gets a second tone for "addressed to you"
  so a DM's laptop can tell an ask being answered from a whisper arriving.
  Synthesised with `AudioContext` as today; no files.
- **Your turn, unmissable**: the existing `turn` slip for the viewer's own
  character becomes a persistent banner across the top of the screen until
  they act or dismiss it, gold, with the pips from 05 when that exists.

### Ambient sound

Optional and last. A DM uploads tracks the way they upload images, plays one
for the table, players hear it only if they opt in.

```sql
-- 0060_campaign_audio.sql
CREATE TABLE campaign_audio (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  file_path TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  duration_seconds INTEGER,
  uploaded_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE campaigns ADD COLUMN ambience TEXT;   -- JSON { audioId, startedAt, loop: bool, volume: 0..1 } | NULL
ALTER TABLE battle_maps ADD COLUMN audio_id TEXT REFERENCES campaign_audio(id) ON DELETE SET NULL;
```

- Upload through `uploads.ts` with an audio allow-list (`audio/mpeg`,
  `audio/ogg`, `audio/wav`), size-capped like images, served by
  `/api/campaigns/[id]/audio/[audioId]` behind `requireCampaignRole` — the same
  shape as the image route. No outbound calls; the file is the campaign's.
- `setAmbience(campaignId, { audioId, loop, volume } | null)` writes the
  column, bumps, publishes an `ambience` event. `LiveState.ambience` carries
  it. A board with `audio_id` sets it when it becomes active and clears it when
  the fight ends (a "keep playing" flag on the DM's control).
- Client: one `<audio>` in `TableProvider`, seeking to `now − startedAt` (mod
  duration when looping) so late joiners are in sync within a second. Players
  have a preference `ambience: boolean`, **default off**, and a volume; the
  ribbon shows a speaker glyph when something is playing so they know there is
  something to turn on. Autoplay policy: the first play needs a gesture — the
  glyph is it.
- Storage cost is the DM's disk; `deploy.md` gets a line about it, and the
  campaign package (sharing-model rule 5) lists `campaign_audio` under
  `NEVER_CARRIED` — a soundtrack is not a thing to publish.

## Verification

- Control heights: the lint rule fails on a fixture and passes the audited
  files; screenshots of every audited row in both palettes.
- Reached: with the tab hidden, an ask addressed to the viewer changes the
  title and, with `notify: 'addressed'`, raises one notification; a roll does
  not.
- Ambience: a player's request for `/api/campaigns/[id]/audio/[x]` at a table
  they are not a member of → 403; two browsers joining ten seconds apart play
  within a second of each other.

## Out of scope

Voice or video, a soundboard of one-shot effects (the same table can carry
them later with a `kind` column), music from any streaming service.
