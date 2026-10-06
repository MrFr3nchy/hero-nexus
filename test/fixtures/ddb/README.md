# D&D Beyond fixtures

`hand-made-*.json` are written by hand to the commonly used shape of the
unofficial character service (`character/v5/character/<id>`), with the
`{ id, success, message, data }` wrapper. They are not real exports.

To add a real one: open a **public** character's JSON from that endpoint in a
browser, save it here as `<something>.json`, and run `npm test`. Every file in
this folder is read by `src/@creator/character/lib/ddb-import.test.ts`, which
asserts it parses and builds a sheet the schema accepts. Add a specific
assertion for anything the real file teaches us.
