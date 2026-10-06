# Offline, phase B — queued writes (not built)

Phase A (shipped) is read-only: the session screen and a hero's play page keep
the last state this device saw, with an offline banner, and dice roll locally
as "offline roll, not logged". Phase B is the first writes that survive a
dropped connection. It is its own piece of work, because writes are server
actions (37 `'use server'` files) and queueing them in general is a design
problem, not a feature.

## Scope

Only three things a player changes on their own hero, mid-fight, without the
DM's hand in it:

- hit points (damage, healing, temporary HP),
- conditions on their own hero,
- death saves.

Nothing else queues. A whisper, a check answer, a purchase or anything a DM
does stays online-only, and the control says so while offline.

## Shape

- A queue in IndexedDB, keyed by user id (cleared on sign-out with the
  caches), of `{ characterId, kind, payload, at }`.
- **Last writer wins**, per field, by `at`. The server's current value is not
  merged with; the queued value replaces it. HP is a number the table reads
  aloud — a merge rule nobody can explain is worse than an overwrite everybody
  can.
- Replayed in order when the network answers (`online`, and the banner's
  probe), through the existing actions, one at a time.
- **Visible:** "3 changes waiting to sync" beside the banner, and each
  replayed write then appears in Table log as normal. A write the server
  refuses on replay (the hero left the table, the DM locked HP) is shown and
  dropped, never retried forever.

## Open questions for the owner

- Should a DM see that a player's numbers changed offline ("synced 2 changes
  from Kessa")?
- Death saves have rules weight (three failures is death). Is a queued third
  failure applied, or held for the DM?
